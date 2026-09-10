/**
 * Pure deterministic authority election. No Foundry globals. Every client
 * must reach the same answer given the same active-GM id list.
 */
export function computeAuthorityUserId(activeGmUserIds, preferredUserId = null) {
  if (!Array.isArray(activeGmUserIds) || activeGmUserIds.length === 0) return null;
  if (preferredUserId && activeGmUserIds.includes(preferredUserId)) return preferredUserId;
  return [...activeGmUserIds].sort()[0];
}
