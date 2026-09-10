import {
  POLL_TYPE,
  PROPOSAL_RULE,
  SUPERMAJORITY_BASIS,
  DEFAULT_SUPERMAJORITY_THRESHOLD,
} from "../constants.mjs";

/**
 * Pure poll/participant/option schema helpers. No Foundry globals.
 */

let fallbackCounter = 0;

export function createId(prefix = "id") {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    return `${prefix}-${cryptoRef.randomUUID()}`;
  }
  fallbackCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createOption(label, id = createId("option")) {
  return { id, label };
}

/**
 * Preserve stable option ids across edits: reuse an existing id at the same
 * index when present, mint a fresh id only for genuinely new options.
 */
export function normalizeOptions(rawOptions, previousOptions = []) {
  const list = Array.isArray(rawOptions) ? rawOptions : [];
  return list.map((raw, index) => {
    const label = typeof raw === "string" ? raw : raw?.label ?? "";
    const previous = previousOptions[index];
    const id = raw?.id ?? previous?.id ?? createId("option");
    return { id, label };
  });
}

export function clampMaxSelections(maxSelections, optionCount) {
  const upperBound = Math.max(1, optionCount);
  if (!Number.isFinite(maxSelections) || maxSelections < 1) return 1;
  return Math.min(Math.trunc(maxSelections), upperBound);
}

/**
 * `overrides` lets the Foundry-integration layer apply GM-configured world
 * defaults (see config-settings.mjs) without this pure function ever
 * touching a Foundry global itself.
 */
export function defaultPollDraft(overrides = {}) {
  return {
    title: "",
    description: "",
    pollType: POLL_TYPE.PROPOSAL,
    options: [createOption(""), createOption("")],
    allowMultipleSelections: false,
    maxSelections: 1,
    participants: [],
    secretVote: true,
    liveResults: false,
    weightedVote: false,
    timedVote: false,
    timerSeconds: 300,
    quorumEnabled: false,
    quorumPercent: 50,
    proposalRule: PROPOSAL_RULE.SIMPLE_MAJORITY,
    supermajorityThreshold: DEFAULT_SUPERMAJORITY_THRESHOLD,
    supermajorityBasis: SUPERMAJORITY_BASIS.VALID_VOTES,
    ...overrides,
  };
}

export function normalizeWeight(rawWeight) {
  if (
    typeof rawWeight !== "number" ||
    !Number.isFinite(rawWeight) ||
    !Number.isSafeInteger(rawWeight) ||
    rawWeight <= 0
  ) {
    return 1;
  }
  return rawWeight;
}

/**
 * Recover a persisted/malformed draft into a safe, complete draft by
 * merging over the defaults field-by-field, discarding invalid shapes.
 */
export function recoverPollDraft(rawDraft) {
  const defaults = defaultPollDraft();
  if (!rawDraft || typeof rawDraft !== "object") return defaults;

  const pollType = Object.values(POLL_TYPE).includes(rawDraft.pollType)
    ? rawDraft.pollType
    : defaults.pollType;

  const options =
    pollType === POLL_TYPE.CHOICE
      ? normalizeOptions(rawDraft.options, defaults.options)
      : defaults.options;

  return {
    ...defaults,
    ...rawDraft,
    pollType,
    options,
    maxSelections: clampMaxSelections(
      Number(rawDraft.maxSelections ?? defaults.maxSelections),
      options.length,
    ),
  };
}
