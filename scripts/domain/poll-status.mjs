import { POLL_LIFECYCLE, PARTICIPANT_STATUS } from "../constants.mjs";

/**
 * The human-facing "Status" line, distinct from the Outcome (Approved/
 * Winner/etc). Pure, no Foundry globals.
 */
export function computePollStatus(lifecycle, closeReason) {
  if (lifecycle === POLL_LIFECYCLE.ACTIVE) return "ongoing";
  if (lifecycle === POLL_LIFECYCLE.CANCELLED) return "cancelled";
  if (lifecycle === POLL_LIFECYCLE.CLOSED) {
    if (closeReason === "timeout") return "timed-out";
    if (closeReason === "completed") return "done";
    return "closed";
  }
  return "ongoing";
}

/** True once every non-excluded participant has submitted or abstained. */
export function isFullyVoted(participantStatuses) {
  const eligible = participantStatuses.filter((p) => p.status !== PARTICIPANT_STATUS.EXCLUDED);
  if (eligible.length === 0) return false;
  return eligible.every(
    (p) => p.status === PARTICIPANT_STATUS.SUBMITTED || p.status === PARTICIPANT_STATUS.ABSTAINED,
  );
}
