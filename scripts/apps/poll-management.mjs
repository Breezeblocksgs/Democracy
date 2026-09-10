import { MODULE_ID, POLL_LIFECYCLE } from "../constants.mjs";
import { getActivePollProjection, clearActivePollProjection } from "../records/public-poll-setting.mjs";
import { readPrivateRecord, deletePrivateRecord } from "../records/private-poll-repository.mjs";
import { resetBallot, excludeParticipant } from "../gm-actions.mjs";
import { closePoll } from "../closure.mjs";
import { exportResultOnly, exportVoting } from "../records/journal-export.mjs";
import { buildActiveBallotMap } from "../domain/ballot-ledger.mjs";
import { secondsRemaining, formatCountdown } from "../domain/deadline.mjs";
import { computeLiveTally, formatLiveTallyRows } from "../domain/live-tally.mjs";
import { computePollStatus } from "../domain/poll-status.mjs";
import { resolveWinnerLabels } from "../domain/outcome-display.mjs";
import { openBallotForCurrentUser, openBuilder } from "../scene-controls.mjs";
import { getCinematicConfig, setCinematicConfig } from "../config-settings.mjs";
import { triggerCinematicPlay } from "../cinematic-coordinator.mjs";

const LIVE_REFRESH_INTERVAL_MS = 2000;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PollManagementApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "democracy-poll-management",
    tag: "form",
    classes: ["democracy", "democracy-poll-management"],
    window: { title: "DEMOCRACY.Management.Title", icon: "fa-solid fa-gavel" },
    position: { width: 520, height: "auto" },
    actions: {
      resetBallot: PollManagementApplication.#onResetBallot,
      excludeParticipant: PollManagementApplication.#onExcludeParticipant,
      closeVote: PollManagementApplication.#onCloseVote,
      cancelVote: PollManagementApplication.#onCancelVote,
      exportResultOnly: PollManagementApplication.#onExportResultOnly,
      exportVoting: PollManagementApplication.#onExportVoting,
      startNewPoll: PollManagementApplication.#onStartNewPoll,
      openBallot: PollManagementApplication.#onOpenBallot,
      switchTab: PollManagementApplication.#onSwitchTab,
      playCinematic: PollManagementApplication.#onPlayCinematic,
      pickCinematicImage: PollManagementApplication.#onPickCinematicImage,
      saveCinematicSettings: PollManagementApplication.#onSaveCinematicSettings,
    },
  };

  #exporting = false;
  #refreshInterval = null;
  #lastRenderIsActive = null;
  #activeTab = "management";

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/poll-management.hbs` },
  };

  async _prepareContext() {
    const projection = getActivePollProjection();
    if (!projection) return { hasActivePoll: false };

    const record = readPrivateRecord(projection.pollId);
    if (!record) {
      // The private record is gone (e.g. its JournalEntry was deleted by
      // hand) but the world setting still points at it — self-heal instead
      // of crashing on every render.
      await clearActivePollProjection();
      return { hasActivePoll: false };
    }

    const cinematicConfig = getCinematicConfig();
    const isActive = projection.lifecycle === POLL_LIFECYCLE.ACTIVE;

    const participants = record.snapshot.participants.map((snap) => {
      const status = record.participants.find((p) => p.id === snap.id)?.status ?? "pending";
      return {
        id: snap.id,
        name: snap.name,
        img: snap.img,
        status,
        statusLabel: game.i18n.localize(`DEMOCRACY.ParticipantStatus.${status}`),
      };
    });

    let liveTally = null;
    if (isActive) {
      const ballots = buildActiveBallotMap(record.ballots);
      const raw = computeLiveTally(record.snapshot, ballots);
      liveTally = formatLiveTallyRows(record.snapshot.pollType, raw, record.snapshot.options, {
        approve: game.i18n.localize("DEMOCRACY.ProposalChoice.approve"),
        disapprove: game.i18n.localize("DEMOCRACY.ProposalChoice.disapprove"),
        abstain: game.i18n.localize("DEMOCRACY.ProposalChoice.abstain"),
        pendingDelegation: game.i18n.localize("DEMOCRACY.Ballot.PendingDelegation"),
      });
    }

    const remaining = secondsRemaining(projection.deadline, game.time.serverTime);
    const statusLabel = game.i18n.localize(
      `DEMOCRACY.Status.${computePollStatus(projection.lifecycle, projection.closeReason)}`,
    );
    const winnerLabels = resolveWinnerLabels(record.snapshot.options, projection.outcome?.winners);

    const isClosed = projection.lifecycle === POLL_LIFECYCLE.CLOSED;

    return {
      hasActivePoll: true,
      projection,
      isActive,
      isClosed,
      isTimed: !!projection.deadline,
      countdownText: formatCountdown(remaining),
      statusLabel,
      liveTally,
      participants,
      outcome: projection.outcome ?? null,
      winnerLabels,
      turnout: projection.turnout ?? null,
      exporting: this.#exporting,
      activeTab: this.#activeTab,
      cinematicConfig,
      canPlayCinematic: isClosed,
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#lastRenderIsActive = context.isActive;
    clearInterval(this.#refreshInterval);
    if (context.isActive) {
      this.#refreshInterval = setInterval(() => this.#softRefresh(), LIVE_REFRESH_INTERVAL_MS);
    }
  }

  _onClose(options) {
    clearInterval(this.#refreshInterval);
    super._onClose?.(options);
  }

  /**
   * A full this.render() on a timer can destroy the DOM mid-click if the
   * tick lands between a user's mousedown and mouseup. Patch only the text
   * that can change from another client's action instead, and only fall
   * back to a full render for an actual structural change (poll closed).
   */
  async #softRefresh() {
    const context = await this._prepareContext();
    if (context.isActive !== this.#lastRenderIsActive) {
      this.render();
      return;
    }

    const root = this.element;
    if (!root) return;

    const countdownEl = root.querySelector(".democracy-countdown strong");
    if (countdownEl) countdownEl.textContent = context.countdownText ?? "";

    if (context.liveTally?.rows) {
      root.querySelectorAll(".democracy-live-bar-count").forEach((el, i) => {
        if (context.liveTally.rows[i]) el.textContent = context.liveTally.rows[i].count;
      });
    }

    root.querySelectorAll("[data-participant-row]").forEach((li) => {
      const p = context.participants.find((x) => x.id === li.dataset.participantRow);
      if (!p) return;
      const tag = li.querySelector(".tag");
      if (tag) tag.textContent = p.statusLabel;
    });
  }

  static async #onResetBallot(event, target) {
    const projection = getActivePollProjection();
    await resetBallot(projection.pollId, target.dataset.participantId);
    this.render();
  }

  static async #onExcludeParticipant(event, target) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("DEMOCRACY.ConfirmDialog.Title") },
      content: `<p>${game.i18n.localize("DEMOCRACY.Management.ConfirmExclude")}</p>`,
    });
    if (!confirmed) return;
    const projection = getActivePollProjection();
    await excludeParticipant(projection.pollId, target.dataset.participantId);
    this.render();
  }

  static async #onCloseVote() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("DEMOCRACY.ConfirmDialog.Title") },
      content: `<p>${game.i18n.localize("DEMOCRACY.Management.ConfirmClose")}</p>`,
    });
    if (!confirmed) return;
    const projection = getActivePollProjection();
    await closePoll(projection.pollId, { cancelled: false });
    this.render();
  }

  static async #onCancelVote() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("DEMOCRACY.ConfirmDialog.Title") },
      content: `<p>${game.i18n.localize("DEMOCRACY.Management.ConfirmCancel")}</p>`,
    });
    if (!confirmed) return;
    const projection = getActivePollProjection();
    await closePoll(projection.pollId, { cancelled: true });
    this.render();
  }

  static async #onExportResultOnly() {
    if (this.#exporting) return;
    this.#exporting = true;
    this.render();
    try {
      const entry = await exportResultOnly(getActivePollProjection().pollId);
      entry.sheet.render(true);
    } finally {
      this.#exporting = false;
      this.render();
    }
  }

  static async #onExportVoting() {
    if (this.#exporting) return;
    this.#exporting = true;
    this.render();
    try {
      const entry = await exportVoting(getActivePollProjection().pollId);
      entry.sheet.render(true);
    } finally {
      this.#exporting = false;
      this.render();
    }
  }

  static async #onStartNewPoll() {
    // Safe to delete only now: once the active-poll pointer moves on, nothing
    // in the module ever reads this poll's private record again (exports and
    // the closed-poll result view both still need it right up until this
    // point).
    const pollId = getActivePollProjection()?.pollId;
    await clearActivePollProjection();
    if (pollId) await deletePrivateRecord(pollId);
    openBuilder();
  }

  static async #onOpenBallot() {
    openBallotForCurrentUser();
  }

  static #onSwitchTab(event, target) {
    this.#activeTab = target.dataset.tab;
    this.render();
  }

  static #onPlayCinematic() {
    triggerCinematicPlay(getActivePollProjection());
  }

  static #onPickCinematicImage() {
    const current = this.element.querySelector("[name='backgroundImage']");
    new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: current?.value,
      callback: (path) => {
        current.value = path;
        this.element.querySelector(".democracy-cinematic-image-preview")?.setAttribute("src", path);
      },
    }).render(true);
  }

  static async #onSaveCinematicSettings(event, target) {
    const form = target.closest("form") ?? this.element;
    await setCinematicConfig({
      title: form.querySelector("[name='title']")?.value ?? "",
      playOnEnd: form.querySelector("[name='playOnEnd']")?.checked ?? false,
      pauseOnPlay: form.querySelector("[name='pauseOnPlay']")?.checked ?? false,
      backgroundImage: form.querySelector("[name='backgroundImage']")?.value ?? "",
    });
    ui.notifications.info(game.i18n.localize("DEMOCRACY.Cinematic.Saved"));
    this.render();
  }
}
