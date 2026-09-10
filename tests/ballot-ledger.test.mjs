import assert from "node:assert/strict";
import { test } from "node:test";

import { buildActiveBallotMap } from "../scripts/domain/ballot-ledger.mjs";

test("keeps the latest ballot per participant in submission order", () => {
  const map = buildActiveBallotMap([
    { participantId: "p1", payload: { choice: "approve" } },
    { participantId: "p2", payload: { choice: "disapprove" } },
  ]);
  assert.deepEqual(map.get("p1"), { choice: "approve" });
  assert.deepEqual(map.get("p2"), { choice: "disapprove" });
});

test("a reset (invalidated) ballot removes the participant until resubmission", () => {
  const map = buildActiveBallotMap([
    { participantId: "p1", payload: { choice: "approve" } },
    { participantId: "p1", invalidated: true },
  ]);
  assert.equal(map.has("p1"), false);
});

test("resubmission after reset is reflected as the active ballot", () => {
  const map = buildActiveBallotMap([
    { participantId: "p1", payload: { choice: "approve" } },
    { participantId: "p1", invalidated: true },
    { participantId: "p1", payload: { choice: "disapprove" } },
  ]);
  assert.deepEqual(map.get("p1"), { choice: "disapprove" });
});
