import { MODULE_ID } from "../constants.mjs";
import { CURRENT_SCHEMA_VERSION } from "../config-settings.mjs";

const PRIVATE_RECORD_KIND = "private-record";

/**
 * The complete private poll record (participants, ballots, audit trail) —
 * see README's "Known limitation: Secret Vote" for what this ownership
 * restriction does and does not protect against.
 */
export function findPrivateRecord(pollId) {
  return (
    game.journal.find(
      (entry) =>
        entry.getFlag(MODULE_ID, "kind") === PRIVATE_RECORD_KIND &&
        entry.getFlag(MODULE_ID, "pollId") === pollId,
    ) ?? null
  );
}

export function readPrivateRecord(pollId) {
  return findPrivateRecord(pollId)?.getFlag(MODULE_ID, "record") ?? null;
}

export async function createPrivateRecord(pollId, data) {
  if (findPrivateRecord(pollId)) {
    throw new Error(`Private record already exists for poll ${pollId}`);
  }
  return JournalEntry.create({
    name: `[Democracy Private] ${pollId}`,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    flags: {
      [MODULE_ID]: {
        kind: PRIVATE_RECORD_KIND,
        pollId,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        record: data,
      },
    },
  });
}

export async function updatePrivateRecord(pollId, data) {
  const entry = findPrivateRecord(pollId);
  if (!entry) throw new Error(`No private record for poll ${pollId}`);
  return entry.setFlag(MODULE_ID, "record", data);
}

export async function deletePrivateRecord(pollId) {
  const entry = findPrivateRecord(pollId);
  return entry?.delete();
}
