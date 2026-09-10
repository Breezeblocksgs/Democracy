import { MODULE_ID } from "./constants.mjs";

export const SETTINGS = Object.freeze({
  SCHEMA_VERSION: "schemaVersion",
  ACTIVE_POLL_PROJECTION: "activePollProjection",
  AUTO_OPEN_ELIGIBLE_POLLS: "autoOpenEligiblePolls",
  CINEMATIC_CONFIG: "cinematicConfig",
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
}

export function getCinematicConfig() {
  return { ...DEFAULT_CINEMATIC_CONFIG, ...(game.settings.get(MODULE_ID, SETTINGS.CINEMATIC_CONFIG) ?? {}) };
}

export async function setCinematicConfig(config) {
  return game.settings.set(MODULE_ID, SETTINGS.CINEMATIC_CONFIG, config);
}
