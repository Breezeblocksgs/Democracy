import assert from "node:assert/strict";
import { test } from "node:test";

import { computeAuthorityUserId } from "../scripts/domain/authority.mjs";

test("prefers the creator GM while they are active", () => {
  assert.equal(computeAuthorityUserId(["b", "a", "c"], "b"), "b");
});

test("falls back to the lowest active GM id when the creator is gone", () => {
  assert.equal(computeAuthorityUserId(["b", "c"], "a-not-active"), "b");
});

test("returns null when no GM is active", () => {
  assert.equal(computeAuthorityUserId([], "a"), null);
});

test("is deterministic across clients regardless of input order", () => {
  assert.equal(computeAuthorityUserId(["c", "a", "b"]), computeAuthorityUserId(["a", "b", "c"]));
});
