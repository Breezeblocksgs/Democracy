import { MODULE_ID, POLL_TYPE } from "../constants.mjs";
import { computeChoiceResultSummary } from "../domain/outcome-display.mjs";
import { endCinematicForAll } from "../cinematic-coordinator.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Staged reveal timings (ms), per the product spec: title fades in, the
// background starts fading in halfway through the title's own fade, then
// once the title finishes the poll title/description stagger in, and the
// framed result appears 2s after that.
const TITLE_FADE_MS = 1500;
const BG_START_DELAY_MS = TITLE_FADE_MS / 2;
const POLL_TITLE_START_DELAY_MS = TITLE_FADE_MS;
const POLL_DESCRIPTION_START_DELAY_MS = POLL_TITLE_START_DELAY_MS + 500;
const RESULT_START_DELAY_MS = POLL_TITLE_START_DELAY_MS + 2000;
const RESULT_FADE_MS = 1200;
const SEQUENCE_DONE_DELAY_MS = RESULT_START_DELAY_MS + RESULT_FADE_MS;
const END_FADE_OUT_MS = 1500;

export class CinematicApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "democracy-cinematic",
    classes: ["democracy", "democracy-cinematic"],
    window: { frame: false, positioned: false },
    actions: {
      close: CinematicApplication.#onClose,
      endCinematic: CinematicApplication.#onEndCinematic,
    },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/cinematic.hbs` },
  };

  #timers = [];
  #sequenceDone = false;

  constructor(options = {}) {
    super(options);
    this.projection = options.projection;
    this.config = options.config;
  }

  async _prepareContext() {
    const projection = this.projection;
    const isChoice = projection.pollType === POLL_TYPE.CHOICE;
    const summary = isChoice ? computeChoiceResultSummary(projection.outcome, projection.options) : null;

    return {
      title: this.config?.title || game.i18n.localize("DEMOCRACY.Cinematic.DefaultTitle"),
      backgroundImage: this.config?.backgroundImage,
      pollTitle: projection.title,
      pollDescription: projection.description,
      isChoice,
      isProposal: !isChoice,
      resultStatusLabel: game.i18n.localize(`DEMOCRACY.Result.${projection.outcome?.status ?? "no-decision"}`),
      summary,
      turnout: projection.turnout ?? null,
      isGm: game.user.isGM,
      sequenceDone: this.#sequenceDone,
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#clearTimers();
    const root = this.element;
    if (!root) return;

    this.#schedule(BG_START_DELAY_MS, () => root.classList.add("show-bg"));
    this.#schedule(0, () => root.classList.add("show-title"));
    this.#schedule(POLL_TITLE_START_DELAY_MS, () => root.classList.add("show-poll-title"));
    this.#schedule(POLL_DESCRIPTION_START_DELAY_MS, () => root.classList.add("show-poll-description"));
    this.#schedule(RESULT_START_DELAY_MS, () => root.classList.add("show-result"));
    this.#schedule(SEQUENCE_DONE_DELAY_MS, () => {
      this.#sequenceDone = true;
      root.querySelector('[data-action="close"]')?.removeAttribute("hidden");
    });
  }

  _onClose(options) {
    this.#clearTimers();
    super._onClose?.(options);
  }

  #schedule(delay, fn) {
    this.#timers.push(setTimeout(fn, delay));
  }

  #clearTimers() {
    this.#timers.forEach(clearTimeout);
    this.#timers = [];
  }

  static #onClose() {
    this.close();
  }

  static #onEndCinematic() {
    this.element?.classList.add("cinematic-fade-out");
    setTimeout(() => endCinematicForAll(), END_FADE_OUT_MS);
  }
}
