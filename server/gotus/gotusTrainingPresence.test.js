import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { registerTrainingHandlers } from "../realtime/registerTrainingHandlers.js";
import { resolveTargetQuizContext } from "../targetMiniGame/registerTargetQuizHandlers.js";

function fixture({ exhausted = false, expireDuringLoad = false } = {}) {
  const socket = new EventEmitter();
  Object.assign(socket, { id: "socket", roomId: "live", leave() {}, join() {} });
  const player = { nick: "Paul", userId: 7, installId: "account-7", connected: true };
  const lobby = { readyKeys: new Set(["user:7"]) };
  const round = { id: 42, endsAt: Date.now() + 90000, status: "running", targetMiniGame: { kind: "gotus" },
    special: { type: "target_long" }, targetFoundAt: new Map([["Paul", Date.now()]]) };
  const room = { id: "live", currentRound: round, players: new Map() };
  const calls = { clearedTimers: 0, emitted: 0, poolLoads: 0 };
  const noop = () => {};
  const identity = { userId: 7, installId: "account-7" };
  registerTrainingHandlers(socket, {
    requireSocketPlayerIdentity: () => identity,
    getRoom: () => room,
    normalizeTrainingMode: type => type === "normal" ? "normal" : null,
    normalizeTrainingDurationMs: () => 120000,
    ensureStandaloneTrainingPresence: () => {
      player.trainingPresenceOnly = true;
      room.players.set(socket.id, player);
      return player;
    },
    isHumanPlayer: () => true,
    isStandaloneTrainingPlayer: value => !!value?.standaloneTraining?.sessionId,
    ensureTournamentLobby: () => lobby,
    getPlayerReadyKey: () => "user:7",
    clearPlayerAfkTimer: () => { calls.clearedTimers += 1; },
    emitPlayers: () => { calls.emitted += 1; },
    emitRoomsStats: noop,
    maybeStartTournamentCountdown: noop,
    buildStandaloneTrainingLiveStatus: () => ({ roomId: "live", phase: "playing" }),
    getStandaloneTrainingObserverRoomId: () => "training:live",
    clearPresenceAnnouncement: noop,
    emitMedals: noop,
    getActiveModerationBan: () => null,
    getPlaytimeLimitStatus: () => ({ active: true, exhausted, remainingMs: exhausted ? 0 : 60000 }),
    buildPlaytimeBlockedResponse: playtimeLimit => ({ ok: false, error: "playtime_limit_exhausted", playtimeLimit }),
    joinSocketToChatRoom: noop,
    isMaintenanceModeActive: () => false,
    isStandaloneTrainingEnabled: () => true,
    trainingPoolStore: { getRandomEntry: async () => { calls.poolLoads += 1; if (expireDuringLoad) exhausted = true; return { id: "grid" }; } },
  });
  const request = (event, payload) => new Promise(resolve => socket.emit(event, { roomId: "live", sessionId: "local-gotus", type: "gotus", ...payload }, resolve));
  return { socket, player, room, lobby, calls, request, identity };
}

test("Gotus training uses isolated presence, clears ready/AFK, and is excluded from live rewards", async () => {
  const f = fixture();
  assert.equal((await f.request("training:standalone:presence")).ok, true);
  assert.equal(f.player.standaloneTraining.mode, "gotus");
  assert.equal(f.player.trainingPresenceOnly, true);
  assert.equal(f.lobby.readyKeys.size, 0);
  assert.equal(f.calls.clearedTimers, 1);
  assert.equal(f.calls.emitted, 1);
  assert.throws(() => resolveTargetQuizContext(f.socket, { roundId: 42, devPreview: true }, {
    getRoom: () => f.room,
    getSocketPlayerIdentity: () => f.identity,
    areDevToolsAllowedForSocket: () => true,
    miniGameKind: "gotus",
  }), /training_disabled/);
  assert.equal((await f.request("training:standalone:status")).ok, true);
  assert.equal(f.calls.poolLoads, 0);
  assert.equal((await f.request("training:standalone:stop", { joinLive: false })).ok, true);
  assert.equal(f.room.players.size, 0);
  assert.equal(f.player.standaloneTraining, null);
});

test("Gotus cannot request a live training-pool round by spoofing its local mode", async () => {
  const f = fixture();
  const result = await f.request("training:standalone:start");
  assert.equal(result.error, "training_mode_unsupported");
  assert.equal(f.calls.poolLoads, 0);
  assert.equal(f.room.players.size, 0);
});

test("Gotus reconnect restores the training mode through standalone status", async () => {
  const f = fixture();
  assert.equal((await f.request("training:standalone:status")).ok, true);
  assert.equal(f.player.standaloneTraining.mode, "gotus");
  assert.equal(f.calls.clearedTimers, 1);
  assert.equal(f.calls.emitted, 1);
});

test("exhausted accounts cannot start or restore any training, including Gotus", async () => {
  for (const event of ["training:start", "training:standalone:start", "training:standalone:presence", "training:standalone:status"]) {
    for (const type of ["normal", "gotus"]) {
      const f = fixture({ exhausted: true });
      const response = await f.request(event, { type, userId: 999 });
      assert.equal(response.error, "playtime_limit_exhausted", `${event}/${type}`);
      assert.equal(f.room.players.size, 0);
      assert.equal(f.calls.poolLoads, 0);
      assert.equal(f.calls.emitted, 0);
    }
  }
});

test("training cannot launch if the limit expires while fetching the grid", async () => {
  const f = fixture({ expireDuringLoad: true });
  const response = await f.request("training:standalone:start", { type: "normal" });
  assert.equal(response.error, "playtime_limit_exhausted");
  assert.equal(f.calls.poolLoads, 1);
  assert.equal(f.room.players.size, 0);
  assert.equal(f.player.standaloneTraining, undefined);
});
