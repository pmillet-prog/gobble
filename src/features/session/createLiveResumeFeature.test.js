import test from "node:test";
import assert from "node:assert/strict";

import { createApplicationKernel } from "../../app/core/createApplicationKernel.js";
import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createLiveResumeFeature } from "./createLiveResumeFeature.js";

function createSocket({ connected = true } = {}) {
  const emitted = [];
  const listeners = new Map();
  return {
    connected,
    emit(eventName, payload, acknowledge) {
      emitted.push({ acknowledge, eventName, payload });
    },
    emitted,
    fire(eventName) {
      const bucket = [...(listeners.get(eventName) || [])];
      listeners.delete(eventName);
      for (const listener of bucket) listener();
    },
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

function createHarness({ connected = true } = {}) {
  const kernel = createApplicationKernel();
  const scope = createResourceScope("live-resume-test");
  const socket = createSocket({ connected });
  const timers = new Map();
  let nextTimerId = 1;
  let nowMs = 10_000;
  const feature = createLiveResumeFeature(
    { getKernel: () => kernel, scope },
    {
      clearTimeoutFn: (id) => timers.delete(id),
      now: () => nowMs,
      setTimeoutFn: (callback, delayMs) => {
        const id = nextTimerId++;
        timers.set(id, { callback, delayMs });
        return id;
      },
    }
  );
  const sessionRef = {
    current: {
      installId: "install-1",
      nick: "Tigre",
      roomId: "room-4x4",
    },
  };
  const appViewRef = { current: "home" };
  const isLoggedInRef = { current: false };
  const liveSessionReadyRef = { current: false };
  const reconnectAttemptRef = { current: false };
  const calls = {
    cleared: 0,
    flushed: 0,
    persisted: [],
    trophies: 0,
  };
  feature.configure({
    appViewRef,
    applyPlaytimeLimitStatus() {},
    autoResumeEnabledRef: { current: true },
    clearMobileChatReactionToasts() {},
    clearSavedSession() {
      calls.cleared += 1;
      sessionRef.current = null;
    },
    connectSocketWithAuth: () => Promise.resolve(true),
    getInstallId: () => "install-1",
    hasSavedSession: () => !!sessionRef.current,
    hydrateLiveSnapshot: (snapshot) => snapshot?.valid === true,
    isAccountAuthenticated: () => true,
    isLoggedInRef,
    lastLoginPayloadRef: { current: null },
    liveSessionReadyRef,
    persistSession: (session) => calls.persisted.push(session),
    reconnectAttemptRef,
    requestTrophyStatus: () => {
      calls.trophies += 1;
    },
    scheduleBatchFlush: () => {
      calls.flushed += 1;
    },
    sessionRef,
    showGlobalRedAnnouncement() {},
    socket,
  });
  feature.start();
  return {
    advance(ms) {
      nowMs += ms;
    },
    appViewRef,
    calls,
    feature,
    isLoggedInRef,
    kernel,
    liveSessionReadyRef,
    reconnectAttemptRef,
    scope,
    sessionRef,
    socket,
    timers,
  };
}

test("live resume probe owns its pending state and publishes an available snapshot", () => {
  const harness = createHarness();

  assert.equal(harness.feature.probeResume("home"), true);
  assert.equal(harness.kernel.getState().session.resumePending, true);
  assert.deepEqual(harness.socket.emitted[0].payload, {
    installId: "install-1",
    nick: "Tigre",
    roomId: "room-4x4",
    takeover: false,
  });

  const snapshot = { roundId: "round-1" };
  harness.socket.emitted[0].acknowledge({
    available: true,
    ok: true,
    snapshot,
  });
  assert.equal(harness.kernel.getState().session.resumePending, false);
  assert.equal(harness.kernel.getState().session.canResumeSession, true);
  assert.equal(harness.kernel.getState().session.resumeSnapshot, snapshot);
  assert.equal(harness.feature.refs.resumeProbe.current.inFlight, false);
  harness.scope.dispose();
});

test("live resume ignores an acknowledgement received after its timeout", () => {
  const harness = createHarness();

  assert.equal(harness.feature.resume("boot"), true);
  const timeout = [...harness.timers.values()][0];
  assert.equal(timeout.delayMs, 8000);
  timeout.callback();
  assert.equal(harness.kernel.getState().session.isConnecting, false);
  assert.equal(harness.feature.refs.resumeLock.current, false);

  harness.socket.emitted[0].acknowledge({
    available: true,
    ok: true,
    snapshot: { valid: true },
  });
  assert.equal(harness.kernel.getState().navigation.view, "home");
  assert.equal(harness.calls.persisted.length, 0);
  harness.scope.dispose();
});

test("live resume restores a saved session and releases all transport resources", () => {
  const harness = createHarness();

  harness.feature.resume("resume_button");
  harness.socket.emitted[0].acknowledge({
    available: true,
    entryKind: "resume",
    ok: true,
    roomId: "room-5x5",
    snapshot: { valid: true },
  });

  const state = harness.kernel.getState();
  assert.equal(state.navigation.view, "live");
  assert.equal(state.session.isLoggedIn, true);
  assert.equal(state.session.isConnecting, false);
  assert.equal(harness.isLoggedInRef.current, true);
  assert.equal(harness.liveSessionReadyRef.current, true);
  assert.deepEqual(harness.calls.persisted, [
    { installId: "install-1", nick: "Tigre", roomId: "room-4x4" },
  ]);
  assert.equal(harness.calls.flushed, 1);
  assert.equal(harness.calls.trophies, 1);
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.socket.listenerCount("connect_error"), 0);
  harness.scope.dispose();
});

test("live resume falls back to a room login when no resumable session is attached", () => {
  const harness = createHarness();

  harness.feature.resume("socket_connect");
  harness.socket.emitted[0].acknowledge({
    available: false,
    ok: true,
  });
  assert.equal(harness.socket.emitted.length, 2);
  assert.equal(harness.socket.emitted[1].eventName, "login");
  harness.socket.emitted[1].acknowledge({
    ok: true,
    roomId: "room-5x5",
    snapshot: { valid: true },
  });

  assert.equal(harness.kernel.getState().game.currentRoomId, "room-5x5");
  assert.equal(harness.kernel.getState().navigation.view, "live");
  assert.equal(harness.liveSessionReadyRef.current, true);
  harness.scope.dispose();
});

test("live resume cleanup cancels probe listeners, resume timeout and reconnect reset", () => {
  const harness = createHarness({ connected: false });

  harness.feature.probeResume("probe");
  assert.equal(harness.socket.listenerCount("connect"), 1);
  harness.feature.cancelResumeProbe();
  harness.socket.connected = true;
  harness.feature.resume("boot");
  harness.feature.cancelResumeAttempt();
  harness.appViewRef.current = "live";
  harness.feature.reconnect("online");
  assert.equal(harness.reconnectAttemptRef.current, true);

  harness.scope.dispose();
  assert.equal(harness.socket.listenerCount("connect"), 0);
  assert.equal(harness.socket.listenerCount("connect_error"), 0);
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.reconnectAttemptRef.current, false);
});
