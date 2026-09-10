import { MODULE_ID } from "../constants.mjs";
import { POLL_TYPE, PROPOSAL_CHOICE, PARTICIPANT_STATUS, POLL_LIFECYCLE } from "../constants.mjs";
import { getActivePollProjection } from "../records/public-poll-setting.mjs";
import { readPrivateRecord } from "../records/private-poll-repository.mjs";
import { submitBallotRequest } from "../ballot-coordinator.mjs";
import { secondsRemaining, formatCountdown } from "../domain/deadline.mjs";
import { formatLiveTallyRows } from "../domain/live-tally.mjs";
import { computePollStatus } from "../domain/poll-status.mjs";
import { resolveWinnerLabels } from "../domain/outcome-display.mjs";

const LIVE_REFRESH_INTERVAL_MS = 2000;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function eligibleParticipantsForCurrentUser(record) {
  if (!record) return [];
  // The GM can act on any participant (NPC directly, or a player-owned one
  // via an explicit override) — see the confirmation gate in #onSubmit.
  return record.snapshot.participants
    .filter((p) => !p.excluded && (game.user.isGM || p.ownerUserIds?.includes(game.user.id)))
    .map((p) => {
      const status = record.participants.find((s) => s.id === p.id)?.status ?? PARTICIPANT_STATUS.PENDING;
      return { ...p, status };
    });
}

export class BallotApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "democracy-ballot",
    tag: "form",
    classes: ["democracy", "democracy-ballot"],
    window: { title: "DEMOCRACY.Ballot.Title", icon: "fa-solid fa-check-to-slot" },
    position: { width: 480, height: "auto" },
    actions: {
      selectParticipant: BallotApplication.#onSelectParticipant,
      selectProposalChoice: BallotApplication.#onSelectProposalChoice,
      toggleOption: BallotApplication.#onToggleOption,
      toggleAbstain: BallotApplication.#onToggleAbstain,
      submit: BallotApplication.#onSubmit,
    },
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/ballot.hbs` },
  };

  #selectedParticipantId = null;
  #proposalChoice = null;
  #choiceOptionIds = [];
  #abstained = false;
  #submissionState = "ready";
  #rejectionReason = null;
  #refreshInterval = null;
  #lastRenderIsActive = null;
  #lastRenderAlreadyVoted = null;

  async _prepareContext() {
    const projection = getActivePollProjection();
    if (!projection) {
      return { hasActivePoll: false };
    }

    const record = readPrivateRecord(projection.pollId);
    const eligible = eligibleParticipantsForCurrentUser(record).map((p) => ({
      ...p,
      statusLabel: game.i18n.localize(`DEMOCRACY.ParticipantStatus.${p.status}`),
    }));

    if (!this.#selectedParticipantId || !eligible.some((p) => p.id === this.#selectedParticipantId)) {
      const firstPending = eligible.find((p) => p.status === PARTICIPANT_STATUS.PENDING);
      this.#selectedParticipantId = firstPending?.id ?? eligible[0]?.id ?? null;
    }

    const activeParticipant = eligible.find((p) => p.id === this.#selectedParticipantId) ?? null;
    const isProposal = projection.pollType === POLL_TYPE.PROPOSAL;
    const alreadyVoted = activeParticipant?.status !== PARTICIPANT_STATUS.PENDING;
    const isActive = projection.lifecycle === POLL_LIFECYCLE.ACTIVE;
    const canCastBallot = isActive && !alreadyVoted;

    const remaining = secondsRemaining(projection.deadline, game.time.serverTime);
    const countdownText = formatCountdown(remaining);
    const statusLabel = game.i18n.localize(
      `DEMOCRACY.Status.${computePollStatus(projection.lifecycle, projection.closeReason)}`,
    );

    const liveTally =
      projection.liveResults && projection.liveTally
        ? formatLiveTallyRows(projection.pollType, projection.liveTally, projection.options, {
            approve: game.i18n.localize("DEMOCRACY.ProposalChoice.approve"),
            disapprove: game.i18n.localize("DEMOCRACY.ProposalChoice.disapprove"),
            abstain: game.i18n.localize("DEMOCRACY.ProposalChoice.abstain"),
            pendingDelegation: game.i18n.localize("DEMOCRACY.Ballot.PendingDelegation"),
          })
        : null;

    const winnerLabels = resolveWinnerLabels(projection.options, projection.outcome?.winners);

    return {
      hasActivePoll: true,
      projection,
      isProposal,
      isChoice: !isProposal,
      isActive,
      canCastBallot,
      countdownText,
      isTimed: !!projection.deadline,
      liveTally,
      statusLabel,
      outcome: projection.outcome ?? null,
      winnerLabels,
      turnout: projection.turnout ?? null,
      eligible,
      activeParticipant,
      alreadyVoted,
      proposalChoice: this.#proposalChoice,
      proposalChoices: Object.values(PROPOSAL_CHOICE).map((value) => ({
        value,
        label: game.i18n.localize(`DEMOCRACY.ProposalChoice.${value}`),
      })),
      options: (projection.options ?? []).map((option) => ({
        ...option,
        selected: this.#choiceOptionIds.includes(option.id),
      })),
      allowMultipleSelections: projection.allowMultipleSelections,
      selectedCount: this.#choiceOptionIds.length,
      maxSelections: projection.maxSelections,
      abstained: this.#abstained,
      canSubmit:
        canCastBallot &&
        this.#submissionState === "ready" &&
        (isProposal ? !!this.#proposalChoice : this.#abstained || this.#choiceOptionIds.length > 0),
      submissionState: this.#submissionState,
      rejectionReasonLabel: this.#rejectionReason
        ? game.i18n.localize(`DEMOCRACY.Ballot.RejectionReason.${this.#rejectionReason}`)
        : null,
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#lastRenderIsActive = context.isActive;
    this.#lastRenderAlreadyVoted = context.alreadyVoted;
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
   * tick lands between a user's mousedown and mouseup — the click then has
   * nothing left to land on and appears to require a second try. Patch
   * only the few text nodes that can change from another client's action
   * instead, and only fall back to a full render for an actual structural
   * change (poll closed, or this participant's own vote landed).
   */
  async #softRefresh() {
    const context = await this._prepareContext();
    if (context.isActive !== this.#lastRenderIsActive || context.alreadyVoted !== this.#lastRenderAlreadyVoted) {
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

    root.querySelectorAll(".democracy-participant-tab").forEach((tab) => {
      const p = context.eligible.find((e) => e.id === tab.dataset.participantId);
      if (!p) return;
      const statusEl = tab.querySelector(".democracy-tab-status");
      if (statusEl) statusEl.textContent = p.statusLabel;
      [...tab.classList].filter((c) => c.startsWith("status-")).forEach((c) => tab.classList.remove(c));
      tab.classList.add(`status-${p.status}`);
    });
  }

  static #onSelectParticipant(event, target) {
    this.#selectedParticipantId = target.dataset.participantId;
    this.#proposalChoice = null;
    this.#choiceOptionIds = [];
    this.#abstained = false;
    this.#submissionState = "ready";
    this.render();
  }

  static #onSelectProposalChoice(event, target) {
    this.#proposalChoice = target.dataset.choice;
    this.render();
  }

  static #onToggleOption(event, target) {
    const optionId = target.dataset.optionId;
    this.#abstained = false;
    const projection = getActivePollProjection();
    if (this.#choiceOptionIds.includes(optionId)) {
      this.#choiceOptionIds = this.#choiceOptionIds.filter((id) => id !== optionId);
    } else if (projection.allowMultipleSelections) {
      if (this.#choiceOptionIds.length < projection.maxSelections) {
        this.#choiceOptionIds = [...this.#choiceOptionIds, optionId];
      }
    } else {
      this.#choiceOptionIds = [optionId];
    }
    this.render();
  }

  static #onToggleAbstain() {
    this.#abstained = !this.#abstained;
    if (this.#abstained) this.#choiceOptionIds = [];
    this.render();
  }

  static async #onSubmit() {
    const projection = getActivePollProjection();
    if (!projection || !this.#selectedParticipantId) return;

    const isOverride =
      game.user.isGM &&
      !this.#activeParticipantOwnedByCurrentUser() &&
      !this.#activeParticipantIsNpc();

    if (isOverride) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("DEMOCRACY.ConfirmDialog.Title") },
        content: `<p>${game.i18n.localize("DEMOCRACY.Ballot.ConfirmOverride")}</p>`,
      });
      if (!confirmed) return;
    }

    const payload =
      projection.pollType === POLL_TYPE.PROPOSAL
        ? { choice: this.#proposalChoice }
        : this.#abstained
          ? { abstained: true }
          : { optionIds: this.#choiceOptionIds };

    this.#submissionState = "sending";
    this.render();

    const result = await submitBallotRequest(projection.pollId, this.#selectedParticipantId, payload, {
      isGmOverride: isOverride,
    });

    this.#submissionState = result.accepted ? "accepted" : "rejected";
    this.#rejectionReason = result.accepted ? null : result.reason;
    this.render();
  }

  #activeParticipantOwnedByCurrentUser() {
    const record = readPrivateRecord(getActivePollProjection()?.pollId);
    const snap = record?.snapshot.participants.find((p) => p.id === this.#selectedParticipantId);
    return snap?.ownerUserIds?.includes(game.user.id) ?? false;
  }

  #activeParticipantIsNpc() {
    const record = readPrivateRecord(getActivePollProjection()?.pollId);
    const snap = record?.snapshot.participants.find((p) => p.id === this.#selectedParticipantId);
    return snap?.isNpc ?? false;
  }
}
