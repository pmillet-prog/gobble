import test from "node:test";
import assert from "node:assert/strict";

import { registerSessionHandlers } from "../realtime/registerSessionHandlers.js";

function createSocket() {
  const handlers = new Map();
  const emitted = [];
  const joined = [];
  return {
    id: "socket-1",
    data: {},
    handshake: { headers: { "user-agent": "test-agent" } },
    emitted,
    joined,
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    emit(eventName, payload) {
      emitted.push({ eventName, payload });
    },
    join(roomId) {
      joined.push(roomId);
    },
    trigger(eventName, ...args) {
      return handlers.get(eventName)?.(...args);
    },
  };
}

function createHarness() {
  const socket = createSocket();
  const room = {
    id: "room-4x4",
    config: { durationMs: 120_000 },
    players: new Map(),
    nickToInstallId: new Map(),
    chatMessages: [{ id: "history-1", text: "bonjour" }],
    currentRound: null,
    breakState: null,
  };
  const identity = {
    installId: "install-1",
    userId: 7,
  };
  const systemMessages = [];
  const connectionLogs = [];
  const dependencies = {
    NICK_MAX_LEN: 24,
    appendConnectionLog: (entry) => connectionLogs.push(entry),
    buildModerationBanResponse: () => ({ ok: false, error: "banned" }),
    buildPlaytimeBlockedResponse: () => ({ ok: false, error: "playtime_exhausted" }),
    buildRankingUpdatePayload: () => null,
    buildRoundStartedPayload: () => null,
    buildSessionSnapshot: (_room, player) => ({ nick: player.nick, phase: "lobby" }),
    buildTournamentLobbyPayload: () => ({ readyCount: 0 }),
    clearPendingDisconnect: () => {},
    clearPlayerAfkTimer: () => {},
    cleanupExpiredMedals: () => {},
    emitMedals: () => {},
    emitPlayers: () => {},
    emitRoomsStats: () => {},
    emitTournamentLobby: () => {},
    ensurePlayerInRound: () => {},
    expandTargetRevealed: (_word, revealed) => revealed,
    findPlayerByInstallId: () => null,
    getActiveModerationBan: () => null,
    getClientIpFromSocket: () => "127.0.0.1",
    getPlaytimeLimitStatus: () => ({ active: false, exhausted: false }),
    getRoom: (roomId) => (roomId === room.id ? room : null),
    getTargetHintScheduleMs: () => [],
    getTeamDot: () => "🔴",
    getTeamForInstallCached: () => "red",
    io: { sockets: { sockets: new Map() } },
    isBotToken: () => false,
    isRoundActive: () => false,
    joinSocketToChatRoom: () => {},
    markPresenceJoinAnnounced: () => {},
    normalizeInstallId: (value) => String(value || "").trim(),
    normalizeTargetRevealIndices: (value) => value,
    persistenceClient: { upsertVocabularyProfile: () => {} },
    pushSystemChatMessage: (_room, text, meta) => systemMessages.push({ text, meta }),
    refreshInstallDuelCache: async () => {},
    requireSocketPlayerIdentity: () => identity,
    resolveTargetHintCells: () => [],
    schedulePlayerAfkTransition: () => {},
  };
  registerSessionHandlers(socket, dependencies);
  return {
    connectionLogs,
    dependencies,
    identity,
    room,
    socket,
    systemMessages,
  };
}

test("login binds the authenticated identity and preserves initial socket events", async () => {
  const harness = createHarness();
  let response = null;

  await harness.socket.trigger(
    "login",
    { nick: " Tigre ", roomId: "room-4x4", clientId: "client-1" },
    (value) => {
      response = value;
    }
  );

  assert.deepEqual(response, { ok: true, roomId: "room-4x4" });
  assert.deepEqual(harness.room.players.get(harness.socket.id), {
    nick: "Tigre",
    token: "client-1",
    userId: 7,
    installId: "install-1",
    connected: true,
    lastSeenAt: harness.room.players.get(harness.socket.id).lastSeenAt,
    lastActivityAt: harness.room.players.get(harness.socket.id).lastActivityAt,
  });
  assert.equal(harness.socket.data.userId, 7);
  assert.equal(harness.socket.data.installId, "install-1");
  assert.deepEqual(harness.socket.joined, ["room-4x4"]);
  assert.equal(harness.systemMessages.length, 1);
  assert.equal(harness.connectionLogs[0].userAgent, "test-agent");
  assert.deepEqual(harness.socket.emitted[0], {
    eventName: "chat:history",
    payload: harness.room.chatMessages,
  });
  assert.deepEqual(harness.socket.emitted[1], {
    eventName: "tournamentLobbyUpdate",
    payload: { readyCount: 0 },
  });
});

test("session resume enforces playtime before looking up a room", async () => {
  const harness = createHarness();
  let roomLookups = 0;
  harness.dependencies.getPlaytimeLimitStatus = () => ({ active: true, exhausted: true });
  harness.dependencies.getRoom = () => {
    roomLookups += 1;
    return harness.room;
  };
  registerSessionHandlers(harness.socket, harness.dependencies);
  let response = null;

  await harness.socket.trigger(
    "session:resume",
    { roomId: "room-4x4" },
    (value) => {
      response = value;
    }
  );

  assert.deepEqual(response, {
    ok: false,
    error: "playtime_exhausted",
    available: false,
  });
  assert.equal(roomLookups, 0);
});

test("login still rejects a nickname owned by another install", async () => {
  const harness = createHarness();
  harness.room.players.set("socket-other", {
    nick: "Tigre",
    installId: "install-other",
  });
  let response = null;

  await harness.socket.trigger("login", { nick: "Tigre" }, (value) => {
    response = value;
  });

  assert.deepEqual(response, { ok: false, error: "pseudo_taken" });
  assert.equal(harness.room.players.has(harness.socket.id), false);
});
