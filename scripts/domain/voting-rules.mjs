import {
  POLL_TYPE,
  PROPOSAL_CHOICE,
  PROPOSAL_RULE,
  SUPERMAJORITY_BASIS,
  OUTCOME_STATUS,
} from "../constants.mjs";

/**
 * Pure tally engine. Consumes a frozen poll snapshot plus accepted ballot
 * receipts and produces a finalized outcome. No Foundry globals, no
 * rounded-percentage decisions — every comparison is an exact integer or
 * BigInt ratio comparison per voting-rules.md.
 */

function effectiveWeight(snapshot, participant) {
  return snapshot.weightedVote ? participant.weight : 1;
}

/** a/b >= numerator/denominator, exact via BigInt cross multiplication. */
export function meetsAtLeast(a, b, numerator, denominator) {
  if (b === 0) return false;
  return BigInt(a) * BigInt(denominator) >= BigInt(b) * BigInt(numerator);
}

/** a/b > 1/2, exact via BigInt cross multiplication. */
export function strictlyGreaterThanHalf(a, b) {
  if (b === 0) return false;
  return 2n * BigInt(a) > BigInt(b);
}

function assertSafeWeightTotal(total) {
  if (!Number.isSafeInteger(total)) {
    throw new RangeError("Poll snapshot total effective weight is not a safe integer.");
  }
}

/**
 * Compute canonical eligible/participation totals. Excluded participants
 * contribute to none of these values.
 */
export function computeTotals(snapshot, ballots) {
  let ECount = 0;
  let EWeight = 0;
  let PCount = 0;
  let PWeight = 0;

  for (const participant of snapshot.participants) {
    if (participant.excluded) continue;
    const weight = effectiveWeight(snapshot, participant);
    ECount += 1;
    EWeight += weight;
    if (ballots.get(participant.id)) {
      PCount += 1;
      PWeight += weight;
    }
  }

  assertSafeWeightTotal(EWeight);
  assertSafeWeightTotal(PWeight);

  return {
    ECount,
    EWeight,
    PCount,
    PWeight,
    AbsentCount: ECount - PCount,
    AbsentWeight: EWeight - PWeight,
  };
}

/** Quorum measures submitted ballots (including abstentions) against eligibility. */
export function checkQuorum(snapshot, totals) {
  if (!snapshot.quorumEnabled) return true;
  const thresholdBasisPoints = Math.round(snapshot.quorumPercent * 100);
  return snapshot.weightedVote
    ? meetsAtLeast(totals.PWeight, totals.EWeight, thresholdBasisPoints, 10000)
    : meetsAtLeast(totals.PCount, totals.ECount, thresholdBasisPoints, 10000);
}

/**
 * Total explicit sides plus Follow Majority, then resolve delegation exactly
 * once. Followers never influence which explicit side is leading.
 */
export function tallyProposal(snapshot, ballots) {
  let A0 = 0;
  let D0 = 0;
  let S0 = 0;
  let F = 0;

  for (const participant of snapshot.participants) {
    if (participant.excluded) continue;
    const ballot = ballots.get(participant.id);
    if (!ballot) continue;
    const weight = effectiveWeight(snapshot, participant);
    switch (ballot.choice) {
      case PROPOSAL_CHOICE.APPROVE:
        A0 += weight;
        break;
      case PROPOSAL_CHOICE.DISAPPROVE:
        D0 += weight;
        break;
      case PROPOSAL_CHOICE.ABSTAIN:
        S0 += weight;
        break;
      case PROPOSAL_CHOICE.FOLLOW_MAJORITY:
        F += weight;
        break;
      default:
        break;
    }
  }

  let A = A0;
  let D = D0;
  let S = S0;
  if (A0 > D0) A = A0 + F;
  else if (D0 > A0) D = D0 + F;
  else S = S0 + F;

  return { A0, D0, S0, F, A, D, S, V: A + D };
}

function supermajorityBasisValue(snapshot, tally, totals) {
  switch (snapshot.supermajorityBasis) {
    case SUPERMAJORITY_BASIS.VALID_VOTES:
      return tally.V;
    case SUPERMAJORITY_BASIS.SUBMITTED_BALLOTS:
      return totals.PWeight;
    case SUPERMAJORITY_BASIS.ALL_ELIGIBLE:
    default:
      return totals.EWeight;
  }
}

/** Denominator for the primary approval percentage, per rule (voting-rules.md). */
export function proposalApprovalDenominator(snapshot, tally, totals) {
  switch (snapshot.proposalRule) {
    case PROPOSAL_RULE.SIMPLE_MAJORITY:
    case PROPOSAL_RULE.UNANIMITY_OF_VOTERS:
      return tally.V;
    case PROPOSAL_RULE.ABSOLUTE_MAJORITY:
    case PROPOSAL_RULE.UNANIMITY_OF_ALL_MEMBERS:
      return totals.EWeight;
    case PROPOSAL_RULE.MAJORITY_OF_PARTICIPANTS:
      return totals.PWeight;
    case PROPOSAL_RULE.SUPERMAJORITY:
      return supermajorityBasisValue(snapshot, tally, totals);
    default:
      return 0;
  }
}

/** Evaluate the selected Proposal rule against a resolved tally. */
export function evaluateProposalRule(snapshot, tally, totals) {
  const { A, D, V } = tally;
  const E = totals.EWeight;
  const P = totals.PWeight;

  switch (snapshot.proposalRule) {
    case PROPOSAL_RULE.SIMPLE_MAJORITY:
      if (V === 0) return OUTCOME_STATUS.NO_DECISION;
      return strictlyGreaterThanHalf(A, V) ? OUTCOME_STATUS.APPROVED : OUTCOME_STATUS.NOT_APPROVED;

    case PROPOSAL_RULE.ABSOLUTE_MAJORITY:
      return strictlyGreaterThanHalf(A, E) ? OUTCOME_STATUS.APPROVED : OUTCOME_STATUS.NOT_APPROVED;

    case PROPOSAL_RULE.MAJORITY_OF_PARTICIPANTS:
      return strictlyGreaterThanHalf(A, P) ? OUTCOME_STATUS.APPROVED : OUTCOME_STATUS.NOT_APPROVED;

    case PROPOSAL_RULE.UNANIMITY_OF_VOTERS:
      if (V === 0) return OUTCOME_STATUS.NO_DECISION;
      return D === 0 && A > 0 ? OUTCOME_STATUS.APPROVED : OUTCOME_STATUS.NOT_APPROVED;

    case PROPOSAL_RULE.UNANIMITY_OF_ALL_MEMBERS:
      return A === E && E > 0 ? OUTCOME_STATUS.APPROVED : OUTCOME_STATUS.NOT_APPROVED;

    case PROPOSAL_RULE.SUPERMAJORITY: {
      const basis = supermajorityBasisValue(snapshot, tally, totals);
      if (snapshot.supermajorityBasis === SUPERMAJORITY_BASIS.VALID_VOTES && basis === 0) {
        return OUTCOME_STATUS.NO_DECISION;
      }
      const { numerator, denominator } = snapshot.supermajorityThreshold;
      return meetsAtLeast(A, basis, numerator, denominator)
        ? OUTCOME_STATUS.APPROVED
        : OUTCOME_STATUS.NOT_APPROVED;
    }

    default:
      return OUTCOME_STATUS.NO_DECISION;
  }
}

/** support(o) = sum of effective weight of every accepted non-abstaining ballot selecting o. */
export function tallyChoice(snapshot, ballots) {
  const support = new Map(snapshot.options.map((option) => [option.id, 0]));

  for (const participant of snapshot.participants) {
    if (participant.excluded) continue;
    const ballot = ballots.get(participant.id);
    if (!ballot || ballot.abstained) continue;
    const weight = effectiveWeight(snapshot, participant);
    for (const optionId of ballot.optionIds ?? []) {
      support.set(optionId, (support.get(optionId) ?? 0) + weight);
    }
  }

  return support;
}

export function evaluateChoiceOutcome(snapshot, support) {
  const entries = snapshot.options.map((option) => ({
    id: option.id,
    support: support.get(option.id) ?? 0,
  }));
  const maxSupport = Math.max(0, ...entries.map((entry) => entry.support));

  if (maxSupport === 0) {
    return { status: OUTCOME_STATUS.NO_DECISION, winners: [] };
  }

  const winners = entries.filter((entry) => entry.support === maxSupport).map((entry) => entry.id);
  return {
    status: winners.length === 1 ? OUTCOME_STATUS.WINNER : OUTCOME_STATUS.TIED_RESULT,
    winners,
  };
}

/**
 * Resolve a closed poll snapshot in the exact order from voting-rules.md.
 * `ballots` is a Map keyed by participant id, value `{ choice }` for
 * Proposal ballots or `{ abstained, optionIds }` for Choice ballots.
 */
export function resolvePoll(snapshot, ballots, { cancelled = false } = {}) {
  if (cancelled) {
    return { status: OUTCOME_STATUS.CANCELLED };
  }

  const totals = computeTotals(snapshot, ballots);

  if (!checkQuorum(snapshot, totals)) {
    return { status: OUTCOME_STATUS.QUORUM_NOT_MET, totals };
  }

  if (totals.PCount === 0) {
    return { status: OUTCOME_STATUS.NO_DECISION, totals };
  }

  if (snapshot.pollType === POLL_TYPE.PROPOSAL) {
    const tally = tallyProposal(snapshot, ballots);
    const status = evaluateProposalRule(snapshot, tally, totals);
    return { status, totals, tally };
  }

  const support = tallyChoice(snapshot, ballots);
  const { status, winners } = evaluateChoiceOutcome(snapshot, support);
  // Plain object, not a Map — this result gets persisted through Document
  // flags (JSON-serialized), and a Map silently loses its data there.
  return { status, totals, support: Object.fromEntries(support), winners };
}
