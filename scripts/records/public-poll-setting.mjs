import { MODULE_ID, POLL_LIFECYCLE } from "../constants.mjs";
import { SETTINGS } from "../config-settings.mjs";

/**
 * The active-poll public projection lives in a config:false world setting.
 * It must only ever hold the public-safe projection (see domain/projections)
 * — world settings are readable by every connected client.
 */
export function getActivePollProjection() {
  return game.settings.get(MODULE_ID, SETTINGS.ACTIVE_POLL_PROJECTION);
}

export async function setActivePollProjection(projection) {
  return game.settings.set(MODULE_ID, SETTINGS.ACTIVE_POLL_PROJECTION, projection);
}

export async function clearActivePollProjection() {
  return setActivePollProjection(null);
}

/** A Closed/Cancelled poll still occupying the setting must not block a new one. */
export function hasActivePoll() {
  return getActivePollProjection()?.lifecycle === POLL_LIFECYCLE.ACTIVE;
}
