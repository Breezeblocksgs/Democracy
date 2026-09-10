import assert from "node:assert/strict";
import { test } from "node:test";

import { secondsRemaining, formatCountdown } from "../scripts/domain/deadline.mjs";

test("secondsRemaining returns null when there is no deadline", () => {
  assert.equal(secondsRemaining(null, 1000), null);
});

test("secondsRemaining rounds up and clamps at zero", () => {
  assert.equal(secondsRemaining(10500, 9000), 2);
  assert.equal(secondsRemaining(1000, 5000), 0);
});

test("formatCountdown pads seconds and passes through null", () => {
  assert.equal(formatCountdown(65), "1:05");
  assert.equal(formatCountdown(5), "0:05");
  assert.equal(formatCountdown(null), null);
});
