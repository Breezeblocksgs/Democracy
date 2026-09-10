import { POLL_TYPE, PROPOSAL_CHOICE } from "../constants.mjs";

/**
 * Pure authority-side ballot acceptance checks. No Foundry globals. Every
 * caller (socket handler, tests) must run these on the authoritative client
 * — a disabled client button is never proof of authorization.
 */

/** True when a payload is an explicit abstention, for either poll type. */
export function isAbstainPayload(pollType, payload) {
  if (pollType === POLL_TYPE.PROPOSAL) return payload?.choice === PROPOSAL_CHOICE.ABSTAIN;
  return !!payload?.abstained;
}

export function findParticipant(snapshot, participantId) {
  return snapshot.participants.find((p) => p.id === participantId) ?? null;
}

export function isEligibleOwner(participant, submittingUserId, isGmOverride, isSubmittingUserGm) {
  if (isGmOverride) return true;
  // The GM may always vote an unowned NPC — that's not an "override" of
  // anyone, there is no owner to override.
  if (isSubmittingUserGm && participant.isNpc) return true;
  return participant.ownerUserIds?.includes(submittingUserId) ?? false;
}

function validateProposalPayload(payload) {
  return Object.values(PROPOSAL_CHOICE).includes(payload?.choice);
}

function validateChoicePayload(snapshot, payload) {
  if (payload?.abstained) return true;
  const optionIds = payload?.optionIds;
  if (!Array.isArray(optionIds) || optionIds.length === 0) return false;
  const validIds = new Set(snapshot.options.map((o) => o.id));
  if (!optionIds.every((id) => validIds.has(id))) return false;
  if (new Set(optionIds).size !== optionIds.length) return false;
  const maxAllowed = snapshot.allowMultipleSelections ? snapshot.maxSelections : 1;
  return optionIds.length <= maxAllowed;
}

/**
 * Full acceptance check for one submission attempt against the current
 * private state. Returns a rejection reason key, or null when acceptable.
 */
export function validateBallotSubmission({
  snapshot,
  participantStatuses,
  participantId,
  submittingUserId,
  isGmOverride,
  isSubmittingUserGm,
  payload,
  now,
}) {
  const participant = findParticipant(snapshot, participantId);
  if (!participant) return "unknown-participant";

  const status = participantStatuses.find((p) => p.id === participantId);
  if (!status || status.status === "excluded") return "not-eligible";
  if (status.status === "submitted" || status.status === "abstained") return "already-submitted";

  if (!isEligibleOwner(participant, submittingUserId, isGmOverride, isSubmittingUserGm)) return "not-owner";
  if (snapshot.deadline && now > snapshot.deadline) return "deadline-passed";

  const payloadValid =
    snapshot.pollType === POLL_TYPE.PROPOSAL
      ? validateProposalPayload(payload)
      : validateChoicePayload(snapshot, payload);
  if (!payloadValid) return "invalid-payload";

  return null;
}
