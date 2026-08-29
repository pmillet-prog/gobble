import test from "node:test";
import assert from "node:assert/strict";

import { createApplicationKernel } from "../../app/core/createApplicationKernel.js";
import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createLiveEntryFeature } from "./createLiveEntryFeature.js";

function createSocket({ connected = true } = {}) {
  const listeners = new Map();
  const emitted = [];
  return {
    connected,
    disconnect() {
      this.connected = false;
    },
    emit(eventName, payload, acknowledge) {
      emitted.push({ acknowledge, eventName, payload });
    },
    emitted,
    listenerCount(eventName) {
      return listeners.get(eventName)?.size || 0;
    },
    off(eventName, listener) {
      listeners.get(eventName)?.delete(listener);
    },
    once(eventName, listener) {
      const bucket = listeners.get(eventName) || new Set();
      bucket.add(listener);
      listeners.set(eventName, bucket);
    },
  };
}

function createFeatureHarness({ connected = true } = {}) {
  const kernel = createApplicationKernel({
    session: { nickname: "Tigre" },
  });
  const scope = createResourceScope("live-entry-test");
  const socket = createSocket({ connected });
  const timers = new Map();
  const storageWrites = [];
  let nextTimerId = 1;
  const feature = createLiveEntryFeature(
    { getKernel: () => kernel, scope },
    {
      clearTimeoutFn: (id) => timers.delete(id),
      setTimeoutFn: (callback, delayMs) => {
        const id = nextTimerId++;
        timers.set(id, { callback, delayMs });
        return id;
      },
      storage: {
        setItem: (...args) => storageWrites.push(args),
      },
    }
  );
  const appViewRef = { current: "home" };
  const isLoggedInRef = { current: false };
  const lastLoginPayloadRef = { current: null };
  const liveSessionReadyRef = { current: false };
  const reconnectAttemptRef = { current: true };
  const calls = {
    persisted: [],
    reconnect: [],
    scores: [],
  };
  feature.configure({
    appViewRef,
    cancelDisconnectGrace() {},
    clearMobileChatReactionToasts() {},
    connectSocketWithAuth: () => Promise.resolve(true),
    ensureAuthenticated: () => true,
    getGridSizeForRoom: () => 5,
    getInstallId: () => "install-1",
    hydrateLiveSnapshot: (snapshot) => snapshot?.valid === true,
    isLoggedInRef,
    lastLoginPayloadRef,
    liveSessionReadyRef,
    onSnapshotMissing: (reason) => calls.reconnect.push(reason),
    persistSession: (session) => calls.persisted.push(session),
    phaseLoopTestEnabledRef: { current: false },
    reconnectAttemptRef,
    requestTrophyStatus() {},
    setAutoResumeEnabled() {},
    setScore: (score) => calls.scores.push(score),
    socket,
    syncServerTime: (next) => next(),
  });
  feature.start();
  return {
    appViewRef,
    calls,
    feature,
    isLoggedInRef,
    kernel,
    lastLoginPayloadRef,
    liveSessionReadyRef,
    reconnectAttemptRef,
    scope,
    socket,
    storageWrites,
    timers,
  };
}

test("live entry owns the login timeout and ignores a late acknowledgement", () => {
  const harness = createFeatureHarness();

  assert.equal(harness.feature.login(), true);
  assert.equal(harness.feature.refs.loginInFlight.current, true);
  assert.equal(harness.socket.listenerCount("connect_error"), 1);
  assert.equal(harness.socket.emitted.length, 1);
  const timeout = [...harness.timers.values()][0];
  assert.equal(timeout.delayMs, 6000);

  timeout.callback();
  assert.equal(harness.feature.refs.loginInFlight.current, false);
  assert.equal(harness.kernel.getState().session.loginError, "Connexion timeout");
  assert.equal(harness.socket.listenerCount("connect_error"), 0);

  harness.socket.emitted[0].acknowledge({
    ok: true,
    roomId: "room-5x5",
    snapshot: { valid: true },
  });
  assert.equal(harness.kernel.getState().navigation.view, "home");
  assert.equal(harness.calls.persisted.length, 0);
  harness.scope.dispose();
});

test("live entry commits an acknowledged login as one application transition", () => {
  const harness = createFeatureHarness();

  harness.feature.login();
  harness.socket.emitted[0].acknowledge({
    entryKind: "join",
    ok: true,
    roomId: "room-5x5",
    snapshot: { valid: true },
  });

  const state = harness.kernel.getState();
  assert.equal(state.navigation.view, "live");
  assert.equal(state.session.isConnecting, false);
  assert.equal(state.session.isLoggedIn, true);
  assert.equal(state.game.currentRoomId, "room-5x5");
  assert.equal(state.game.gridSize, 5);
  assert.equal(state.game.board.length, 25);
  assert.equal(harness.appViewRef.current, "live");
  assert.equal(harness.isLoggedInRef.current, true);
  assert.equal(harness.liveSessionReadyRef.current, true);
  assert.equal(harness.reconnectAttemptRef.current, false);
  assert.deepEqual(harness.calls.persisted, [
    { installId: "install-1", nick: "Tigre", roomId: "room-5x5" },
  ]);
  assert.deepEqual(harness.calls.scores, [0]);
  assert.deepEqual(harness.storageWrites, [["boggle_nick", "Tigre"]]);
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.socket.listenerCount("connect_error"), 0);
  harness.scope.dispose();
});

test("live entry waits for the authenticated connection before emitting login", async () => {
  const harness = createFeatureHarness({ connected: false });

  assert.equal(harness.feature.login(), true);
  assert.equal(harness.socket.emitted.length, 0);
  assert.equal(harness.socket.listenerCount("connect_error"), 1);

  await Promise.resolve();
  await Promise.resolve();
  assert.equal(harness.socket.listenerCount("connect_error"), 0);
  assert.equal(harness.socket.emitted.length, 1);
  assert.deepEqual(harness.socket.emitted[0].payload, {
    installId: "install-1",
    nick: "Tigre",
    roomId: "room-4x4",
  });
  harness.scope.dispose();
});

test("live entry cleanup cancels the in-flight timer and listener", () => {
  const harness = createFeatureHarness();

  harness.feature.login();
  harness.scope.dispose();

  assert.equal(harness.feature.refs.loginInFlight.current, false);
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.socket.listenerCount("connect_error"), 0);
  harness.socket.emitted[0].acknowledge({
    ok: true,
    roomId: "room-5x5",
    snapshot: { valid: true },
  });
  assert.equal(harness.kernel.getState().navigation.view, "home");
});
