import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveWinnerLabels, computeChoiceResultSummary } from "../scripts/domain/outcome-display.mjs";

test("resolveWinnerLabels maps winner ids back to labels in option order", () => {
  const options = [{ id: "a", label: "Cats" }, { id: "b", label: "Dogs" }, { id: "c", label: "Birds" }];
  assert.deepEqual(resolveWinnerLabels(options, ["c", "a"]), ["Cats", "Birds"]);
});

test("resolveWinnerLabels returns an empty array when there are no winners", () => {
  assert.deepEqual(resolveWinnerLabels([{ id: "a", label: "Cats" }], []), []);
  assert.deepEqual(resolveWinnerLabels([{ id: "a", label: "Cats" }], null), []);
});

const OPTIONS = [{ id: "a", label: "Cats" }, { id: "b", label: "Dogs" }];

test("computeChoiceResultSummary reports the single winner with a vote count and percentage", () => {
  const outcome = { winners: ["a"], support: { a: 3, b: 1 } };
  assert.deepEqual(computeChoiceResultSummary(outcome, OPTIONS), {
    tied: false,
    winnerLabels: ["Cats"],
    votes: 3,
    percentage: 75,
  });
});

test("computeChoiceResultSummary reports a tie with every tied label", () => {
  const outcome = { winners: ["a", "b"], support: { a: 2, b: 2 } };
  const summary = computeChoiceResultSummary(outcome, OPTIONS);
  assert.equal(summary.tied, true);
  assert.deepEqual(summary.winnerLabels, ["Cats", "Dogs"]);
});

test("computeChoiceResultSummary handles no votes cast", () => {
  const outcome = { winners: [], support: { a: 0, b: 0 } };
  assert.deepEqual(computeChoiceResultSummary(outcome, OPTIONS), {
    tied: false,
    winnerLabels: [],
    votes: 0,
    percentage: 0,
  });
});
