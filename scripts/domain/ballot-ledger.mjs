/**
 * Reduce the private record's ballot history (including invalidated/reset
 * entries) to the Map of currently-active ballots the tally engine expects:
 * participantId -> payload ({choice} for Proposal, {optionIds}/{abstained}
 * for Choice). No Foundry globals.
 */
export function buildActiveBallotMap(ballots) {
  const map = new Map();
  for (const ballot of ballots) {
    if (ballot.invalidated) {
      map.delete(ballot.participantId);
      continue;
    }
    map.set(ballot.participantId, ballot.payload);
  }
  return map;
}
