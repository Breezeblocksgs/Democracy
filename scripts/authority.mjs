import { computeAuthorityUserId } from "./domain/authority.mjs";

export function getActiveGmUsers() {
  return game.users.filter((user) => user.isGM && user.active);
}

export function getCurrentAuthorityUserId(preferredUserId = null) {
  const activeGmIds = getActiveGmUsers().map((user) => user.id);
  return computeAuthorityUserId(activeGmIds, preferredUserId);
}

/** Never trust game.user.isGM alone — recompute the elected authority. */
export function isCurrentUserAuthority(preferredUserId = null) {
  return game.user.isGM && getCurrentAuthorityUserId(preferredUserId) === game.user.id;
}
