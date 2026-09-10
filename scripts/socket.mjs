import { MODULE_ID } from "./constants.mjs";

const SOCKET_EVENT = `module.${MODULE_ID}`;

export function onSocketMessage(handler) {
  game.socket.on(SOCKET_EVENT, handler);
}

export function emitSocketMessage(payload) {
  game.socket.emit(SOCKET_EVENT, payload);
}
