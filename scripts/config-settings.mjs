import { MODULE_ID, PROPOSAL_RULE } from "./constants.mjs";

export const SETTINGS = Object.freeze({
  SCHEMA_VERSION: "schemaVersion",
  ACTIVE_POLL_PROJECTION: "activePollProjection",
  AUTO_OPEN_ELIGIBLE_POLLS: "autoOpenEligiblePolls",
  CINEMATIC_CONFIG: "cinematicConfig",
  DEFAULT_SECRET_VOTE: "defaultSecretVote",
  DEFAULT_LIVE_RESULTS: "defaultLiveResults",
  DEFAULT_WEIGHTED_VOTE: "defaultWeightedVote",
  DEFAULT_QUORUM_ENABLED: "defaultQuorumEnabled",
  DEFAULT_TIMER_SECONDS: "defaultTimerSeconds",
  DEFAULT_QUORUM_PERCENT: "defaultQuorumPercent",
  DEFAULT_PROPOSAL_RULE: "defaultProposalRule",
});

export const CURRENT_SCHEMA_VERSION = 1;

export const DEFAULT_CINEMATIC_BACKGROUND = `modules/${MODULE_ID}/assets/cinematic-default.jpg`;

export const DEFAULT_CINEMATIC_CONFIG = Object.freeze({
  title: "",
  playOnEnd: false,
  pauseOnPlay: true,
  backgroundImage: DEFAULT_CINEMATIC_BACKGROUND,
});

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.SCHEMA_VERSION, {
    scope: "world",
    config: false,
    type: Number,
    default: CURRENT_SCHEMA_VERSION,
  });

  // Public-safe active-poll projection only. Never store ballots here —
  // world settings are readable by every connected client.
  game.settings.register(MODULE_ID, SETTINGS.ACTIVE_POLL_PROJECTION, {
    scope: "world",
    config: false,
    type: Object,
    default: null,
  });

  game.settings.register(MODULE_ID, SETTINGS.AUTO_OPEN_ELIGIBLE_POLLS, {
    scope: "user",
    config: true,
    type: Boolean,
    default: true,
    name: "DEMOCRACY.Settings.AutoOpenEligiblePolls.Name",
    hint: "DEMOCRACY.Settings.AutoOpenEligiblePolls.Hint",
  });

  // Configured from the Cinematic tab in Poll Management, not the native
  // Settings sheet — every connected client needs to read it to play the
  // reveal identically, so it stays world-scoped.
  game.settings.register(MODULE_ID, SETTINGS.CINEMATIC_CONFIG, {
    scope: "world",
    config: false,
    type: Object,
    default: DEFAULT_CINEMATIC_CONFIG,
  });

  // World defaults pre-filled on a fresh poll draft — only ever read once,
  // when the Builder opens for a brand-new poll (see poll-builder.mjs).
  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_SECRET_VOTE, {
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    name: "DEMOCRACY.Settings.DefaultSecretVote.Name",
    hint: "DEMOCRACY.Settings.DefaultSecretVote.Hint",
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_LIVE_RESULTS, {
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    name: "DEMOCRACY.Settings.DefaultLiveResults.Name",
    hint: "DEMOCRACY.Settings.DefaultLiveResults.Hint",
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_WEIGHTED_VOTE, {
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    name: "DEMOCRACY.Settings.DefaultWeightedVote.Name",
    hint: "DEMOCRACY.Settings.DefaultWeightedVote.Hint",
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_QUORUM_ENABLED, {
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    name: "DEMOCRACY.Settings.DefaultQuorumEnabled.Name",
    hint: "DEMOCRACY.Settings.DefaultQuorumEnabled.Hint",
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_TIMER_SECONDS, {
    scope: "world",
    config: true,
    type: Number,
    default: 300,
    range: { min: 10, max: 604800, step: 10 },
    name: "DEMOCRACY.Settings.DefaultTimerSeconds.Name",
    hint: "DEMOCRACY.Settings.DefaultTimerSeconds.Hint",
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_QUORUM_PERCENT, {
    scope: "world",
    config: true,
    type: Number,
    default: 50,
    range: { min: 1, max: 100, step: 1 },
    name: "DEMOCRACY.Settings.DefaultQuorumPercent.Name",
    hint: "DEMOCRACY.Settings.DefaultQuorumPercent.Hint",
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_PROPOSAL_RULE, {
    scope: "world",
    config: true,
    type: String,
    default: PROPOSAL_RULE.SIMPLE_MAJORITY,
    choices: {
      [PROPOSAL_RULE.SIMPLE_MAJORITY]: "DEMOCRACY.Builder.ProposalRuleOption.simple-majority",
      [PROPOSAL_RULE.ABSOLUTE_MAJORITY]: "DEMOCRACY.Builder.ProposalRuleOption.absolute-majority",
      [PROPOSAL_RULE.MAJORITY_OF_PARTICIPANTS]: "DEMOCRACY.Builder.ProposalRuleOption.majority-of-participants",
      [PROPOSAL_RULE.UNANIMITY_OF_VOTERS]: "DEMOCRACY.Builder.ProposalRuleOption.unanimity-of-voters",
      [PROPOSAL_RULE.UNANIMITY_OF_ALL_MEMBERS]: "DEMOCRACY.Builder.ProposalRuleOption.unanimity-of-all-members",
      [PROPOSAL_RULE.SUPERMAJORITY]: "DEMOCRACY.Builder.ProposalRuleOption.supermajority",
    },
    name: "DEMOCRACY.Settings.DefaultProposalRule.Name",
    hint: "DEMOCRACY.Settings.DefaultProposalRule.Hint",
  });
}

/** Read the GM-configured world defaults for a brand-new poll draft. */
export function getPollDraftOverrides() {
  return {
    secretVote: game.settings.get(MODULE_ID, SETTINGS.DEFAULT_SECRET_VOTE),
    liveResults: game.settings.get(MODULE_ID, SETTINGS.DEFAULT_LIVE_RESULTS),
    weightedVote: game.settings.get(MODULE_ID, SETTINGS.DEFAULT_WEIGHTED_VOTE),
    quorumEnabled: game.settings.get(MODULE_ID, SETTINGS.DEFAULT_QUORUM_ENABLED),
    timerSeconds: game.settings.get(MODULE_ID, SETTINGS.DEFAULT_TIMER_SECONDS),
    quorumPercent: game.settings.get(MODULE_ID, SETTINGS.DEFAULT_QUORUM_PERCENT),
    proposalRule: game.settings.get(MODULE_ID, SETTINGS.DEFAULT_PROPOSAL_RULE),
  };
}

export function getCinematicConfig() {
  return { ...DEFAULT_CINEMATIC_CONFIG, ...(game.settings.get(MODULE_ID, SETTINGS.CINEMATIC_CONFIG) ?? {}) };
}

export async function setCinematicConfig(config) {
  return game.settings.set(MODULE_ID, SETTINGS.CINEMATIC_CONFIG, config);
}
