import test from "node:test";
import assert from "node:assert/strict";

import { registerDisconnectHandler } from "../realtime/registerDisconnectHandler.js";

test("disconnect marks the player offline, clears readiness, then announces final departure", async () => {
  let disconnectHandler = null;
  const socket = {
    id: "socket-1",
    roomId: "room-4x4",
    on(eventName, handler) {
      if (eventName === "disconnect") disconnectHandler = handler;
    },
  };
  const player = {
    nick: "Tigre",
    installId: "install-1",
    token: null,
    connected: true,
  };
  const readyKeys = new Set(["install:install-1"]);
  const room = {
    id: "room-4x4",
    players: new Map([[socket.id, player]]),
    medals: new Map(),
    medalExpiry: new Map(),
    pendingDisconnects: new Map(),
  };
  const chatMessages = [];
  const emissions = [];

  registerDisconnectHandler(socket, {
    DISCONNECT_GRACE_MS: 0,
    MEDALS_TTL_AFTER_DISCONNECT_MS: 10_000,
    clearPendingDisconnect: (_room, socketId) => {
      const pending = room.pendingDisconnects.get(socketId);
      if (pending?.timer) clearTimeout(pending.timer);
      room.pendingDisconnects.delete(socketId);
    },
    clearPlayerAfkTimer: () => {},
    clearPresenceAnnouncement: () => {},
    emitMedals: () => emissions.push("medals"),
    emitPlayers: () => emissions.push("players"),
    emitRoomsStats: () => emissions.push("rooms"),
    emitTournamentLobby: () => emissions.push("lobby"),
    ensureTournamentLobby: () => ({ readyKeys }),
    getMedalKeyForPlayer: () => "install:install-1",
    getPlayerReadyKey: () => "install:install-1",
    getRoom: () => room,
    getTeamDot: () => "🔴",
    getTeamForInstallCached: () => "red",
    isBotToken: () => false,
    maybeStartTournamentCountdown: () => emissions.push("countdown"),
    normalizeInstallId: (value) => String(value || "").trim(),
    persistRoomMedals: () => {},
    pushSystemChatMessage: (_room, text, meta) => chatMessages.push({ text, meta }),
    wasPresenceJoinAnnounced: () => true,
  });

  disconnectHandler();

  assert.equal(player.connected, false);
  assert.equal(readyKeys.size, 0);
  assert.equal(room.pendingDisconnects.has(socket.id), true);
  assert.deepEqual(emissions.slice(0, 4), ["players", "lobby", "rooms", "countdown"]);

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(room.players.has(socket.id), false);
  assert.equal(room.pendingDisconnects.has(socket.id), false);
  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].text, "Tigre 🔴 a quitté le tournoi");
  assert.deepEqual(chatMessages[0].meta.meta, { kind: "leave_tournament" });
});
