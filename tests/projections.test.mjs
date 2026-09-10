import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildResultOnlyProjection,
  buildParticipationProjection,
  buildFullAuditProjection,
} from "../scripts/domain/projections.mjs";
import { POLL_TYPE, PARTICIPANT_STATUS, OUTCOME_STATUS } from "../scripts/constants.mjs";

const FORBIDDEN_FIXTURE_VALUES = [
  "Secret Player Name",
  "user-secret-1234",
  "token-secret-5678",
  "actor-secret-9999",
];

function fixturePollRecord() {
  return {
    snapshot: {
      title: "Should we open the gate?",
      description: "A test proposal.",
      pollType: POLL_TYPE.PROPOSAL,
      secretVote: true,
      liveResults: false,
      weightedVote: false,
      timedVote: false,
      quorumEnabled: false,
      quorumPercent: 50,
      proposalRule: "simple-majority",
      supermajorityThreshold: null,
      supermajorityBasis: null,
      participants: [
        {
          id: "p1",
          name: "Secret Player Name",
          ownerUserIds: ["user-secret-1234"],
          weight: 1,
          tokenId: "token-secret-5678",
          actorId: "actor-secret-9999",
        },
      ],
    },
    participants: [{ id: "p1", status: PARTICIPANT_STATUS.SUBMITTED }],
    ballots: new Map([
      ["p1", { submittedByUserId: "user-secret-1234", choice: "approve", acceptedAt: 1 }],
    ]),
    result: {
      status: OUTCOME_STATUS.APPROVED,
      totals: { ECount: 1, EWeight: 1, PCount: 1, PWeight: 1, AbsentCount: 0, AbsentWeight: 0 },
      tally: { A: 1, D: 0, S: 0, V: 1 },
    },
  };
}

test("Result Only projection contains none of the private fixture values", () => {
  const projection = buildResultOnlyProjection(fixturePollRecord());
  const serialized = JSON.stringify(projection);
  for (const forbidden of FORBIDDEN_FIXTURE_VALUES) {
    assert.equal(serialized.includes(forbidden), false, `leaked: ${forbidden}`);
  }
});

test("Result Only projection has no participant-level fields at all", () => {
  const projection = buildResultOnlyProjection(fixturePollRecord());
  assert.equal("participants" in projection, false);
  assert.equal("ballots" in projection, false);
});

test("Participation projection exposes only id and voted boolean, never a choice", () => {
  const projection = buildParticipationProjection(fixturePollRecord());
  assert.deepEqual(projection, [{ id: "p1", voted: true }]);
});

test("Full audit projection does carry identity fields for GM-only use", () => {
  const projection = buildFullAuditProjection(fixturePollRecord());
  assert.equal(projection.participants[0].displayName, "Secret Player Name");
  assert.equal(projection.participants[0].ballot.choice, "approve");
});
