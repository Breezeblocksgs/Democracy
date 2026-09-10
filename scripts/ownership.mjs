/**
 * Token participant eligibility derived from the documented Actor ownership
 * API. Never inferred from a system-specific data path.
 */
export function getEligibleOwnerUserIds(tokenDocument) {
  const actor = tokenDocument.actor;
  if (!actor) return [];
  return game.users
    .filter((user) => !user.isGM && actor.testUserPermission(user, "OWNER"))
    .map((user) => user.id);
}

export function isNpcToken(tokenDocument) {
  return getEligibleOwnerUserIds(tokenDocument).length === 0;
}

export function isOfflineOwnerToken(tokenDocument) {
  const ownerIds = getEligibleOwnerUserIds(tokenDocument);
  if (ownerIds.length === 0) return false;
  return ownerIds.every((id) => !game.users.get(id)?.active);
}

export function describeTokenEligibility(tokenDocument) {
  const ownerUserIds = getEligibleOwnerUserIds(tokenDocument);
  return {
    ownerUserIds,
    isNpc: ownerUserIds.length === 0,
    isOfflineOwner: ownerUserIds.length > 0 && ownerUserIds.every((id) => !game.users.get(id)?.active),
  };
}

/** Token ids grouped by Actor id, for the duplicate-linked-token GM warning. */
export function findDuplicateActorTokenIds(tokenDocuments) {
  const byActor = new Map();
  for (const token of tokenDocuments) {
    const actorId = token.actorId;
    if (!actorId) continue;
    if (!byActor.has(actorId)) byActor.set(actorId, []);
    byActor.get(actorId).push(token.id);
  }
  return [...byActor.values()].filter((ids) => ids.length > 1).flat();
}
