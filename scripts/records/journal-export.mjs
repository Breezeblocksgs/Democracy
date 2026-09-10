import { MODULE_ID, POLL_LIFECYCLE, PARTICIPANT_STATUS, POLL_TYPE } from "../constants.mjs";
import { CURRENT_SCHEMA_VERSION } from "../config-settings.mjs";
import { escapeHtml, sanitizePlainText } from "../domain/html-safety.mjs";
import { buildResultOnlyProjection, buildFullAuditProjection } from "../domain/projections.mjs";
import { readPrivateRecord } from "./private-poll-repository.mjs";

const EXPORT_MODE = Object.freeze({ RESULT_ONLY: "result-only", FULL_VOTING: "full-voting" });
const FOLDER_FLAG = "exportsFolder";

async function getOrCreateExportsFolder() {
  const existing = game.folders.find(
    (f) => f.type === "JournalEntry" && f.getFlag(MODULE_ID, FOLDER_FLAG) === true,
  );
  if (existing) return existing;

  return Folder.create({
    name: "Democracy Exports",
    type: "JournalEntry",
    flags: { [MODULE_ID]: { [FOLDER_FLAG]: true } },
  });
}

function findExistingExport(pollId, mode) {
  return (
    game.journal.find(
      (entry) =>
        entry.getFlag(MODULE_ID, "pollId") === pollId && entry.getFlag(MODULE_ID, "exportMode") === mode,
    ) ?? null
  );
}

function loc(key) {
  return game.i18n.localize(`DEMOCRACY.Export.${key}`);
}

function proposalChoiceLabel(key) {
  return game.i18n.localize(`DEMOCRACY.ProposalChoice.${key}`);
}

/** Human-readable side/option totals — never the raw internal tally object. */
function renderOutcomeBreakdown(resultOnly, snapshot) {
  if (resultOnly.outcome.tally) {
    const { A, D, S, F } = resultOnly.outcome.tally;
    const delegatedNote = F > 0 ? ` (${loc("IncludesDelegated")}: ${F})` : "";
    return `<ul>
      <li>${proposalChoiceLabel("approve")}: ${A}${delegatedNote}</li>
      <li>${proposalChoiceLabel("disapprove")}: ${D}</li>
      <li>${proposalChoiceLabel("abstain")}: ${S}</li>
    </ul>`;
  }

  if (resultOnly.outcome.support) {
    const winners = new Set(resultOnly.outcome.winners ?? []);
    const rows = (snapshot.options ?? [])
      .map((option) => {
        const count = resultOnly.outcome.support[option.id] ?? 0;
        const marker = winners.has(option.id) ? " ★" : "";
        return `<li>${escapeHtml(option.label)}: ${count}${marker}</li>`;
      })
      .join("");
    return `<ul>${rows}</ul>`;
  }

  return "";
}

function renderResultOnlyHtml(record, resultOnly) {
  const { snapshot } = record;
  return `
    <h2>${loc("PollSummary")}</h2>
    <p><strong>${escapeHtml(snapshot.title)}</strong></p>
    ${snapshot.description ? `<p>${escapeHtml(snapshot.description)}</p>` : ""}
    <p>${loc("Type")}: ${escapeHtml(
      game.i18n.localize(
        resultOnly.pollType === POLL_TYPE.PROPOSAL
          ? "DEMOCRACY.Builder.PollTypeProposal"
          : "DEMOCRACY.Builder.PollTypeChoice",
      ),
    )}</p>
    <p>${loc("Started")}: ${new Date(snapshot.startedAt).toLocaleString()}</p>
    <p>${loc("Closed")}: ${new Date(record.closedAt).toLocaleString()}</p>
    <ul>
      <li>${loc("Secret")}: ${resultOnly.settings.secretVote}</li>
      <li>${loc("LiveResults")}: ${resultOnly.settings.liveResults}</li>
      <li>${loc("Weighted")}: ${resultOnly.settings.weightedVote}</li>
      <li>${loc("Timed")}: ${resultOnly.settings.timedVote}</li>
      <li>${loc("QuorumEnabled")}: ${resultOnly.settings.quorumEnabled}</li>
    </ul>

    <h2>${loc("FinalResult")}</h2>
    <p><strong>${escapeHtml(game.i18n.localize(`DEMOCRACY.Result.${resultOnly.outcome.status}`))}</strong></p>
    ${renderOutcomeBreakdown(resultOnly, snapshot)}

    <h2>${loc("Turnout")}</h2>
    <ul>
      <li>${loc("AvailableVoters")}: ${resultOnly.turnout?.eligibleCount ?? 0}</li>
      <li>${loc("VotersWhoSubmitted")}: ${resultOnly.turnout?.submittedCount ?? 0}</li>
      <li>${loc("DidNotVote")}: ${resultOnly.turnout?.absentCount ?? 0}</li>
      <li>${loc("Abstained")}: ${resultOnly.abstainedCount}</li>
      <li>${loc("Excluded")}: ${resultOnly.excludedCount}</li>
      ${
        resultOnly.settings.weightedVote
          ? `<li>${loc("EligibleWeight")}: ${resultOnly.turnout?.eligibleWeight}</li>
             <li>${loc("SubmittedWeight")}: ${resultOnly.turnout?.submittedWeight}</li>`
          : ""
      }
    </ul>`;
}

function ownerNames(ownerUserIds) {
  return (ownerUserIds ?? []).map((id) => game.users.get(id)?.name ?? id).join(", ");
}

function describeBallotPayload(pollType, options, payload) {
  if (!payload) return "";
  if (pollType === POLL_TYPE.PROPOSAL) {
    return game.i18n.localize(`DEMOCRACY.ProposalChoice.${payload.choice}`);
  }
  if (payload.abstained) return game.i18n.localize("DEMOCRACY.Ballot.Abstain");
  return (payload.optionIds ?? [])
    .map((id) => options.find((option) => option.id === id)?.label ?? id)
    .join(", ");
}

function renderFullVotingHtml(record, resultOnly, full) {
  const { pollType, options } = record.snapshot;
  const rows = full.participants
    .map((p) => {
      const status = p.status;
      const ballotSummary =
        status === PARTICIPANT_STATUS.ABSENT
          ? loc("AbsentNoBallot")
          : status === PARTICIPANT_STATUS.EXCLUDED
            ? loc("Excluded")
            : escapeHtml(describeBallotPayload(pollType, options, p.ballot?.payload));
      return `<tr>
        <td>${escapeHtml(p.displayName ?? p.id)}</td>
        <td>${escapeHtml(ownerNames(p.ownerUserIds))}</td>
        <td>${p.weight}</td>
        <td>${escapeHtml(status)}</td>
        <td>${ballotSummary}</td>
      </tr>`;
    })
    .join("");

  const auditRows = (record.audit ?? [])
    .map((event) => `<tr><td>${escapeHtml(event.type)}</td><td>${new Date(event.timestamp).toISOString()}</td></tr>`)
    .join("");

  return `
    ${renderResultOnlyHtml(record, resultOnly)}

    <h2>${loc("CompleteVotingLedger")}</h2>
    <table>
      <thead><tr><th>${loc("Participant")}</th><th>${loc("Owners")}</th><th>${loc("Weight")}</th><th>${loc("Status")}</th><th>${loc("BallotColumn")}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <h2>${loc("AuditTrail")}</h2>
    <table>
      <thead><tr><th>${loc("Event")}</th><th>${loc("Timestamp")}</th></tr></thead>
      <tbody>${auditRows}</tbody>
    </table>`;
}

async function createExportEntry({ pollId, mode, name, htmlContent }) {
  const existing = findExistingExport(pollId, mode);
  if (existing) return existing;

  const folder = await getOrCreateExportsFolder();

  const entry = await JournalEntry.create({
    name: sanitizePlainText(name, 120),
    folder: folder?.id,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    flags: {
      [MODULE_ID]: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        pollId,
        exportMode: mode,
        finalizedAt: Date.now(),
      },
    },
  });

  await entry.createEmbeddedDocuments("JournalEntryPage", [
    {
      name: "Summary",
      type: "text",
      text: { content: htmlContent, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML },
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    },
  ]);

  return entry;
}

export async function exportResultOnly(pollId) {
  const record = readPrivateRecord(pollId);
  if (!record || record.lifecycle !== POLL_LIFECYCLE.CLOSED) {
    throw new Error("Only a Closed poll may be exported.");
  }

  const resultOnly = buildResultOnlyProjection({
    snapshot: record.snapshot,
    participants: record.participants,
    result: record.result,
  });

  return createExportEntry({
    pollId,
    mode: EXPORT_MODE.RESULT_ONLY,
    name: `[Democracy] ${record.snapshot.title} — Result`,
    htmlContent: renderResultOnlyHtml(record, resultOnly),
  });
}

export async function exportVoting(pollId) {
  const record = readPrivateRecord(pollId);
  if (!record || record.lifecycle !== POLL_LIFECYCLE.CLOSED) {
    throw new Error("Only a Closed poll may be exported.");
  }

  const resultOnly = buildResultOnlyProjection({
    snapshot: record.snapshot,
    participants: record.participants,
    result: record.result,
  });
  const full = buildFullAuditProjection({
    snapshot: record.snapshot,
    participants: record.participants,
    ballots: new Map(record.ballots.filter((b) => !b.invalidated).map((b) => [b.participantId, b])),
    result: record.result,
  });

  return createExportEntry({
    pollId,
    mode: EXPORT_MODE.FULL_VOTING,
    name: `[Democracy] ${record.snapshot.title} — Full Voting`,
    htmlContent: renderFullVotingHtml(record, resultOnly, full),
  });
}
