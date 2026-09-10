import { LIMITS, POLL_TYPE, PROPOSAL_RULE } from "../constants.mjs";

/**
 * Pure builder-field validators. Every function returns true/false; callers
 * decide how to surface localized help text. No Foundry globals.
 */

export function validateTitle(title) {
  if (typeof title !== "string") return false;
  const trimmed = title.trim();
  return trimmed.length >= LIMITS.TITLE_MIN && trimmed.length <= LIMITS.TITLE_MAX;
}

export function validateDescription(description) {
  if (description === undefined || description === null || description === "") return true;
  if (typeof description !== "string") return false;
  return description.trim().length <= LIMITS.DESCRIPTION_MAX;
}

function validateOptionLabel(label) {
  if (typeof label !== "string") return false;
  const trimmed = label.trim();
  return trimmed.length >= LIMITS.OPTION_LABEL_MIN && trimmed.length <= LIMITS.OPTION_LABEL_MAX;
}

export function validateOptions(options) {
  if (!Array.isArray(options)) return false;
  if (options.length < LIMITS.OPTIONS_MIN || options.length > LIMITS.OPTIONS_MAX) return false;
  if (!options.every((option) => validateOptionLabel(option?.label))) return false;

  const seen = new Set();
  for (const option of options) {
    const key = option.label.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export function validateMaxSelections(maxSelections, optionCount) {
  if (!Number.isInteger(maxSelections)) return false;
  return maxSelections >= 1 && maxSelections <= optionCount;
}

export function validateWeight(weight) {
  return (
    typeof weight === "number" &&
    Number.isSafeInteger(weight) &&
    weight > 0
  );
}

export function validateTimerSeconds(seconds) {
  return (
    Number.isInteger(seconds) &&
    seconds >= LIMITS.TIMER_SECONDS_MIN &&
    seconds <= LIMITS.TIMER_SECONDS_MAX
  );
}

export function validateQuorumPercent(percent) {
  return (
    typeof percent === "number" &&
    Number.isFinite(percent) &&
    percent >= LIMITS.QUORUM_PERCENT_MIN &&
    percent <= LIMITS.QUORUM_PERCENT_MAX
  );
}

export function validateSupermajorityThreshold(threshold) {
  if (!threshold || typeof threshold !== "object") return false;
  const { numerator, denominator } = threshold;
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) return false;
  if (numerator <= 0 || denominator <= 0) return false;
  // strictly greater than one-half and strictly less than one
  return 2 * numerator > denominator && numerator < denominator;
}

/**
 * Aggregate start-readiness check per product-contract "Start Validation and
 * Frozen Configuration". Returns true only if every applicable rule passes.
 */
export function validateStartReadiness(draft, { hasActivePoll = false } = {}) {
  if (hasActivePoll) return false;
  if (!validateTitle(draft?.title)) return false;
  if (!validateDescription(draft?.description)) return false;

  if (draft?.pollType === POLL_TYPE.CHOICE) {
    if (!validateOptions(draft.options)) return false;
    if (
      draft.allowMultipleSelections &&
      !validateMaxSelections(draft.maxSelections, draft.options.length)
    ) {
      return false;
    }
  } else if (draft?.pollType === POLL_TYPE.PROPOSAL) {
    if (!Object.values(PROPOSAL_RULE).includes(draft.proposalRule)) return false;
    if (
      draft.proposalRule === PROPOSAL_RULE.SUPERMAJORITY &&
      !validateSupermajorityThreshold(draft.supermajorityThreshold)
    ) {
      return false;
    }
  } else {
    return false;
  }

  if (!Array.isArray(draft.participants) || draft.participants.length < 1) return false;

  if (draft.weightedVote) {
    const weights = draft.participants.map((participant) => participant.weight);
    if (!weights.every(validateWeight)) return false;
  }

  if (draft.timedVote && !validateTimerSeconds(draft.timerSeconds)) return false;
  if (draft.quorumEnabled && !validateQuorumPercent(draft.quorumPercent)) return false;

  return true;
}
