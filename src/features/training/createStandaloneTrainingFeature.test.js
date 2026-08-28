import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { buildTrainingTargetHintSchedule } from "../../training/standaloneTraining.js";
import { createStandaloneTrainingFeature } from "./createStandaloneTrainingFeature.js";

function createSocket(responses = {}) {
  const listeners = new Map();
  const emitted = [];
  return {
    connected: false,
    emitted,
    emit(eventName, payload, callback) {
      emitted.push({ eventName, payload });
      if (typeof callback === "function" && eventName in responses) {
        callback(responses[eventName]);
      }
    },
    fire(eventName) {
      for (const listener of listeners.get(eventName) || []) listener();
    },
    listenerCount(eventName) {
      return listeners.get(eventName)?.size || 0;
    },
    off(eventName, listener) {
      listeners.get(eventName)?.delete(listener);
    },
    on(eventName, listener) {
      const bucket = listeners.get(eventName) || new Set();
      bucket.add(listener);
      listeners.set(eventName, bucket);
    },
  };
}

function createTimers() {
  const pending = new Map();
  let nextId = 1;
  return {
    clearTimeoutFn(id) {
      pending.delete(id);
    },
    delays() {
      return [...pending.values()].map(({ delayMs }) => delayMs);
    },
    pending,
    runDelay(delayMs) {
      const entry = [...pending.entries()].find(([, timer]) => timer.delayMs === delayMs);
      assert.ok(entry, `timer ${delayMs} ms attendu`);
      pending.delete(entry[0]);
      entry[1].callback();
    },
    setTimeoutFn(callback, delayMs) {
      const id = nextId++;
      pending.set(id, { callback, delayMs });
      return id;
    },
  };
}

test("standalone training owns session, reconnect presence, target hints and cleanup", async () => {
  const training = {
    durationMs: 30_000,
    grid: [
      { letter: "C" },
      { letter: "H" },
      { letter: "A" },
      { letter: "T" },
    ],
    gridId: "training-grid-1",
    label: "Mot cible",
    mode: "target_long",
    sessionId: "training-session-1",
    startedAt: 4_000,
    targetLength: 4,
    targetPath: [0, 1, 2, 3],
    targetWord: "chat",
  };
  const socket = createSocket({
    "training:standalone:start": {
      liveStatus: { roomId: "room-live" },
      ok: true,
      training,
    },
  });
  const timers = createTimers();
  const hints = [];
  const launches = [];
  const scope = createResourceScope("standalone-training-test");
  const feature = createStandaloneTrainingFeature(
    { scope },
    {
      clearTimeoutFn: timers.clearTimeoutFn,
      now: () => 10_000,
      setTimeoutFn: timers.setTimeoutFn,
    }
  );

  feature.configure({
    ensureConnection: async () => true,
    getIdentityPayload: () => ({
      installId: "install-1",
      nick: "Tigre",
      roomId: "room-4x4",
    }),
    getNowServerMs: () => 10_000,
    onHint: (hint) => hints.push(hint),
    onLaunch: (...args) => launches.push(args),
    phase: "lobby",
    socket,
  });
  feature.start();

  assert.equal(socket.listenerCount("connect"), 0);
  assert.equal(await feature.startTraining("target_long", "Cible longue", 30_000), true);
  assert.equal(socket.listenerCount("connect"), 1);
  assert.equal(feature.store.getState().busy, false);
  assert.equal(feature.refs.session.current.startedAt, 10_000);
  assert.equal(feature.refs.session.current.serverPreparedAt, 4_000);
  assert.equal(feature.refs.session.current.requestedLabel, "Cible longue");
  assert.equal(launches.length, 1);
  assert.equal(
    socket.emitted[0].eventName,
    "training:standalone:start"
  );
  assert.deepEqual(socket.emitted[0].payload, {
    durationMs: 30_000,
    installId: "install-1",
    nick: "Tigre",
    roomId: "room-4x4",
    type: "target_long",
  });

  feature.configure({ phase: "playing" });
  const hintSchedule = buildTrainingTargetHintSchedule(30_000, 4);
  assert.deepEqual(timers.delays(), hintSchedule);
  timers.runDelay(hintSchedule[0]);
  assert.equal(hints.length, 1);
  assert.equal(hints[0].kind, "target_long");
  assert.equal(hints[0].wordIndices.length, 1);

  socket.fire("connect");
  socket.fire("connect");
  assert.equal(timers.delays().filter((delayMs) => delayMs === 900).length, 1);
  assert.equal(timers.delays().filter((delayMs) => delayMs === 2400).length, 1);
  assert.ok(timers.delays().includes(900));
  assert.ok(timers.delays().includes(2400));
  timers.runDelay(900);
  const presence = socket.emitted.at(-1);
  assert.equal(presence.eventName, "training:standalone:presence");
  assert.deepEqual(presence.payload, {
    durationMs: 30_000,
    gridId: "training-grid-1",
    installId: "install-1",
    nick: "Tigre",
    roomId: "room-4x4",
    sessionId: "training-session-1",
    startedAt: 10_000,
    type: "target_long",
  });

  scope.dispose();
  assert.equal(socket.listenerCount("connect"), 0);
  assert.equal(timers.pending.size, 0);
  assert.equal(feature.refs.session.current, null);
  assert.deepEqual(feature.store.getState(), {
    busy: false,
    joinDialog: null,
    session: null,
  });
});

test("standalone training owns live status, join and lobby commands", async () => {
  const snapshot = { phase: "playing", roomId: "room-5x5" };
  const training = {
    durationMs: 60_000,
    grid: [],
    gridId: "grid-2",
    mode: "classic",
    sessionId: "session-2",
  };
  const socket = createSocket({
    "training:standalone:start": { ok: true, training },
    "training:standalone:status": {
      liveStatus: { humanPlayerCount: 3 },
      ok: true,
    },
    "training:standalone:stop": { ok: true, snapshot },
  });
  socket.connected = true;
  const timers = createTimers();
  const joined = [];
  const returned = [];
  const scope = createResourceScope("standalone-training-commands-test");
  const feature = createStandaloneTrainingFeature(
    { scope },
    {
      clearTimeoutFn: timers.clearTimeoutFn,
      now: () => 20_000,
      setTimeoutFn: timers.setTimeoutFn,
    }
  );
  feature.start();
  feature.configure({
    getIdentityPayload: () => ({ nick: "Test", roomId: "room-4x4" }),
    onJoinLive: (value) => joined.push(value),
    onReturnLobby: () => returned.push(true),
    phase: "lobby",
    socket,
  });

  await feature.startTraining("classic", "Classique", 60_000);
  await feature.requestJoinLive();
  assert.deepEqual(feature.store.getState().joinDialog, { humanPlayerCount: 3 });
  assert.equal(socket.emitted.at(-1).eventName, "training:standalone:status");
  assert.equal(socket.emitted.at(-1).payload.sessionId, "session-2");

  await feature.confirmJoinLive();
  assert.deepEqual(joined, [snapshot]);
  assert.equal(feature.refs.session.current, null);
  assert.equal(feature.store.getState().joinDialog, null);
  assert.equal(socket.listenerCount("connect"), 0);

  await feature.startTraining("classic", "Classique", 60_000);
  assert.equal(socket.listenerCount("connect"), 1);
  assert.equal(feature.returnToLobby(), true);
  assert.deepEqual(returned, [true]);
  assert.equal(feature.refs.session.current, null);
  assert.equal(socket.emitted.at(-1).payload.joinLive, false);
  assert.equal(socket.listenerCount("connect"), 0);

  scope.dispose();
});
