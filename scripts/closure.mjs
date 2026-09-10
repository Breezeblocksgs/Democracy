import { POLL_LIFECYCLE } from "./constants.mjs";
import { resolvePoll } from "./domain/voting-rules.mjs";
import { buildActiveBallotMap } from "./domain/ballot-ledger.mjs";
import { isFullyVoted } from "./domain/poll-status.mjs";
import { buildResultOnlyProjection } from "./domain/projections.mjs";
import { readPrivateRecord, updatePrivateRecord } from "./records/private-poll-repository.mjs";
import { getActivePollProjection, setActivePollProjection } from "./records/public-poll-setting.mjs";
import { postPollClosedMessage, postCinematicAvailableMessage } from "./chat.mjs";
import { getCinematicConfig } from "./config-settings.mjs";
import { triggerCinematicPlay } from "./cinematic-coordinator.mjs";

/**
 * Idempotent: a poll not in the Active lifecycle is left untouched.
 * `reason` (ignored when cancelled) is one of "manual", "timeout", or
 * "completed" — drives the display Status (see domain/poll-status.mjs).
 */
export async function closePoll(pollId, { cancelled = false, reason = "manual" } = {}) {
  const record = readPrivateRecord(pollId);
  if (!record || record.lifecycle !== POLL_LIFECYCLE.ACTIVE) return null;

  const ballots = buildActiveBallotMap(record.ballots);
  const result = resolvePoll(record.snapshot, ballots, { cancelled });
  // Real wall-clock time for display — see the comment in poll-builder.mjs.
  const closedAt = Date.now();

  record.lifecycle = cancelled ? POLL_LIFECYCLE.CANCELLED : POLL_LIFECYCLE.CLOSED;
  record.closeReason = cancelled ? null : reason;
  record.result = result;
  record.closedAt = closedAt;
  record.audit = [
    ...record.audit,
    { type: cancelled ? "cancelled" : "closed", userId: game.user.id, timestamp: closedAt },
  ];
  await updatePrivateRecord(pollId, record);

  const projection = getActivePollProjection();
  const resultOnly = buildResultOnlyProjection({
    snapshot: record.snapshot,
    participants: record.participants,
    ballots,
    result,
  });

  const closedProjection = {
    ...(projection?.pollId === pollId ? projection : { pollId }),
    lifecycle: record.lifecycle,
    closeReason: record.closeReason,
    closedAt,
    outcome: resultOnly.outcome,
    turnout: resultOnly.turnout,
    abstainedCount: resultOnly.abstainedCount,
    excludedCount: resultOnly.excludedCount,
  };
  await setActivePollProjection(closedProjection);
  await postPollClosedMessage(closedProjection);

  if (!cancelled) {
    await postCinematicAvailableMessage(closedProjection);
    if (getCinematicConfig().playOnEnd) triggerCinematicPlay(closedProjection);
  }

  return record;
}

/** Called on ready and periodically; only the elected authority acts. */
export async function finalizeIfOverdue() {
  const projection = getActivePollProjection();
  if (!projection || projection.lifecycle !== POLL_LIFECYCLE.ACTIVE) return;
  if (!projection.deadline || game.time.serverTime < projection.deadline) return;
  await closePoll(projection.pollId, { cancelled: false, reason: "timeout" });
}

/** Call after any ballot-state change; closes early once everyone has voted. */
export async function closeIfFullyVoted(pollId, record) {
  if (record.lifecycle !== POLL_LIFECYCLE.ACTIVE) return;
  if (!isFullyVoted(record.participants)) return;
  await closePoll(pollId, { cancelled: false, reason: "completed" });
}
