import { MODULE_ID } from "./constants.mjs";
import { registerSettings } from "./config-settings.mjs";
import { PollBuilder } from "./apps/poll-builder.mjs";
import { BallotApplication } from "./apps/ballot.mjs";
import { PollManagementApplication } from "./apps/poll-management.mjs";
import { registerBallotCoordinator } from "./ballot-coordinator.mjs";
import { registerSceneControls, openDemocracyTool } from "./scene-controls.mjs";
import { finalizeIfOverdue } from "./closure.mjs";
import { isCurrentUserAuthority } from "./authority.mjs";
import { registerCinematicCoordinator, triggerCinematicPlay } from "./cinematic-coordinator.mjs";
import { CinematicApplication } from "./apps/cinematic.mjs";
import { getActivePollProjection } from "./records/public-poll-setting.mjs";

const DEADLINE_CHECK_INTERVAL_MS = 5000;

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | initializing`);
  registerSettings();
  registerSceneControls();
});

Hooks.once("ready", () => {
  registerBallotCoordinator();
  registerCinematicCoordinator();
  game.modules.get(MODULE_ID).api = {
    PollBuilder,
    BallotApplication,
    PollManagementApplication,
    CinematicApplication,
  };

  if (isCurrentUserAuthority()) {
    finalizeIfOverdue();
    setInterval(() => {
      if (isCurrentUserAuthority()) finalizeIfOverdue();
    }, DEADLINE_CHECK_INTERVAL_MS);
  }

  // A new chat message can render its card in the pop-up chat notification
  // toast (outside #chat-log) before the Chat tab is ever opened, so this
  // has to listen at the document level to catch it there too.
  document.addEventListener("click", (event) => {
    const target = event.target.closest(
      "[data-action='democracy-open-vote'], [data-action='democracy-view-result'], [data-action='democracy-play-cinematic']",
    );
    if (!target) return;
    if (target.dataset.action === "democracy-play-cinematic") {
      triggerCinematicPlay(getActivePollProjection());
      return;
    }
    openDemocracyTool();
  });
});
