import { MODULE_ID } from "./constants.mjs";
import { POLL_TYPE, POLL_LIFECYCLE } from "./constants.mjs";
import { escapeHtml } from "./domain/html-safety.mjs";

function pollTypeLabel(pollType) {
  return game.i18n.localize(
    pollType === POLL_TYPE.PROPOSAL ? "DEMOCRACY.Builder.PollTypeProposal" : "DEMOCRACY.Builder.PollTypeChoice",
  );
}

async function findExistingCard(pollId) {
  return game.messages.find((m) => m.getFlag(MODULE_ID, "pollId") === pollId) ?? null;
}

export async function postPollStartedMessage(projection) {
  const content = `
    <div class="democracy-chat-card">
      <h3>${escapeHtml(projection.title)}</h3>
      ${projection.description ? `<p>${escapeHtml(projection.description)}</p>` : ""}
      <p>${pollTypeLabel(projection.pollType)}</p>
      <button type="button" data-action="democracy-open-vote" data-poll-id="${projection.pollId}">
        ${game.i18n.localize("DEMOCRACY.Chat.OpenVote")}
      </button>
    </div>`;

  return ChatMessage.create({
    content,
    speaker: { alias: game.i18n.localize("DEMOCRACY.Title") },
    flags: { [MODULE_ID]: { pollId: projection.pollId, kind: "poll-card" } },
  });
}

export async function postPollClosedMessage(projection) {
  const outcomeLabel =
    projection.lifecycle === POLL_LIFECYCLE.CANCELLED
      ? game.i18n.localize("DEMOCRACY.Result.Cancelled")
      : game.i18n.localize(`DEMOCRACY.Result.${projection.outcome?.status ?? "no-decision"}`);

  const content = `
    <div class="democracy-chat-card">
      <h3>${escapeHtml(projection.title)}</h3>
      <p><strong>${outcomeLabel}</strong></p>
      <button type="button" data-action="democracy-view-result" data-poll-id="${projection.pollId}">
        ${game.i18n.localize("DEMOCRACY.Chat.ViewResult")}
      </button>
    </div>`;

  const existing = await findExistingCard(projection.pollId);
  if (existing) {
    return existing.update({ content });
  }

  return ChatMessage.create({
    content,
    speaker: { alias: game.i18n.localize("DEMOCRACY.Title") },
    flags: { [MODULE_ID]: { pollId: projection.pollId, kind: "poll-card" } },
  });
}

/** GM-only: the first actually-private chat content in this module. */
export async function postCinematicAvailableMessage(projection) {
  const content = `
    <div class="democracy-chat-card">
      <h3>${escapeHtml(projection.title)}</h3>
      <button type="button" data-action="democracy-play-cinematic" data-poll-id="${projection.pollId}">
        ${game.i18n.localize("DEMOCRACY.Chat.PlayCinematic")}
      </button>
    </div>`;

  return ChatMessage.create({
    content,
    speaker: { alias: game.i18n.localize("DEMOCRACY.Title") },
    whisper: ChatMessage.getWhisperRecipients("GM"),
    flags: { [MODULE_ID]: { pollId: projection.pollId, kind: "cinematic-card" } },
  });
}
