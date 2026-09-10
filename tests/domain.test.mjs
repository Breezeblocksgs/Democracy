import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createOption,
  normalizeOptions,
  clampMaxSelections,
  defaultPollDraft,
  normalizeWeight,
  recoverPollDraft,
} from "../scripts/domain/schema.mjs";
import {
  validateTitle,
  validateDescription,
  validateOptions,
  validateMaxSelections,
  validateWeight,
  validateTimerSeconds,
  validateQuorumPercent,
  validateSupermajorityThreshold,
  validateStartReadiness,
} from "../scripts/domain/validation.mjs";
import { POLL_TYPE, PROPOSAL_RULE } from "../scripts/constants.mjs";

test("normalizeOptions preserves stable ids across edits", () => {
  const previous = [createOption("Yes"), createOption("No")];
  const edited = normalizeOptions(
    [{ label: "Yes, absolutely" }, { label: "No" }, { label: "Maybe" }],
    previous,
  );
  assert.equal(edited[0].id, previous[0].id);
  assert.equal(edited[1].id, previous[1].id);
  assert.notEqual(edited[2].id, undefined);
});

test("clampMaxSelections clamps to option count and floors below 1", () => {
  assert.equal(clampMaxSelections(5, 3), 3);
  assert.equal(clampMaxSelections(0, 3), 1);
  assert.equal(clampMaxSelections(Number.NaN, 3), 1);
});

test("normalizeWeight rejects malformed values and defaults to 1", () => {
  assert.equal(normalizeWeight(3), 3);
  assert.equal(normalizeWeight(0), 1);
  assert.equal(normalizeWeight(-2), 1);
  assert.equal(normalizeWeight(1.5), 1);
  assert.equal(normalizeWeight(Number.MAX_SAFE_INTEGER + 10), 1);
  assert.equal(normalizeWeight("3"), 1);
});

test("recoverPollDraft returns full defaults for garbage input", () => {
  const recovered = recoverPollDraft(null);
  const defaults = defaultPollDraft();
  assert.equal(recovered.title, defaults.title);
  assert.equal(recovered.pollType, defaults.pollType);
  assert.equal(recovered.options.length, defaults.options.length);
});

test("recoverPollDraft discards invalid pollType and re-derives options", () => {
  const recovered = recoverPollDraft({ pollType: "nonsense", options: [{ label: "x" }] });
  assert.equal(recovered.pollType, POLL_TYPE.PROPOSAL);
  assert.equal(recovered.options.length, defaultPollDraft().options.length);
  assert.ok(recovered.options.every((option) => option.label === ""));
});

test("recoverPollDraft clamps a stale maxSelections after option count shrinks", () => {
  const recovered = recoverPollDraft({
    pollType: POLL_TYPE.CHOICE,
    options: [{ label: "A" }, { label: "B" }],
    maxSelections: 10,
  });
  assert.equal(recovered.maxSelections, 2);
});

test("validateTitle boundaries", () => {
  assert.equal(validateTitle(""), false);
  assert.equal(validateTitle("   "), false);
  assert.equal(validateTitle("a".repeat(120)), true);
  assert.equal(validateTitle("a".repeat(121)), false);
});

test("validateDescription allows empty and enforces max length", () => {
  assert.equal(validateDescription(undefined), true);
  assert.equal(validateDescription(""), true);
  assert.equal(validateDescription("a".repeat(5000)), true);
  assert.equal(validateDescription("a".repeat(5001)), false);
});

test("validateOptions enforces count bounds and case-insensitive uniqueness", () => {
  assert.equal(validateOptions([{ label: "Only one" }]), false);
  assert.equal(
    validateOptions(Array.from({ length: 21 }, (_, i) => ({ label: `Option ${i}` }))),
    false,
  );
  assert.equal(validateOptions([{ label: "Yes" }, { label: "yes" }]), false);
  assert.equal(validateOptions([{ label: "Yes" }, { label: "No" }]), true);
});

test("validateMaxSelections requires an integer within [1, optionCount]", () => {
  assert.equal(validateMaxSelections(2, 3), true);
  assert.equal(validateMaxSelections(0, 3), false);
  assert.equal(validateMaxSelections(4, 3), false);
  assert.equal(validateMaxSelections(1.5, 3), false);
});

test("validateWeight rejects fractions, zero, negatives, and unsafe integers", () => {
  assert.equal(validateWeight(1), true);
  assert.equal(validateWeight(0), false);
  assert.equal(validateWeight(-1), false);
  assert.equal(validateWeight(1.5), false);
  assert.equal(validateWeight(Number.MAX_SAFE_INTEGER + 10), false);
});

test("validateTimerSeconds enforces the 10..604800 range", () => {
  assert.equal(validateTimerSeconds(9), false);
  assert.equal(validateTimerSeconds(10), true);
  assert.equal(validateTimerSeconds(604800), true);
  assert.equal(validateTimerSeconds(604801), false);
});

test("validateQuorumPercent enforces the (0, 100] range", () => {
  assert.equal(validateQuorumPercent(0), false);
  assert.equal(validateQuorumPercent(1), true);
  assert.equal(validateQuorumPercent(100), true);
  assert.equal(validateQuorumPercent(101), false);
});

test("validateSupermajorityThreshold requires an exact rational strictly between 1/2 and 1", () => {
  assert.equal(validateSupermajorityThreshold({ numerator: 1, denominator: 2 }), false);
  assert.equal(validateSupermajorityThreshold({ numerator: 2, denominator: 3 }), true);
  assert.equal(validateSupermajorityThreshold({ numerator: 1, denominator: 1 }), false);
  assert.equal(validateSupermajorityThreshold({ numerator: 1.5, denominator: 3 }), false);
});

test("validateStartReadiness rejects when another poll is active", () => {
  const draft = { ...defaultPollDraft(), title: "Title", participants: [{ weight: 1 }] };
  assert.equal(validateStartReadiness(draft, { hasActivePoll: true }), false);
});

test("validateStartReadiness passes a minimal valid proposal draft", () => {
  const draft = {
    ...defaultPollDraft(),
    title: "Should we do it?",
    participants: [{ id: "p1", weight: 1 }],
  };
  assert.equal(validateStartReadiness(draft), true);
});

test("validateStartReadiness requires supermajority threshold only when that rule is chosen", () => {
  const draft = {
    ...defaultPollDraft(),
    title: "Should we do it?",
    participants: [{ id: "p1", weight: 1 }],
    proposalRule: PROPOSAL_RULE.SUPERMAJORITY,
    supermajorityThreshold: { numerator: 1, denominator: 2 },
  };
  assert.equal(validateStartReadiness(draft), false);
});

test("validateStartReadiness validates every weight when weighting is enabled", () => {
  const draft = {
    ...defaultPollDraft(),
    title: "Should we do it?",
    participants: [{ id: "p1", weight: 1 }, { id: "p2", weight: 0 }],
    weightedVote: true,
  };
  assert.equal(validateStartReadiness(draft), false);
});

test("validateStartReadiness requires at least one participant", () => {
  const draft = { ...defaultPollDraft(), title: "Should we do it?", participants: [] };
  assert.equal(validateStartReadiness(draft), false);
});
