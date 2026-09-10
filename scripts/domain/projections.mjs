import { PARTICIPANT_STATUS, POLL_TYPE } from "../constants.mjs";

/**
 * Allowlist projections over a poll record. Every projection lists exactly
 * the fields it copies — never a spread of the source record — so a new
 * private field added upstream cannot silently leak through an old
 * projection. No Foundry globals.
 *
 * Expected `pollRecord` shape:
 * {
 *   snapshot: { title, description, pollType, options, allowMultipleSelections,
 *     maxSelections, secretVote, liveResults, weightedVote, timedVote,
 *     quorumEnabled, quorumPercent, proposalRule, supermajorityThreshold,
 *     supermajorityBasis, participants: [{ id, displayName, ownerUserIds,
 *     weight, hidden }], startedAt, deadline },
 *   participants: [{ id, status }],           // PARTICIPANT_STATUS values
 *   ballots: Map<participantId, { submittedByUserId, choice, optionIds,
 *     abstained, acceptedAt, overridden, resetCount }>,
 *   result: { status, totals, tally, support, winners },
 * }
 */

/** Aggregate-only report. Must never identify who voted for what. */
export function buildResultOnlyProjection(pollRecord) {
  const { snapshot, result } = pollRecord;

  return {
    title: snapshot.title,
    description: snapshot.description,
    pollType: snapshot.pollType,
    settings: {
      secretVote: snapshot.secretVote,
      liveResults: snapshot.liveResults,
      weightedVote: snapshot.weightedVote,
      timedVote: snapshot.timedVote,
      quorumEnabled: snapshot.quorumEnabled,
      quorumPercent: snapshot.quorumEnabled ? snapshot.quorumPercent : null,
      proposalRule: snapshot.pollType === POLL_TYPE.PROPOSAL ? snapshot.proposalRule : null,
      supermajorityThreshold: snapshot.supermajorityThreshold ?? null,
      supermajorityBasis: snapshot.supermajorityBasis ?? null,
    },
    outcome: {
      status: result.status,
      winners: result.winners ?? null,
      tally: result.tally ?? null,
      support: result.support ?? null,
    },
    turnout: result.totals
      ? {
          eligibleCount: result.totals.ECount,
          eligibleWeight: snapshot.weightedVote ? result.totals.EWeight : null,
          submittedCount: result.totals.PCount,
          submittedWeight: snapshot.weightedVote ? result.totals.PWeight : null,
          absentCount: result.totals.AbsentCount,
          absentWeight: snapshot.weightedVote ? result.totals.AbsentWeight : null,
        }
      : null,
    abstainedCount: countByStatus(pollRecord.participants, PARTICIPANT_STATUS.ABSTAINED),
    excludedCount: countByStatus(pollRecord.participants, PARTICIPANT_STATUS.EXCLUDED),
  };
}

function countByStatus(participants, status) {
  return (participants ?? []).filter((participant) => participant.status === status).length;
}

/**
 * Active-poll player view: participation state only, never a choice, an
 * identity, or a link between the two. Matches the Secret Vote / Live
 * Results visibility matrix in product-contract.md.
 */
export function buildParticipationProjection(pollRecord) {
  return (pollRecord.participants ?? []).map((participant) => ({
    id: participant.id,
    voted:
      participant.status === PARTICIPANT_STATUS.SUBMITTED ||
      participant.status === PARTICIPANT_STATUS.ABSTAINED,
  }));
}

/**
 * Live aggregate counts only — permitted when Live Results is on, still no
 * identities or participant-choice links.
 */
export function buildLiveAggregateProjection(pollRecord) {
  const { result } = pollRecord;
  return {
    tally: result.tally ?? null,
    support: result.support ? Object.fromEntries(result.support) : null,
    totals: result.totals ?? null,
  };
}

/**
 * Full GM audit projection: every field, explicitly enumerated so a leak
 * still requires editing this allowlist. Never exposed to non-GM clients.
 */
export function buildFullAuditProjection(pollRecord) {
  const { snapshot, participants, ballots, result } = pollRecord;

  return {
    snapshot,
    result,
    participants: (participants ?? []).map((participant) => {
      const snapshotEntry = (snapshot.participants ?? []).find((p) => p.id === participant.id);
      const ballot = ballots?.get(participant.id) ?? null;
      return {
        id: participant.id,
        displayName: snapshotEntry?.name ?? null,
        ownerUserIds: snapshotEntry?.ownerUserIds ?? [],
        weight: snapshotEntry?.weight ?? 1,
        status: participant.status,
        ballot,
      };
    }),
  };
}
