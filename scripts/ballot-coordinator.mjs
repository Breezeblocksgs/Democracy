import { createId } from "./domain/schema.mjs";
import { validateBallotSubmission, isAbstainPayload } from "./domain/ballot-validation.mjs";
import { PARTICIPANT_STATUS, POLL_LIFECYCLE } from "./constants.mjs";
import { isCurrentUserAuthority } from "./authority.mjs";
import { onSocketMessage, emitSocketMessage } from "./socket.mjs";
import { readPrivateRecord, updatePrivateRecord } from "./records/private-poll-repository.mjs";
import { getActivePollProjection, setActivePollProjection } from "./records/public-poll-setting.mjs";
import { refreshLiveResults } from "./live-results.mjs";
import { closeIfFullyVoted } from "./closure.mjs";

const ACTION = Object.freeze({
  SUBMIT_BALLOT: "submit-ballot",
  BALLOT_RESULT: "ballot-result",
});

const RESPONSE_TIMEOUT_MS = 10_000;
const pendingRequests = new Map();

/**
 * Every client registers this. Only the elected authority acts on
 * submit-ballot requests; every client resolves its own pending promise
 * when a matching ballot-result arrives.
 */
export function registerBallotCoordinator() {
  onSocketMessage((message) => {
    if (!message || typeof message !== "object") return;

    if (message.action === ACTION.SUBMIT_BALLOT && isCurrentUserAuthority()) {
      handleSubmitBallot(message);
    }

    if (message.action === ACTION.BALLOT_RESULT) {
      const pending = pendingRequests.get(message.requestId);
      if (pending) {
        pendingRequests.delete(message.requestId);
        pending.resolve(message);
      }
    }
  });
}

/**
 * Player/GM client: submit a ballot for one owned (or GM-overridden)
 * participant. Resolves with { accepted, reason }.
 *
 * When the caller is themselves the elected authority (the common case for
 * a solo GM voting an NPC or using an override), this processes the ballot
 * directly instead of round-tripping through the socket — a module socket
 * is not a trusted RPC and, empirically, does not reliably deliver a
 * client's own emitted message back to itself, which otherwise makes a
 * GM's own vote fail with a false "timeout".
 */
export async function submitBallotRequest(pollId, participantId, payload, { isGmOverride = false } = {}) {
  if (isCurrentUserAuthority()) {
    return processSubmission({
      pollId,
      participantId,
      submittingUserId: game.user.id,
      isGmOverride,
      payload,
    });
  }

  const requestId = createId("request");

  const responsePromise = new Promise((resolve) => {
    pendingRequests.set(requestId, { resolve });
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        resolve({ accepted: false, reason: "timeout" });
      }
    }, RESPONSE_TIMEOUT_MS);
  });

  emitSocketMessage({
    version: 1,
    action: ACTION.SUBMIT_BALLOT,
    requestId,
    pollId,
    participantId,
    submittingUserId: game.user.id,
    isGmOverride,
    payload,
  });

  return responsePromise;
}

function respond(requestId, accepted, reason = null) {
  emitSocketMessage({ version: 1, action: ACTION.BALLOT_RESULT, requestId, accepted, reason });
}

async function handleSubmitBallot(message) {
  const { requestId, pollId, participantId, submittingUserId, isGmOverride, payload } = message;
  const result = await processSubmission({ pollId, participantId, submittingUserId, isGmOverride, payload });
  respond(requestId, result.accepted, result.reason);
}

/**
 * The authoritative acceptance logic, shared by the direct (self-authority)
 * path and the socket-received path. Only ever called on the client that is
 * currently the elected authority.
 */
async function processSubmission({ pollId, participantId, submittingUserId, isGmOverride, payload }) {
  const record = readPrivateRecord(pollId);
  const projection = getActivePollProjection();
  if (!record || !projection || projection.pollId !== pollId || record.lifecycle !== POLL_LIFECYCLE.ACTIVE) {
    return { accepted: false, reason: "poll-not-active" };
  }

  const reason = validateBallotSubmission({
    snapshot: record.snapshot,
    participantStatuses: record.participants,
    participantId,
    submittingUserId,
    isGmOverride,
    isSubmittingUserGm: game.users.get(submittingUserId)?.isGM ?? false,
    payload,
    now: game.time.serverTime,
  });
  if (reason) return { accepted: false, reason };

  const abstained = isAbstainPayload(record.snapshot.pollType, payload);
  const newStatus = abstained ? PARTICIPANT_STATUS.ABSTAINED : PARTICIPANT_STATUS.SUBMITTED;

  record.participants = record.participants.map((p) =>
    p.id === participantId ? { ...p, status: newStatus } : p,
  );
  // Real wall-clock time for display — see the comment in poll-builder.mjs.
  const acceptedAt = Date.now();
  record.ballots = [
    ...record.ballots,
    {
      participantId,
      submittedByUserId: submittingUserId,
      isGmOverride,
      payload,
      acceptedAt,
    },
  ];
  record.audit = [
    ...record.audit,
    { type: "ballot-accepted", participantId, userId: submittingUserId, timestamp: acceptedAt },
  ];

  await updatePrivateRecord(pollId, record);
  await setActivePollProjection({
    ...projection,
    participants: projection.participants.map((p) => (p.id === participantId ? { ...p, voted: true } : p)),
  });
  await refreshLiveResults(pollId, record);
  await closeIfFullyVoted(pollId, record);

  return { accepted: true, reason: null };
}
