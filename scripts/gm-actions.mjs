import { PARTICIPANT_STATUS } from "./constants.mjs";
import { readPrivateRecord, updatePrivateRecord } from "./records/private-poll-repository.mjs";
import { getActivePollProjection, setActivePollProjection } from "./records/public-poll-setting.mjs";
import { refreshLiveResults } from "./live-results.mjs";
import { closeIfFullyVoted } from "./closure.mjs";

/**
 * GM-only direct actions on the authoritative private record. The GM client
 * already owns the private JournalEntry, so these write directly rather
 * than round-tripping through the ballot-submission socket protocol.
 */

export async function resetBallot(pollId, participantId) {
  const record = readPrivateRecord(pollId);
  if (!record) throw new Error(`No private record for poll ${pollId}`);

  record.participants = record.participants.map((p) =>
    p.id === participantId ? { ...p, status: PARTICIPANT_STATUS.PENDING } : p,
  );
  record.ballots = record.ballots.map((ballot) =>
    ballot.participantId === participantId && !ballot.invalidated
      ? { ...ballot, invalidated: true }
      : ballot,
  );
  record.audit = [
    ...record.audit,
    { type: "ballot-reset", participantId, userId: game.user.id, timestamp: Date.now() },
  ];
  await updatePrivateRecord(pollId, record);

  const projection = getActivePollProjection();
  if (projection?.pollId === pollId) {
    await setActivePollProjection({
      ...projection,
      participants: projection.participants.map((p) => (p.id === participantId ? { ...p, voted: false } : p)),
    });
  }
  await refreshLiveResults(pollId, record);
}

export async function excludeParticipant(pollId, participantId, reason = null) {
  const record = readPrivateRecord(pollId);
  if (!record) throw new Error(`No private record for poll ${pollId}`);

  record.participants = record.participants.map((p) =>
    p.id === participantId ? { ...p, status: PARTICIPANT_STATUS.EXCLUDED } : p,
  );
  record.snapshot.participants = record.snapshot.participants.map((p) =>
    p.id === participantId ? { ...p, excluded: true } : p,
  );
  record.audit = [
    ...record.audit,
    { type: "participant-excluded", participantId, reason, userId: game.user.id, timestamp: Date.now() },
  ];
  await updatePrivateRecord(pollId, record);

  const projection = getActivePollProjection();
  if (projection?.pollId === pollId) {
    await setActivePollProjection({
      ...projection,
      participants: projection.participants.filter((p) => p.id !== participantId),
    });
  }
  await refreshLiveResults(pollId, record);
  await closeIfFullyVoted(pollId, record);
}
