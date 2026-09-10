import { computeLiveTally } from "./domain/live-tally.mjs";
import { buildActiveBallotMap } from "./domain/ballot-ledger.mjs";
import { getActivePollProjection, setActivePollProjection } from "./records/public-poll-setting.mjs";

/**
 * Recompute and store the provisional live tally after any ballot change.
 * Only the elected authority calls this (it writes the public projection).
 */
export async function refreshLiveResults(pollId, record) {
  const projection = getActivePollProjection();
  if (!projection || projection.pollId !== pollId || !record.snapshot.liveResults) return;

  const ballots = buildActiveBallotMap(record.ballots);
  const liveTally = computeLiveTally(record.snapshot, ballots);

  await setActivePollProjection({ ...projection, liveTally });
}
