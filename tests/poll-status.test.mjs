import assert from "node:assert/strict";
import { test } from "node:test";

import { computePollStatus, isFullyVoted } from "../scripts/domain/poll-status.mjs";
import { POLL_LIFECYCLE, PARTICIPANT_STATUS } from "../scripts/constants.mjs";

test("computePollStatus maps lifecycle + close reason to a display status", () => {
  assert.equal(computePollStatus(POLL_LIFECYCLE.ACTIVE, null), "ongoing");
  assert.equal(computePollStatus(POLL_LIFECYCLE.CANCELLED, null), "cancelled");
  assert.equal(computePollStatus(POLL_LIFECYCLE.CLOSED, "timeout"), "timed-out");
  assert.equal(computePollStatus(POLL_LIFECYCLE.CLOSED, "completed"), "done");
  assert.equal(computePollStatus(POLL_LIFECYCLE.CLOSED, "manual"), "closed");
  assert.equal(computePollStatus(POLL_LIFECYCLE.CLOSED, undefined), "closed");
});

test("isFullyVoted is true only when every non-excluded participant submitted or abstained", () => {
  assert.equal(
    isFullyVoted([
      { id: "p1", status: PARTICIPANT_STATUS.SUBMITTED },
      { id: "p2", status: PARTICIPANT_STATUS.ABSTAINED },
    ]),
    true,
  );
  assert.equal(
    isFullyVoted([
      { id: "p1", status: PARTICIPANT_STATUS.SUBMITTED },
      { id: "p2", status: PARTICIPANT_STATUS.PENDING },
    ]),
    false,
  );
});

test("isFullyVoted ignores excluded participants", () => {
  assert.equal(
    isFullyVoted([
      { id: "p1", status: PARTICIPANT_STATUS.SUBMITTED },
      { id: "p2", status: PARTICIPANT_STATUS.EXCLUDED },
    ]),
    true,
  );
});

test("isFullyVoted is false when every participant is excluded (nobody to be 'done')", () => {
  assert.equal(isFullyVoted([{ id: "p1", status: PARTICIPANT_STATUS.EXCLUDED }]), false);
});
