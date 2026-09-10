import assert from "node:assert/strict";
import { test } from "node:test";

import { computeLiveTally, formatLiveTallyRows } from "../scripts/domain/live-tally.mjs";
import { POLL_TYPE, PROPOSAL_CHOICE } from "../scripts/constants.mjs";

test("computeLiveTally returns a plain, JSON-safe object for Proposal polls", () => {
  const snapshot = { pollType: POLL_TYPE.PROPOSAL, weightedVote: false, participants: [{ id: "p1" }, { id: "p2" }] };
  const ballots = new Map([
    ["p1", { choice: PROPOSAL_CHOICE.APPROVE }],
    ["p2", { choice: PROPOSAL_CHOICE.FOLLOW_MAJORITY }],
  ]);
  const live = computeLiveTally(snapshot, ballots);
  assert.deepEqual(live, { approve: 1, disapprove: 0, abstain: 0, pendingDelegation: 1 });
  assert.equal(JSON.stringify(live), JSON.stringify(JSON.parse(JSON.stringify(live))));
});

test("computeLiveTally returns a plain, JSON-safe object for Choice polls (not a Map)", () => {
  const snapshot = {
    pollType: POLL_TYPE.CHOICE,
    weightedVote: false,
    options: [{ id: "a" }, { id: "b" }],
    participants: [{ id: "p1" }],
  };
  const ballots = new Map([["p1", { optionIds: ["a"] }]]);
  const live = computeLiveTally(snapshot, ballots);
  assert.equal(live instanceof Map, false);
  assert.deepEqual(live, { a: 1, b: 0 });
  // Survives an actual JSON round trip the way Setting/flag storage would do it.
  assert.deepEqual(JSON.parse(JSON.stringify(live)), { a: 1, b: 0 });
});

test("formatLiveTallyRows returns null when there is no tally yet", () => {
  assert.equal(formatLiveTallyRows(POLL_TYPE.PROPOSAL, null, [], {}), null);
});

test("formatLiveTallyRows shapes Proposal rows in a fixed order", () => {
  const rows = formatLiveTallyRows(
    POLL_TYPE.PROPOSAL,
    { approve: 2, disapprove: 1, abstain: 0, pendingDelegation: 3 },
    [],
    { approve: "Approve", disapprove: "Disapprove", abstain: "Abstain", pendingDelegation: "Pending" },
  );
  assert.deepEqual(rows, {
    rows: [
      { label: "Approve", count: 2 },
      { label: "Disapprove", count: 1 },
      { label: "Abstain", count: 0 },
      { label: "Pending", count: 3 },
    ],
  });
});

test("formatLiveTallyRows shapes Choice rows from the option list, defaulting missing entries to zero", () => {
  const rows = formatLiveTallyRows(
    POLL_TYPE.CHOICE,
    { a: 2 },
    [{ id: "a", label: "Cats" }, { id: "b", label: "Dogs" }],
    {},
  );
  assert.deepEqual(rows, { rows: [{ label: "Cats", count: 2 }, { label: "Dogs", count: 0 }] });
});
