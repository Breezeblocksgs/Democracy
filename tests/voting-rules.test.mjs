import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeTotals,
  checkQuorum,
  tallyProposal,
  evaluateProposalRule,
  tallyChoice,
  evaluateChoiceOutcome,
  resolvePoll,
  meetsAtLeast,
  strictlyGreaterThanHalf,
} from "../scripts/domain/voting-rules.mjs";
import {
  POLL_TYPE,
  PROPOSAL_CHOICE,
  PROPOSAL_RULE,
  SUPERMAJORITY_BASIS,
  SUPERMAJORITY_PRESET,
  OUTCOME_STATUS,
} from "../scripts/constants.mjs";

function participant(id, weight = 1, excluded = false) {
  return { id, weight, excluded };
}

function baseSnapshot(overrides = {}) {
  return {
    pollType: POLL_TYPE.PROPOSAL,
    proposalRule: PROPOSAL_RULE.SIMPLE_MAJORITY,
    weightedVote: false,
    quorumEnabled: false,
    quorumPercent: 50,
    supermajorityBasis: SUPERMAJORITY_BASIS.VALID_VOTES,
    supermajorityThreshold: SUPERMAJORITY_PRESET.TWO_THIRDS,
    participants: [participant("p1"), participant("p2"), participant("p3"), participant("p4")],
    ...overrides,
  };
}

function proposalBallots(entries) {
  return new Map(Object.entries(entries).map(([id, choice]) => [id, { choice }]));
}

test("strictlyGreaterThanHalf and meetsAtLeast use exact comparison, not rounding", () => {
  assert.equal(strictlyGreaterThanHalf(1, 2), false); // exactly half fails
  assert.equal(strictlyGreaterThanHalf(2, 3), true);
  assert.equal(meetsAtLeast(1, 2, 1, 2), true); // exactly half passes "at least"
  assert.equal(meetsAtLeast(1, 2, 5001, 10000), false);
});

test("computeTotals excludes excluded participants from every total", () => {
  const snapshot = baseSnapshot({
    participants: [participant("p1"), participant("p2", 1, true), participant("p3")],
  });
  const ballots = proposalBallots({ p1: PROPOSAL_CHOICE.APPROVE });
  const totals = computeTotals(snapshot, ballots);
  assert.equal(totals.ECount, 2);
  assert.equal(totals.PCount, 1);
  assert.equal(totals.AbsentCount, 1);
});

test("computeTotals throws when effective weight total is not a safe integer", () => {
  const snapshot = baseSnapshot({
    weightedVote: true,
    participants: [participant("p1", Number.MAX_SAFE_INTEGER), participant("p2", Number.MAX_SAFE_INTEGER)],
  });
  assert.throws(() => computeTotals(snapshot, new Map()), RangeError);
});

test("checkQuorum passes at exactly the configured threshold", () => {
  const snapshot = baseSnapshot({ quorumEnabled: true, quorumPercent: 50 });
  const totals = { ECount: 4, PCount: 2, EWeight: 4, PWeight: 2 };
  assert.equal(checkQuorum(snapshot, totals), true);
  assert.equal(checkQuorum(snapshot, { ...totals, PCount: 1 }), false);
});

test("Follow Majority delegates to the leading explicit side, never decides it", () => {
  const snapshot = baseSnapshot();
  const ballots = proposalBallots({
    p1: PROPOSAL_CHOICE.APPROVE,
    p2: PROPOSAL_CHOICE.DISAPPROVE,
    p3: PROPOSAL_CHOICE.DISAPPROVE,
    p4: PROPOSAL_CHOICE.FOLLOW_MAJORITY,
  });
  const tally = tallyProposal(snapshot, ballots);
  assert.equal(tally.A, 1);
  assert.equal(tally.D, 3); // 2 explicit + 1 follower
});

test("Follow Majority resolves to Abstain when explicit sides tie", () => {
  const snapshot = baseSnapshot();
  const ballots = proposalBallots({
    p1: PROPOSAL_CHOICE.APPROVE,
    p2: PROPOSAL_CHOICE.DISAPPROVE,
    p3: PROPOSAL_CHOICE.FOLLOW_MAJORITY,
  });
  const tally = tallyProposal(snapshot, ballots);
  assert.equal(tally.A, 1);
  assert.equal(tally.D, 1);
  assert.equal(tally.S, 1);
});

test("Simple Majority: exact half fails, no decisive vote is No Decision", () => {
  const snapshot = baseSnapshot({ proposalRule: PROPOSAL_RULE.SIMPLE_MAJORITY });
  const totals = { EWeight: 4, PWeight: 2 };
  const tie = tallyProposal(snapshot, proposalBallots({ p1: PROPOSAL_CHOICE.APPROVE, p2: PROPOSAL_CHOICE.DISAPPROVE }));
  assert.equal(evaluateProposalRule(snapshot, tie, totals), OUTCOME_STATUS.NOT_APPROVED);

  const onlyAbstain = tallyProposal(snapshot, proposalBallots({ p1: PROPOSAL_CHOICE.ABSTAIN }));
  assert.equal(evaluateProposalRule(snapshot, onlyAbstain, { EWeight: 4, PWeight: 1 }), OUTCOME_STATUS.NO_DECISION);
});

test("Absolute Majority: abstentions and absences count effectively against", () => {
  const snapshot = baseSnapshot({ proposalRule: PROPOSAL_RULE.ABSOLUTE_MAJORITY });
  const tally = tallyProposal(snapshot, proposalBallots({ p1: PROPOSAL_CHOICE.APPROVE, p2: PROPOSAL_CHOICE.APPROVE }));
  // 2 approve out of 4 eligible: exactly half fails
  assert.equal(evaluateProposalRule(snapshot, tally, { EWeight: 4 }), OUTCOME_STATUS.NOT_APPROVED);
  const tally3 = tallyProposal(
    snapshot,
    proposalBallots({ p1: PROPOSAL_CHOICE.APPROVE, p2: PROPOSAL_CHOICE.APPROVE, p3: PROPOSAL_CHOICE.APPROVE }),
  );
  assert.equal(evaluateProposalRule(snapshot, tally3, { EWeight: 4 }), OUTCOME_STATUS.APPROVED);
});

test("Majority of Participants: abstentions effectively against, absences excluded", () => {
  const snapshot = baseSnapshot({ proposalRule: PROPOSAL_RULE.MAJORITY_OF_PARTICIPANTS });
  // 4 submitted (2 approve + 2 abstain): A=2, P=4, exactly half fails
  const tally = tallyProposal(
    snapshot,
    proposalBallots({
      p1: PROPOSAL_CHOICE.APPROVE,
      p2: PROPOSAL_CHOICE.APPROVE,
      p3: PROPOSAL_CHOICE.ABSTAIN,
      p4: PROPOSAL_CHOICE.ABSTAIN,
    }),
  );
  assert.equal(evaluateProposalRule(snapshot, tally, { PWeight: 4 }), OUTCOME_STATUS.NOT_APPROVED);
  // 2 approve, 1 abstain: A=2, P=3, strictly more than half
  const tally2 = tallyProposal(
    snapshot,
    proposalBallots({ p1: PROPOSAL_CHOICE.APPROVE, p2: PROPOSAL_CHOICE.APPROVE, p3: PROPOSAL_CHOICE.ABSTAIN }),
  );
  assert.equal(evaluateProposalRule(snapshot, tally2, { PWeight: 3 }), OUTCOME_STATUS.APPROVED);
});

test("Unanimity of Voters requires zero disapprove and at least one approve", () => {
  const snapshot = baseSnapshot({ proposalRule: PROPOSAL_RULE.UNANIMITY_OF_VOTERS });
  const allApprove = tallyProposal(snapshot, proposalBallots({ p1: PROPOSAL_CHOICE.APPROVE, p2: PROPOSAL_CHOICE.ABSTAIN }));
  assert.equal(evaluateProposalRule(snapshot, allApprove, {}), OUTCOME_STATUS.APPROVED);
  const oneDisapproves = tallyProposal(
    snapshot,
    proposalBallots({ p1: PROPOSAL_CHOICE.APPROVE, p2: PROPOSAL_CHOICE.DISAPPROVE }),
  );
  assert.equal(evaluateProposalRule(snapshot, oneDisapproves, {}), OUTCOME_STATUS.NOT_APPROVED);
});

test("Unanimity of All Members requires every eligible weight to approve", () => {
  const snapshot = baseSnapshot({ proposalRule: PROPOSAL_RULE.UNANIMITY_OF_ALL_MEMBERS });
  const tally = tallyProposal(
    snapshot,
    proposalBallots({
      p1: PROPOSAL_CHOICE.APPROVE,
      p2: PROPOSAL_CHOICE.APPROVE,
      p3: PROPOSAL_CHOICE.APPROVE,
      p4: PROPOSAL_CHOICE.APPROVE,
    }),
  );
  assert.equal(evaluateProposalRule(snapshot, tally, { EWeight: 4 }), OUTCOME_STATUS.APPROVED);
  const missingOne = tallyProposal(
    snapshot,
    proposalBallots({ p1: PROPOSAL_CHOICE.APPROVE, p2: PROPOSAL_CHOICE.APPROVE, p3: PROPOSAL_CHOICE.APPROVE }),
  );
  assert.equal(evaluateProposalRule(snapshot, missingOne, { EWeight: 4 }), OUTCOME_STATUS.NOT_APPROVED);
});

test("Supermajority on Valid Votes basis returns No Decision when V is zero", () => {
  const snapshot = baseSnapshot({
    proposalRule: PROPOSAL_RULE.SUPERMAJORITY,
    supermajorityBasis: SUPERMAJORITY_BASIS.VALID_VOTES,
    supermajorityThreshold: SUPERMAJORITY_PRESET.TWO_THIRDS,
  });
  const tally = tallyProposal(snapshot, proposalBallots({ p1: PROPOSAL_CHOICE.ABSTAIN }));
  assert.equal(evaluateProposalRule(snapshot, tally, { EWeight: 4, PWeight: 1 }), OUTCOME_STATUS.NO_DECISION);
});

test("Supermajority two-thirds threshold is exact, not a rounded 66.7%", () => {
  const snapshot = baseSnapshot({
    proposalRule: PROPOSAL_RULE.SUPERMAJORITY,
    supermajorityBasis: SUPERMAJORITY_BASIS.VALID_VOTES,
    supermajorityThreshold: SUPERMAJORITY_PRESET.TWO_THIRDS,
    participants: [participant("p1"), participant("p2"), participant("p3")],
  });
  // 2 approve, 1 disapprove: V=3, A/V = 2/3 exactly -> meets "at least 2/3"
  const tally = tallyProposal(
    snapshot,
    proposalBallots({ p1: PROPOSAL_CHOICE.APPROVE, p2: PROPOSAL_CHOICE.APPROVE, p3: PROPOSAL_CHOICE.DISAPPROVE }),
  );
  assert.equal(evaluateProposalRule(snapshot, tally, { EWeight: 3, PWeight: 3 }), OUTCOME_STATUS.APPROVED);
});

test("Choice: winner, tie, and no-decision", () => {
  const snapshot = { options: [{ id: "a" }, { id: "b" }, { id: "c" }], weightedVote: false, participants: [
    participant("p1"), participant("p2"), participant("p3"),
  ] };

  const winnerSupport = tallyChoice(snapshot, new Map([
    ["p1", { optionIds: ["a"] }],
    ["p2", { optionIds: ["a"] }],
    ["p3", { optionIds: ["b"] }],
  ]));
  assert.deepEqual(evaluateChoiceOutcome(snapshot, winnerSupport), { status: OUTCOME_STATUS.WINNER, winners: ["a"] });

  const tieSupport = tallyChoice(snapshot, new Map([
    ["p1", { optionIds: ["a"] }],
    ["p2", { optionIds: ["b"] }],
  ]));
  assert.deepEqual(evaluateChoiceOutcome(snapshot, tieSupport), {
    status: OUTCOME_STATUS.TIED_RESULT,
    winners: ["a", "b"],
  });

  const noSupport = tallyChoice(snapshot, new Map([["p1", { abstained: true }]]));
  assert.deepEqual(evaluateChoiceOutcome(snapshot, noSupport), { status: OUTCOME_STATUS.NO_DECISION, winners: [] });
});

test("Choice: multi-selection gives full weight to every selected option", () => {
  const snapshot = { options: [{ id: "a" }, { id: "b" }], weightedVote: false, participants: [participant("p1")] };
  const support = tallyChoice(snapshot, new Map([["p1", { optionIds: ["a", "b"] }]]));
  assert.equal(support.get("a"), 1);
  assert.equal(support.get("b"), 1);
});

test("resolvePoll returns Cancelled without running quorum or tally", () => {
  const snapshot = baseSnapshot();
  assert.deepEqual(resolvePoll(snapshot, new Map(), { cancelled: true }), { status: OUTCOME_STATUS.CANCELLED });
});

test("resolvePoll returns Quorum Not Met before No Decision or the outcome rule", () => {
  const snapshot = baseSnapshot({ quorumEnabled: true, quorumPercent: 75 });
  const result = resolvePoll(snapshot, proposalBallots({ p1: PROPOSAL_CHOICE.APPROVE }));
  assert.equal(result.status, OUTCOME_STATUS.QUORUM_NOT_MET);
});

test("resolvePoll returns No Decision when nobody submitted a ballot", () => {
  const snapshot = baseSnapshot();
  const result = resolvePoll(snapshot, new Map());
  assert.equal(result.status, OUTCOME_STATUS.NO_DECISION);
});

test("resolvePoll end-to-end for a Choice poll", () => {
  const snapshot = {
    pollType: POLL_TYPE.CHOICE,
    weightedVote: false,
    quorumEnabled: false,
    options: [{ id: "a" }, { id: "b" }],
    participants: [participant("p1"), participant("p2")],
  };
  const result = resolvePoll(snapshot, new Map([
    ["p1", { optionIds: ["a"] }],
    ["p2", { optionIds: ["a"] }],
  ]));
  assert.equal(result.status, OUTCOME_STATUS.WINNER);
  assert.deepEqual(result.winners, ["a"]);
});
