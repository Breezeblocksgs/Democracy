import { onSocketMessage, emitSocketMessage } from "./socket.mjs";
import { getCinematicConfig } from "./config-settings.mjs";
import { CinematicApplication } from "./apps/cinematic.mjs";
import { closeDemocracyTool } from "./scene-controls.mjs";

const ACTION = Object.freeze({
  PLAY: "cinematic-play",
  END: "cinematic-end",
});

let openCinematic = null;

/**
 * Every client registers this and reacts identically — unlike the ballot
 * coordinator, this is a broadcast, not a request/response: there is no
 * shared state to write, only a local UI action every client performs.
 */
export function registerCinematicCoordinator() {
  onSocketMessage((message) => {
    if (!message || typeof message !== "object") return;
    if (message.action === ACTION.PLAY) renderCinematic(message.projection, message.config);
    if (message.action === ACTION.END) closeCinematic();
  });
}

function renderCinematic(projection, config) {
  closeDemocracyTool();
  openCinematic?.close();
  openCinematic = new CinematicApplication({ projection, config });
  openCinematic.render(true);
}

function closeCinematic() {
  openCinematic?.close();
  openCinematic = null;
}

/**
 * GM action: play the cinematic on every connected client. A socket does
 * not reliably deliver a message back to the client that emitted it (the
 * same issue fixed once already for ballots), so this renders locally and
 * emits for everyone else.
 */
export function triggerCinematicPlay(projection) {
  const config = getCinematicConfig();
  renderCinematic(projection, config);
  emitSocketMessage({ version: 1, action: ACTION.PLAY, projection, config });
  if (game.user.isGM && config.pauseOnPlay) game.togglePause(true, true);
}

/** GM action: fade out and close the cinematic on every connected client. */
export function endCinematicForAll() {
  closeCinematic();
  emitSocketMessage({ version: 1, action: ACTION.END });
  if (game.user.isGM) game.togglePause(false, true);
}
