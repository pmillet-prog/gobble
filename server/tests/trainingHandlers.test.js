import test from "node:test";
import assert from "node:assert/strict";

import { registerTrainingHandlers } from "../realtime/registerTrainingHandlers.js";

function createSocket() {
  const handlers = new Map();
  return {
    id: "socket-1",
    roomId: "room-4x4",
    data: {},
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    trigger(eventName, ...args) {
      return handlers.get(eventName)?.(...args);
    },
    join() {},
    leave() {},
  };
}

function createHarness() {
  const socket = createSocket();
  const player = { nick: "Tigre", installId: "install-1" };
  const lobby = { readyKeys: new Set() };
  const room = {
    id: "room-4x4",
    players: new Map([[socket.id, player]]),
    currentRound: null,
  };
  const emissions = [];
  const activityKinds = [];
  let countdownChecks = 0;
  const dependencies = {
    appendRecentTrainingGridId: () => [],
    buildMaintenanceBlockedPayload: () => ({ ok: false, error: "maintenance" }),
    buildModerationBanResponse: () => ({ ok: false, error: "banned" }),
    buildPlaytimeBlockedResponse: () => ({ ok: false, error: "playtime_exhausted" }),
    buildSessionSnapshot: () => ({ phase: "lobby" }),
    buildStandaloneTrainingLiveStatus: () => ({ active: false }),
    buildStandaloneTrainingPayload: (value) => value,
    buildTournamentLobbyPayload: () => ({ readyCount: lobby.readyKeys.size }),
    clearPlayerAfkTimer: () => {},
    clearPresenceAnnouncement: () => {},
    emitMedals: () => emissions.push("medals"),
    emitPlayers: () => emissions.push("players"),
    emitRoomsStats: () => emissions.push("rooms"),
    emitTournamentLobby: () => emissions.push("lobby"),
    ensurePlayerInRound: () => {},
    ensureStandaloneTrainingPresence: () => player,
    ensureTournamentLobby: () => lobby,
    getActiveModerationBan: () => null,
    getPlayerReadyKey: () => "install:install-1",
    getPlaytimeLimitStatus: () => null,
    getRoom: () => room,
    getStandaloneTrainingObserverRoomId: () => "training-observers",
    getTeamDot: () => "🔴",
    getTeamForInstallCached: () => "red",
    isHumanPlayer: () => true,
    isInterTournamentLobbyOpen: () => true,
    isMaintenanceModeActive: () => false,
    isRoundActive: () => false,
    isStandaloneTrainingEnabled: () => true,
    isStandaloneTrainingPlayer: () => false,
    joinSocketToChatRoom: () => {},
    markPresenceJoinAnnounced: () => {},
    markSocketPlayerActivity: (_room, _socket, kind) => {
      activityKinds.push(kind);
      return false;
    },
    maybeStartTournamentCountdown: () => {
      countdownChecks += 1;
    },
    normalizeTrainingDurationMs: () => 60_000,
    normalizeTrainingMode: (value) => value || "normal",
    pushSystemChatMessage: () => {},
    randomUUID: () => "training-session-1",
    requireSocketPlayerIdentity: () => ({ installId: "install-1", userId: 1 }),
    startTrainingRound: async () => ({ ok: true }),
    trainingPoolStore: { getRandomEntry: async () => ({ id: "grid-1" }) },
    wasPresenceJoinAnnounced: () => false,
  };
  registerTrainingHandlers(socket, dependencies);
  return {
    activityKinds,
    dependencies,
    emissions,
    getCountdownChecks: () => countdownChecks,
    lobby,
    player,
    room,
    socket,
  };
}

test("tournament readiness preserves the lobby toggle contract", () => {
  const harness = createHarness();
  let response = null;

  harness.socket.trigger("tournament:ready", { ready: true }, (value) => {
    response = value;
  });

  assert.equal(response?.ok, true);
  assert.equal(response?.ready, true);
  assert.equal(harness.lobby.readyKeys.has("install:install-1"), true);
  assert.deepEqual(harness.activityKinds, ["ready"]);
  assert.equal(harness.getCountdownChecks(), 1);
});

test("player activity sanitizes arbitrary client labels", () => {
  const harness = createHarness();
  let response = null;

  harness.socket.trigger("player:activity", { kind: "<script>" }, (value) => {
    response = value;
  });

  assert.deepEqual(harness.activityKinds, ["interaction"]);
  assert.deepEqual(response, { ok: true, active: true, transitioned: false });
});

test("standalone training availability remains controlled by live dev state", async () => {
  const harness = createHarness();
  harness.dependencies.isStandaloneTrainingEnabled = () => false;
  let poolCalls = 0;
  harness.dependencies.trainingPoolStore.getRandomEntry = async () => {
    poolCalls += 1;
    return { id: "grid-1" };
  };
  registerTrainingHandlers(harness.socket, harness.dependencies);
  let response = null;

  await harness.socket.trigger("training:standalone:start", {}, (value) => {
    response = value;
  });

  assert.deepEqual(response, {
    ok: false,
    error: "maintenance",
    lobby: { readyCount: 0 },
  });
  assert.equal(poolCalls, 0);
});
