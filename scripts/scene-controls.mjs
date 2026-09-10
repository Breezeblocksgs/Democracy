import { MODULE_ID } from "./constants.mjs";
import { getActivePollProjection } from "./records/public-poll-setting.mjs";
import { PollBuilder } from "./apps/poll-builder.mjs";
import { PollManagementApplication } from "./apps/poll-management.mjs";
import { BallotApplication } from "./apps/ballot.mjs";

let singletonApp = null;

/** Unconditionally replace whatever Democracy window is open with a new one. */
function setSingleton(AppClass) {
  singletonApp?.close();
  singletonApp = new AppClass();
  singletonApp.render(true);
}

/** Toggle: closes if the same app is already open, otherwise replaces it. */
function toggleSingleton(AppClass) {
  if (singletonApp?.rendered && singletonApp.constructor === AppClass) {
    singletonApp.close();
    singletonApp = null;
    return;
  }
  setSingleton(AppClass);
}

export function openDemocracyTool() {
  const projection = getActivePollProjection();

  if (game.user.isGM) {
    // A Closed/Cancelled poll still routes here so the GM can view/export it;
    // Management itself offers "New Poll" to get back to the Builder.
    toggleSingleton(projection ? PollManagementApplication : PollBuilder);
    return;
  }

  if (!projection) {
    ui.notifications.info(game.i18n.localize("DEMOCRACY.Notifications.NoActiveVote"));
    return;
  }
  toggleSingleton(BallotApplication);
}

/** GM's explicit "Vote" action from Poll Management — the scene-control
 * button always routes a GM to Management while a poll exists, so this is
 * the GM's only path to cast a ballot (for an NPC, or an owned token). */
export function openBallotForCurrentUser() {
  setSingleton(BallotApplication);
}

/** Used by Poll Management's "New Poll" so the tracked singleton stays in sync. */
export function openBuilder() {
  setSingleton(PollBuilder);
}

/** Close whatever Democracy window is open — used when a cinematic starts. */
export function closeDemocracyTool() {
  singletonApp?.close();
  singletonApp = null;
}

export function registerSceneControls() {
  Hooks.on("getSceneControlButtons", (controls) => {
    const tokenControls = controls.tokens ?? controls.find?.((c) => c.name === "tokens");
    if (!tokenControls) return;

    const tool = {
      name: "democracy",
      title: "DEMOCRACY.SceneControls.Title",
      icon: "fa-solid fa-check-to-slot",
      button: true,
      onClick: openDemocracyTool,
    };

    if (Array.isArray(tokenControls.tools)) {
      tokenControls.tools.push(tool);
    } else if (tokenControls.tools && typeof tokenControls.tools === "object") {
      tokenControls.tools[tool.name] = tool;
    }
  });
}
