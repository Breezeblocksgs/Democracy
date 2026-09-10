import assert from "node:assert/strict";
import { test } from "node:test";

import { validateBallotSubmission, isAbstainPayload } from "../scripts/domain/ballot-validation.mjs";
import { POLL_TYPE, PROPOSAL_CHOICE } from "../scripts/constants.mjs";

test("isAbstainPayload recognizes a Proposal 'abstain' choice as an abstention", () => {
  assert.equal(isAbstainPayload(POLL_TYPE.PROPOSAL, { choice: PROPOSAL_CHOICE.ABSTAIN }), true);
  assert.equal(isAbstainPayload(POLL_TYPE.PROPOSAL, { choice: PROPOSAL_CHOICE.APPROVE }), false);
});

test("isAbstainPayload recognizes an explicit Choice-poll abstention flag", () => {
  assert.equal(isAbstainPayload(POLL_TYPE.CHOICE, { abstained: true }), true);
  assert.equal(isAbstainPayload(POLL_TYPE.CHOICE, { optionIds: ["a"] }), false);
});

function proposalSnapshot() {
  return {
    pollType: POLL_TYPE.PROPOSAL,
    deadline: null,
    participants: [{ id: "p1", ownerUserIds: ["u1"] }],
  };
}

function choiceSnapshot(overrides = {}) {
  return {
    pollType: POLL_TYPE.CHOICE,
    deadline: null,
    allowMultipleSelections: false,
    maxSelections: 1,
    options: [{ id: "a" }, { id: "b" }],
    participants: [{ id: "p1", ownerUserIds: ["u1"] }],
    ...overrides,
  };
}

function baseArgs(overrides = {}) {
  return {
    snapshot: proposalSnapshot(),
    participantStatuses: [{ id: "p1", status: "pending" }],
    participantId: "p1",
    submittingUserId: "u1",
    isGmOverride: false,
    payload: { choice: PROPOSAL_CHOICE.APPROVE },
    now: 1000,
    ...overrides,
  };
}

test("accepts a valid proposal ballot from the eligible owner", () => {
  assert.equal(validateBallotSubmission(baseArgs()), null);
});

test("rejects an unknown participant", () => {
  assert.equal(validateBallotSubmission(baseArgs({ participantId: "ghost" })), "unknown-participant");
});

test("rejects a submission for an excluded participant", () => {
  assert.equal(
    validateBallotSubmission(baseArgs({ participantStatuses: [{ id: "p1", status: "excluded" }] })),
    "not-eligible",
  );
});

test("rejects a second submission for an already-submitted participant", () => {
  assert.equal(
    validateBallotSubmission(baseArgs({ participantStatuses: [{ id: "p1", status: "submitted" }] })),
    "already-submitted",
  );
});

test("rejects a non-owner who is not a GM override", () => {
  assert.equal(validateBallotSubmission(baseArgs({ submittingUserId: "u-stranger" })), "not-owner");
});

test("accepts a GM override for a non-owner", () => {
  assert.equal(
    validateBallotSubmission(baseArgs({ submittingUserId: "u-stranger", isGmOverride: true })),
    null,
  );
});

test("GM can vote an unowned NPC without an override flag", () => {
  const snapshot = { ...proposalSnapshot(), participants: [{ id: "p1", ownerUserIds: [], isNpc: true }] };
  assert.equal(
    validateBallotSubmission(baseArgs({ snapshot, submittingUserId: "gm-1", isSubmittingUserGm: true })),
    null,
  );
});

test("a non-GM cannot vote an unowned NPC just by claiming to be its owner", () => {
  const snapshot = { ...proposalSnapshot(), participants: [{ id: "p1", ownerUserIds: [], isNpc: true }] };
  assert.equal(
    validateBallotSubmission(baseArgs({ snapshot, submittingUserId: "player-1", isSubmittingUserGm: false })),
    "not-owner",
  );
});

test("rejects a submission after the deadline", () => {
  assert.equal(
    validateBallotSubmission(
      baseArgs({ snapshot: { ...proposalSnapshot(), deadline: 500 }, now: 1000 }),
    ),
    "deadline-passed",
  );
});

test("rejects an invalid proposal choice", () => {
  assert.equal(validateBallotSubmission(baseArgs({ payload: { choice: "not-a-choice" } })), "invalid-payload");
});

test("accepts a valid single-selection choice ballot", () => {
  const args = baseArgs({
    snapshot: choiceSnapshot(),
    payload: { optionIds: ["a"] },
  });
  assert.equal(validateBallotSubmission(args), null);
});

test("rejects a choice ballot exceeding the single-selection limit", () => {
  const args = baseArgs({
    snapshot: choiceSnapshot(),
    payload: { optionIds: ["a", "b"] },
  });
  assert.equal(validateBallotSubmission(args), "invalid-payload");
});

test("accepts a multi-selection choice ballot within the configured maximum", () => {
  const args = baseArgs({
    snapshot: choiceSnapshot({ allowMultipleSelections: true, maxSelections: 2 }),
    payload: { optionIds: ["a", "b"] },
  });
  assert.equal(validateBallotSubmission(args), null);
});

test("rejects a choice ballot with an option id not in the snapshot", () => {
  const args = baseArgs({
    snapshot: choiceSnapshot(),
    payload: { optionIds: ["ghost-option"] },
  });
  assert.equal(validateBallotSubmission(args), "invalid-payload");
});

test("accepts an explicit abstention with no option ids", () => {
  const args = baseArgs({
    snapshot: choiceSnapshot(),
    payload: { abstained: true },
  });
  assert.equal(validateBallotSubmission(args), null);
});

test("rejects an empty option selection that is not an explicit abstention", () => {
  const args = baseArgs({
    snapshot: choiceSnapshot(),
    payload: { optionIds: [] },
  });
  assert.equal(validateBallotSubmission(args), "invalid-payload");
});
