import test from "node:test";
import assert from "node:assert/strict";
import { createPlayerInactivityController, PLAYER_AFK_AFTER_MS, PLAYER_IDLE_EXIT_AFTER_MS } from "./createPlayerInactivityController.js";
import { registerSessionHandlers } from "./registerSessionHandlers.js";

function harness() {
  let timestamp = 1000;
  let nextTimer = 1;
  const timers = new Map();
  const notices = [];
  const afk = [];
  const player = { nick: "Test", userId: 1, installId: "install-1", connected: true, lastActivityAt: timestamp };
  const room = { id: "room-4x4", players: new Map([["socket-1", player]]), nickToInstallId: new Map() };
  const controller = createPlayerInactivityController({
    isHumanPlayer: p => !!p && !p.bot,
    isPlayerConnected: p => p?.connected !== false,
    isStandaloneTrainingPlayer: p => !!p?.standaloneTraining,
    onAfk: () => afk.push(timestamp),
    onIdleExit: (room, socketId, player, notice) => { room.players.delete(socketId); notices.push(notice); },
    now: () => timestamp,
    setTimeoutFn(callback, delay) { const id = nextTimer++; timers.set(id, { callback, at: timestamp + delay }); return id; },
    clearTimeoutFn: id => timers.delete(id),
  });
  function advance(ms) {
    const end = timestamp + ms;
    for (;;) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      timestamp = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    timestamp = end;
  }
  return { controller, room, player, timers, notices, afk, advance };
}

test("AFK indicator remains at two minutes; live presence is removed at five minutes total", () => {
  const h = harness();
  h.controller.schedulePlayerAfkTransition(h.room, "socket-1", h.player);
  h.advance(PLAYER_AFK_AFTER_MS - 1);
  assert.equal(h.controller.isPlayerAfk(h.player), false);
  h.advance(1);
  assert.equal(h.controller.isPlayerAfk(h.player), true);
  assert.equal(h.afk.length, 1);
  assert.equal(h.timers.size, 1);
  h.advance(PLAYER_IDLE_EXIT_AFTER_MS - PLAYER_AFK_AFTER_MS - 1);
  assert.equal(h.room.players.size, 1);
  h.advance(1);
  assert.equal(h.room.players.size, 0);
  assert.equal(h.notices[0].error, "player_idle");
  assert.equal(h.timers.size, 0);
  assert.equal(h.controller.getIdleExit(h.player), h.notices[0]);
});

test("real activity resets the deadline without duplicating timers", () => {
  const h = harness();
  h.controller.schedulePlayerAfkTransition(h.room, "socket-1", h.player);
  h.advance(240000);
  assert.equal(h.controller.markSocketPlayerActivity(h.room, { id: "socket-1" }, "submit_word"), true);
  assert.equal(h.controller.isPlayerAfk(h.player), false);
  assert.equal(h.timers.size, 1);
  h.advance(PLAYER_IDLE_EXIT_AFTER_MS - 1);
  assert.equal(h.notices.length, 0);
  h.advance(1);
  assert.equal(h.notices.length, 1);
});

test("bots, training presences and disconnected players do not own AFK timers", () => {
  for (const patch of [{ bot: true }, { standaloneTraining: {} }, { trainingPresenceOnly: true }, { connected: false }]) {
    const h = harness();
    Object.assign(h.player, patch);
    h.controller.schedulePlayerAfkTransition(h.room, "socket-1", h.player);
    h.advance(PLAYER_IDLE_EXIT_AFTER_MS);
    assert.equal(h.timers.size, 0);
    assert.equal(h.notices.length, 0);
  }
});

test("disconnect cleanup and replaced presences cannot evict a successor", () => {
  const h = harness();
  h.controller.schedulePlayerAfkTransition(h.room, "socket-1", h.player);
  const lateTimer = [...h.timers.values()][0].callback;
  h.controller.clearPlayerAfkTimer(h.player);
  assert.equal(h.timers.size, 0);
  h.room.players.set("socket-1", { ...h.player });
  h.advance(PLAYER_IDLE_EXIT_AFTER_MS);
  lateTimer();
  assert.equal(h.notices.length, 0);
  assert.equal(h.timers.size, 0);
});

function registerSession(h, id = "socket-2") {
  const handlers = new Map();
  const socket = { id, data: {}, on: (event, handler) => handlers.set(event, handler), join() {}, emit() {} };
  const noop = () => {};
  registerSessionHandlers(socket, {
    NICK_MAX_LEN: 25,
    requireSocketPlayerIdentity: () => ({ userId: 1, installId: "install-1" }),
    getActiveModerationBan: () => null,
    getPlaytimeLimitStatus: () => null,
    getRoom: () => h.room,
    isMaintenanceModeActive: () => false,
    isRoundActive: () => false,
    findPlayerByInstallId: room => {
      for (const [socketId, player] of room.players) if (player.installId === "install-1") return { socketId, player };
      return null;
    },
    playerInactivity: h.controller,
    clearPendingDisconnect: noop,
    clearPlayerAfkTimer: h.controller.clearPlayerAfkTimer,
    schedulePlayerAfkTransition: h.controller.schedulePlayerAfkTransition,
    io: { sockets: { sockets: new Map() } },
    persistenceClient: { upsertVocabularyProfile: noop },
    refreshInstallDuelCache: async () => {},
    joinSocketToChatRoom: noop,
    emitPlayers: noop, emitTournamentLobby: noop, emitMedals: noop, emitRoomsStats: noop,
    buildSessionSnapshot: () => ({ valid: true }),
    cleanupExpiredMedals: noop,
    normalizeInstallId: value => value,
    isBotToken: () => false,
    getTeamForInstallCached: () => null,
    getTeamDot: () => "",
    pushSystemChatMessage: noop,
    markPresenceJoinAnnounced: noop,
    appendConnectionLog: noop,
    getClientIpFromSocket: () => "",
  });
  return async (event, payload) => {
    let response;
    await handlers.get(event)(payload, value => { response = value; });
    return response;
  };
}

test("reconnecting preserves elapsed inactivity and an expired session cannot auto-rejoin", async () => {
  const h = harness();
  h.advance(240000);
  const request = registerSession(h);
  const resumed = await request("session:resume", { roomId: h.room.id, takeover: true });
  assert.equal(resumed.ok, true);
  assert.equal(h.room.players.get("socket-2").lastActivityAt, 1000);
  h.advance(60000);
  assert.equal(h.room.players.size, 0);
  assert.equal((await request("session:resume", { roomId: h.room.id, takeover: true })).error, "player_idle");
  assert.equal((await request("login", { roomId: h.room.id, nick: "Test", automaticResume: true })).error, "player_idle");
  assert.equal(h.room.players.size, 0);
  assert.equal((await request("login", { roomId: h.room.id, nick: "Test" })).ok, true);
  assert.equal(h.room.players.size, 1);
  assert.equal(h.controller.getIdleExit(h.player), null);
  h.controller.clearPlayerAfkTimer(h.room.players.get("socket-2"));
});

test("resume checks the elapsed deadline even before a delayed AFK timer runs", async () => {
  const h = harness();
  h.player.connected = false;
  h.advance(PLAYER_IDLE_EXIT_AFTER_MS);
  const request = registerSession(h);
  assert.equal((await request("session:resume", { roomId: h.room.id, takeover: true })).error, "player_idle");
  assert.equal(h.room.players.size, 0);
});

test("activity cannot revive an already removed idle presence", () => {
  const h = harness();
  h.controller.schedulePlayerAfkTransition(h.room, "socket-1", h.player);
  h.advance(PLAYER_IDLE_EXIT_AFTER_MS);
  assert.equal(h.controller.markSocketPlayerActivity(h.room, { id: "socket-1" }, "pointer"), false);
  assert.equal(h.room.players.size, 0);
  assert.equal(h.player.lastActivityAt, 1000);
  assert.equal(h.notices.length, 1);
});

test("a delayed timer does not evict a player who became active while still present", () => {
  const h = harness();
  h.controller.schedulePlayerAfkTransition(h.room, "socket-1", h.player);
  h.advance(PLAYER_AFK_AFTER_MS);
  const staleTimer = [...h.timers.values()][0].callback;
  h.advance(1000);
  h.controller.markSocketPlayerActivity(h.room, { id: "socket-1" }, "pointer");
  staleTimer();
  assert.equal(h.room.players.size, 1);
  assert.equal(h.notices.length, 0);
  assert.equal(h.timers.size, 1);
  h.advance(PLAYER_IDLE_EXIT_AFTER_MS - 1);
  assert.equal(h.notices.length, 0);
  h.advance(1);
  assert.equal(h.notices.length, 1);
});

test("login replacing a player on the same socket releases the previous AFK timer", async () => {
  const h = harness();
  h.controller.schedulePlayerAfkTransition(h.room, "socket-1", h.player);
  const oldTimer = h.player.afkTimer;
  const request = registerSession(h, "socket-1");
  assert.equal((await request("login", { roomId: h.room.id, nick: "Test" })).ok, true);
  const successor = h.room.players.get("socket-1");
  assert.notEqual(successor, h.player);
  assert.equal(h.player.afkTimer, null);
  assert.equal(h.timers.has(oldTimer), false);
  assert.equal(h.timers.size, 1);
  h.controller.clearPlayerAfkTimer(successor);
});
