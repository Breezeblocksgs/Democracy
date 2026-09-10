import { MODULE_ID } from "../constants.mjs";
import { POLL_TYPE, PROPOSAL_RULE, SUPERMAJORITY_BASIS, SUPERMAJORITY_PRESET } from "../constants.mjs";
import {
  createId,
  createOption,
  normalizeOptions,
  clampMaxSelections,
  defaultPollDraft,
} from "../domain/schema.mjs";
import { validateStartReadiness, validateOptions } from "../domain/validation.mjs";
import { describeTokenEligibility, findDuplicateActorTokenIds } from "../ownership.mjs";
import { setActivePollProjection, hasActivePoll as checkHasActivePoll } from "../records/public-poll-setting.mjs";
import { createPrivateRecord } from "../records/private-poll-repository.mjs";
import { PARTICIPANT_STATUS, POLL_LIFECYCLE } from "../constants.mjs";
import { postPollStartedMessage } from "../chat.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function tokenParticipantFromDocument(tokenDocument, weight = 1) {
  const eligibility = describeTokenEligibility(tokenDocument);
  return {
    id: tokenDocument.id,
    tokenUuid: tokenDocument.uuid,
    actorId: tokenDocument.actorId,
    name: tokenDocument.name,
    img: tokenDocument.texture?.src ?? tokenDocument.actor?.img ?? "icons/svg/mystery-man.svg",
    hidden: tokenDocument.hidden,
    weight,
    ...eligibility,
  };
}

export class PollBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "democracy-poll-builder",
    tag: "form",
    classes: ["democracy", "democracy-poll-builder"],
    window: {
      title: "DEMOCRACY.Builder.Title",
      icon: "fa-solid fa-check-to-slot",
      contentClasses: ["democracy-poll-builder-content"],
    },
    position: { width: 720, height: "auto" },
    form: {
      handler: PollBuilder.#onSubmitField,
      submitOnChange: true,
      closeOnSubmit: false,
    },
    actions: {
      addOption: PollBuilder.#onAddOption,
      removeOption: PollBuilder.#onRemoveOption,
      toggleParticipant: PollBuilder.#onToggleParticipant,
      bulkSelectPlayerOwned: PollBuilder.#onBulkSelectPlayerOwned,
      bulkSelectNpcs: PollBuilder.#onBulkSelectNpcs,
      bulkClear: PollBuilder.#onBulkClear,
      startVote: PollBuilder.#onStartVote,
      cancel: PollBuilder.#onCancel,
    },
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/poll-builder.hbs` },
  };

  #draft = defaultPollDraft();
  #availableSearch = "";
  #selectedSearch = "";

  async _prepareContext() {
    const scene = game.scenes?.active ?? canvas.scene;
    const sceneTokens = scene ? [...scene.tokens] : [];
    const selectedIds = new Set(this.#draft.participants.map((p) => p.id));

    const available = sceneTokens
      .filter((token) => !selectedIds.has(token.id))
      .filter((token) => token.name.toLowerCase().includes(this.#availableSearch.toLowerCase()))
      .map((token) => tokenParticipantFromDocument(token));

    const selected = this.#draft.participants.filter((p) =>
      p.name.toLowerCase().includes(this.#selectedSearch.toLowerCase()),
    );

    const duplicateActorIds = new Set(
      findDuplicateActorTokenIds(this.#draft.participants.map((p) => ({ id: p.id, actorId: p.actorId }))),
    );

    const hasActivePoll = checkHasActivePoll();
    const validation = {
      title: !!this.#draft.title.trim(),
      options: this.#draft.pollType !== POLL_TYPE.CHOICE || validateOptions(this.#draft.options),
      participants: this.#draft.participants.length > 0,
      noActivePoll: !hasActivePoll,
    };
    const canStart = validateStartReadiness(this.#draft, { hasActivePoll });

    return {
      draft: this.#draft,
      isProposal: this.#draft.pollType === POLL_TYPE.PROPOSAL,
      isChoice: this.#draft.pollType === POLL_TYPE.CHOICE,
      proposalRules: Object.values(PROPOSAL_RULE).map((value) => ({
        value,
        label: game.i18n.localize(`DEMOCRACY.Builder.ProposalRuleOption.${value}`),
      })),
      proposalRuleDescription: game.i18n.localize(
        `DEMOCRACY.Builder.ProposalRuleDescription.${this.#draft.proposalRule}`,
      ),
      isSupermajority: this.#draft.proposalRule === PROPOSAL_RULE.SUPERMAJORITY,
      supermajorityBases: Object.values(SUPERMAJORITY_BASIS).map((value) => ({
        value,
        label: game.i18n.localize(`DEMOCRACY.Builder.SupermajorityBasisOption.${value}`),
      })),
      availableTokens: available,
      selectedTokens: selected.map((p) => ({ ...p, isDuplicateActor: duplicateActorIds.has(p.id) })),
      hasDuplicateActors: duplicateActorIds.size > 0,
      hasNoSceneTokens: sceneTokens.length === 0,
      validation,
      canStart,
      hasActivePoll,
    };
  }

  static async #onSubmitField(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const draft = this.#draft;

    if (data.title !== undefined) draft.title = data.title;
    if (data.description !== undefined) draft.description = data.description;
    if (data.pollType !== undefined) draft.pollType = data.pollType;
    if (data.allowMultipleSelections !== undefined) {
      draft.allowMultipleSelections = !!data.allowMultipleSelections;
      draft.maxSelections = clampMaxSelections(draft.maxSelections, draft.options.length);
    }
    if (data.maxSelections !== undefined) {
      draft.maxSelections = clampMaxSelections(Number(data.maxSelections), draft.options.length);
    }
    if (data.options) {
      const labels = Object.keys(data.options)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => data.options[key]);
      draft.options = normalizeOptions(
        labels.map((label) => ({ label })),
        draft.options,
      );
      draft.maxSelections = clampMaxSelections(draft.maxSelections, draft.options.length);
    }
    if (data.secretVote !== undefined) draft.secretVote = !!data.secretVote;
    if (data.liveResults !== undefined) draft.liveResults = !!data.liveResults;
    if (data.weightedVote !== undefined) draft.weightedVote = !!data.weightedVote;
    if (data.timedVote !== undefined) draft.timedVote = !!data.timedVote;
    if (data.timerSeconds !== undefined) draft.timerSeconds = Number(data.timerSeconds);
    if (data.quorumEnabled !== undefined) draft.quorumEnabled = !!data.quorumEnabled;
    if (data.quorumPercent !== undefined) draft.quorumPercent = Number(data.quorumPercent);
    if (data.proposalRule !== undefined) draft.proposalRule = data.proposalRule;
    if (data.supermajorityBasis !== undefined) draft.supermajorityBasis = data.supermajorityBasis;
    if (data.supermajorityPreset !== undefined) {
      draft.supermajorityThreshold = SUPERMAJORITY_PRESET[data.supermajorityPreset] ?? draft.supermajorityThreshold;
    }
    if (data.weights) {
      for (const participant of draft.participants) {
        if (data.weights[participant.id] !== undefined) {
          participant.weight = Number(data.weights[participant.id]) || 1;
        }
      }
    }
    if (data.availableSearch !== undefined) this.#availableSearch = data.availableSearch;
    if (data.selectedSearch !== undefined) this.#selectedSearch = data.selectedSearch;

    // Deferred: this fires on a field's blur/change, which happens *before*
    // mouseup/click when the user's next click targets a different element
    // (e.g. "Add Option"). Rendering synchronously here would destroy that
    // element mid-click, silently swallowing the click and requiring a
    // second one. Deferring past the current click lets it land first.
    setTimeout(() => this.render(), 0);
  }

  static #onAddOption() {
    if (this.#draft.options.length >= 20) return;
    this.#draft.options = [...this.#draft.options, createOption("")];
    this.render();
  }

  static #onRemoveOption(event, target) {
    const optionId = target.dataset.optionId;
    if (this.#draft.options.length <= 2) return;
    this.#draft.options = this.#draft.options.filter((option) => option.id !== optionId);
    this.#draft.maxSelections = clampMaxSelections(this.#draft.maxSelections, this.#draft.options.length);
    this.render();
  }

  static #onToggleParticipant(event, target) {
    const tokenId = target.dataset.tokenId;
    const existingIndex = this.#draft.participants.findIndex((p) => p.id === tokenId);
    if (existingIndex >= 0) {
      this.#draft.participants = this.#draft.participants.filter((p) => p.id !== tokenId);
    } else {
      const scene = game.scenes?.active ?? canvas.scene;
      const tokenDocument = scene?.tokens.get(tokenId);
      if (!tokenDocument) return;
      this.#draft.participants = [...this.#draft.participants, tokenParticipantFromDocument(tokenDocument)];
    }
    this.render();
  }

  static #onBulkSelectPlayerOwned() {
    const scene = game.scenes?.active ?? canvas.scene;
    if (!scene) return;
    const selectedIds = new Set(this.#draft.participants.map((p) => p.id));
    const additions = [...scene.tokens]
      .filter((token) => !selectedIds.has(token.id) && !describeTokenEligibility(token).isNpc)
      .map((token) => tokenParticipantFromDocument(token));
    this.#draft.participants = [...this.#draft.participants, ...additions];
    this.render();
  }

  static #onBulkSelectNpcs() {
    const scene = game.scenes?.active ?? canvas.scene;
    if (!scene) return;
    const selectedIds = new Set(this.#draft.participants.map((p) => p.id));
    const additions = [...scene.tokens]
      .filter((token) => !selectedIds.has(token.id) && describeTokenEligibility(token).isNpc)
      .map((token) => tokenParticipantFromDocument(token));
    this.#draft.participants = [...this.#draft.participants, ...additions];
    this.render();
  }

  static #onBulkClear() {
    this.#draft.participants = [];
    this.render();
  }

  static async #onCancel() {
    await this.close();
  }

  static async #onStartVote() {
    if (!validateStartReadiness(this.#draft, { hasActivePoll: checkHasActivePoll() })) return;

    const pollId = createId("poll");
    // Real wall-clock time for display (game.time.serverTime is Foundry's
    // in-game/world time, not a Unix epoch — it renders as 1970 dates).
    const startedAt = Date.now();
    // The deadline still compares against the synchronized server clock so
    // a client's local clock can never extend or shorten it.
    const deadline = this.#draft.timedVote ? game.time.serverTime + this.#draft.timerSeconds * 1000 : null;

    const snapshot = {
      ...this.#draft,
      participants: this.#draft.participants.map((p) => ({ ...p, excluded: false })),
      startedAt,
      deadline,
    };

    const participantStatuses = snapshot.participants.map((p) => ({
      id: p.id,
      status: PARTICIPANT_STATUS.PENDING,
    }));

    await createPrivateRecord(pollId, {
      snapshot,
      participants: participantStatuses,
      ballots: [],
      audit: [{ type: "start", userId: game.user.id, timestamp: startedAt }],
      lifecycle: POLL_LIFECYCLE.ACTIVE,
      creatorUserId: game.user.id,
    });

    const projection = {
      pollId,
      title: snapshot.title,
      description: snapshot.description,
      pollType: snapshot.pollType,
      options: snapshot.options,
      allowMultipleSelections: snapshot.allowMultipleSelections,
      maxSelections: snapshot.maxSelections,
      secretVote: snapshot.secretVote,
      liveResults: snapshot.liveResults,
      weightedVote: snapshot.weightedVote,
      quorumEnabled: snapshot.quorumEnabled,
      quorumPercent: snapshot.quorumPercent,
      proposalRule: snapshot.proposalRule,
      supermajorityThreshold: snapshot.supermajorityThreshold,
      supermajorityBasis: snapshot.supermajorityBasis,
      lifecycle: POLL_LIFECYCLE.ACTIVE,
      startedAt,
      deadline,
      participants: participantStatuses.map((p) => ({ id: p.id, voted: false })),
      authorityUserId: game.user.id,
    };
    await setActivePollProjection(projection);
    await postPollStartedMessage(projection);

    await this.close();
  }
}
