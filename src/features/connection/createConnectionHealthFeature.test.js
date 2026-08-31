import test from "node:test";
import assert from "node:assert/strict";

import { createApplicationKernel } from "../../app/core/createApplicationKernel.js";
import { createResourceScope } from "../../app/core/createResourceScope.js";
import { LIVE_CONNECTION_INTERRUPTED_MESSAGE } from "../../network/liveSubmissionRecovery.js";
import { createConnectionHealthFeature } from "./createConnectionHealthFeature.js";

function createEventTarget() {
  const listeners = new Map();
  return {
    visibilityState: "visible",
    addEventListener(event, listener) {
      const bucket = listeners.get(event) || new Set();
      bucket.add(listener);
      listeners.set(event, bucket);
    },
    removeEventListener(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    emit(event) {
      for (const listener of listeners.get(event) || []) listener();
    },
    listenerCount(event) {
      return listeners.get(event)?.size || 0;
    },
  };
}

test("connection health owns foreground listeners, retry and watchdog timers", () => {
  const documentTarget = createEventTarget();
  const windowTarget = createEventTarget();
  const intervals = new Map();
  const timeouts = new Map();
  const foregroundReasons = [];
  const healthReasons = [];
  const kernel = createApplicationKernel();
  const scope = createResourceScope("connection-health-test");
  let connected = false;
  let nextTimerId = 1;
  let pageShow = null;
  const feature = createConnectionHealthFeature(
    { getKernel: () => kernel, scope },
    {
      clearIntervalFn: (id) => intervals.delete(id),
      clearTimeoutFn: (id) => timeouts.delete(id),
      documentTarget,
      now: () => 1234,
      setIntervalFn: (callback, delayMs) => {
        const id = nextTimerId++;
        intervals.set(id, { callback, delayMs });
        return id;
      },
      setTimeoutFn: (callback, delayMs) => {
        const id = nextTimerId++;
        timeouts.set(id, { callback, delayMs });
        return id;
      },
      windowTarget,
    }
  );
  feature.configure({
    isConnected: () => connected,
    onForeground: (reason) => foregroundReasons.push(reason),
    onHealthCheck: (reason) => healthReasons.push(reason),
    subscribePageShow: (listener) => {
      pageShow = listener;
      return () => {
        pageShow = null;
      };
    },
  });
  feature.start();

  assert.equal(intervals.size, 0);
  kernel.commands.session.setIsLoggedIn(true);
  assert.deepEqual([...intervals.values()].map((timer) => timer.delayMs), [5500]);
  kernel.commands.game.setPhase("playing");
  assert.deepEqual(
    [...intervals.values()].map((timer) => timer.delayMs).sort((a, b) => a - b),
    [5500, 15000]
  );

  documentTarget.visibilityState = "hidden";
  documentTarget.emit("visibilitychange");
  assert.equal(feature.refs.backgrounded.current, true);
  assert.equal(feature.refs.lastBackgroundAt.current, 1234);
  documentTarget.visibilityState = "visible";
  documentTarget.emit("visibilitychange");
  assert.equal(feature.refs.backgrounded.current, false);
  assert.equal(foregroundReasons.at(-1), "visibility");
  assert.equal([...timeouts.values()][0].delayMs, 1400);

  pageShow();
  assert.equal(foregroundReasons.at(-1), "pageshow");
  assert.equal([...timeouts.values()][0].delayMs, 1200);
  windowTarget.emit("pointerdown");
  assert.equal(foregroundReasons.at(-1), "interaction");

  const watchdog = [...intervals.values()].find((timer) => timer.delayMs === 15000);
  watchdog.callback();
  assert.deepEqual(healthReasons, ["watchdog_playing"]);
  feature.configure({ standaloneTrainingActive: true });
  assert.equal(
    [...intervals.values()].some((timer) => timer.delayMs === 15000),
    false
  );

  connected = true;
  const retry = [...intervals.values()].find((timer) => timer.delayMs === 5500);
  retry.callback();
  assert.notEqual(foregroundReasons.at(-1), "retry_timer");
  scope.dispose();
  assert.equal(intervals.size, 0);
  assert.equal(timeouts.size, 0);
  assert.equal(windowTarget.listenerCount("focus"), 0);
  assert.equal(documentTarget.listenerCount("visibilitychange"), 0);
  assert.equal(pageShow, null);
});

test("connection health owns foreground live synchronization and stale-response cleanup", async () => {
  const documentTarget = createEventTarget();
  const windowTarget = createEventTarget();
  const timers = new Map();
  const emitted = [];
  let nextTimerId = 1;
  const socket = {
    connected: true,
    emit(eventName, payload, acknowledge) {
      emitted.push({ acknowledge, eventName, payload });
    },
  };
  const kernel = createApplicationKernel();
  kernel.commands.session.setIsLoggedIn(true);
  const scope = createResourceScope("connection-sync-test");
  const feature = createConnectionHealthFeature(
    { getKernel: () => kernel, scope },
    {
      clearTimeoutFn: (id) => timers.delete(id),
      documentTarget,
      now: () => 10_000,
      setTimeoutFn: (callback, delayMs) => {
        const id = nextTimerId++;
        timers.set(id, { callback, delayMs });
        return id;
      },
      windowTarget,
    }
  );
  const liveSessionReadyRef = { current: false };
  let flushCount = 0;
  feature.configureRealtime({
    appViewRef: { current: "live" },
    hasSavedSession: () => true,
    isLoggedInRef: { current: true },
    liveSessionReadyRef,
    socket,
    standaloneTrainingSessionRef: { current: null },
  });
  feature.configure({
    connection: socket,
    currentRoomIdRef: { current: "room-4x4" },
    hydrateLiveSnapshot: (snapshot) => snapshot?.valid === true,
    installIdRef: { current: "install-1" },
    isAccountAuthenticatedRef: { current: true },
    nicknameRef: { current: "Tigre" },
    scheduleBatchFlush: () => {
      flushCount += 1;
    },
    sessionRef: { current: null },
  });
  feature.start();

  const syncPromise = feature.syncLiveState("focus");
  assert.equal(feature.syncLiveState("focus_duplicate"), syncPromise);
  assert.equal(emitted[0].eventName, "session:resume");
  assert.deepEqual(emitted[0].payload, {
    installId: "install-1",
    nick: "Tigre",
    roomId: "room-4x4",
    takeover: false,
  });
  assert.equal([...timers.values()][0].delayMs, 5000);
  emitted[0].acknowledge({
    available: true,
    ok: true,
    snapshot: { valid: true },
  });
  assert.equal(await syncPromise, true);
  assert.equal(liveSessionReadyRef.current, true);
  assert.equal(flushCount, 1);
  assert.equal(timers.size, 0);

  const stalePromise = feature.syncLiveState("stale");
  const staleAcknowledge = emitted[1].acknowledge;
  scope.dispose();
  await assert.rejects(stalePromise, /cancelled/);
  staleAcknowledge({
    available: true,
    ok: true,
    snapshot: { valid: true },
  });
  assert.equal(flushCount, 1);
});

test("connection health applies the watchdog threshold and foreground reconnect policy", async () => {
  const documentTarget = createEventTarget();
  const windowTarget = createEventTarget();
  const resumed = [];
  const reconnected = [];
  let disconnectCount = 0;
  const socket = {
    connected: true,
    disconnect() {
      disconnectCount += 1;
      this.connected = false;
    },
    emit(eventName, _payload, acknowledge) {
      if (eventName === "timeSync") acknowledge({ ok: false });
    },
  };
  const kernel = createApplicationKernel();
  kernel.commands.session.setIsLoggedIn(true);
  const scope = createResourceScope("connection-watchdog-test");
  const feature = createConnectionHealthFeature(
    { getKernel: () => kernel, scope },
    { documentTarget, now: () => 10_000, windowTarget }
  );
  feature.configureRealtime({
    appViewRef: { current: "live" },
    hasSavedSession: () => true,
    isLoggedInRef: { current: true },
    socket,
    standaloneTrainingSessionRef: { current: null },
  });
  feature.configure({
    connection: socket,
    isAccountAuthenticatedRef: { current: true },
    reconnectSession: (reason) => reconnected.push(reason),
    resumeSession: (reason) => resumed.push(reason),
  });
  feature.start();

  await feature.runHealthCheck("watchdog_playing");
  await feature.runHealthCheck("watchdog_playing");
  assert.equal(feature.refs.watchdogFailures.current, 2);
  assert.equal(disconnectCount, 0);
  await feature.runHealthCheck("watchdog_playing");
  assert.equal(feature.refs.watchdogFailures.current, 0);
  assert.equal(disconnectCount, 1);
  assert.deepEqual(resumed, ["watchdog"]);

  socket.connected = false;
  feature.refs.lastBackgroundAt.current = 1000;
  feature.refs.foregroundAttemptAt.current = 0;
  feature.handleForeground("visibility");
  assert.deepEqual(reconnected, ["visibility_post_bg"]);
  scope.dispose();
});

test("connection health owns socket lifecycle, disconnect grace and cleanup", () => {
  const documentTarget = createEventTarget();
  const windowTarget = createEventTarget();
  const handlers = new Map();
  const socket = {
    connected: true,
    bind(nextHandlers) {
      for (const [eventName, handler] of Object.entries(nextHandlers)) {
        handlers.set(eventName, handler);
      }
      return () => {
        for (const [eventName, handler] of Object.entries(nextHandlers)) {
          if (handlers.get(eventName) === handler) handlers.delete(eventName);
        }
      };
    },
    fire(eventName) {
      handlers.get(eventName)?.();
    },
  };
  const timers = new Map();
  let nextTimerId = 1;
  const scope = createResourceScope("connection-realtime-test");
  const kernel = createApplicationKernel();
  kernel.commands.session.patch({
    isConnecting: true,
    isLoggedIn: true,
    loginError: "Connexion au serveur impossible",
  });
  const feature = createConnectionHealthFeature(
    { getKernel: () => kernel, scope },
    {
      clearTimeoutFn: (id) => timers.delete(id),
      documentTarget,
      setTimeoutFn: (callback, delayMs) => {
        const id = nextTimerId++;
        timers.set(id, {
          callback: () => {
            timers.delete(id);
            callback();
          },
          delayMs,
        });
        return id;
      },
      windowTarget,
    }
  );
  const autoResumeEnabledRef = { current: true };
  const batchUnsupportedRef = { current: true };
  const isLoggedInRef = { current: true };
  const liveSessionReadyRef = { current: true };
  const lobbyChatSubscriptionRef = {
    current: { connectPending: true, inFlight: true, subscribed: true },
  };
  const manualDisconnectRef = { current: false };
  const resumeLockAtRef = { current: 123 };
  const resumeLockRef = { current: false };
  const resumeReasons = [];
  const resumeLoginFromSessionRef = {
    current: (reason) => resumeReasons.push(reason),
  };
  const reconnectReasons = [];
  const attemptSilentReconnectRef = {
    current: (reason) => reconnectReasons.push(reason),
  };
  const toasts = [];
  let requeued = 0;
  const configure = (overrides = {}) =>
    feature.configureRealtime({
      appViewRef: { current: "live" },
      attemptSilentReconnectRef,
      autoResumeEnabledRef,
      batchUnsupportedRef,
      clearQueuedRankingUpdate: () => {},
      disconnectGraceMs: 30_000,
      hasSavedSession: () => true,
      isChatOpenMobileRef: { current: false },
      isHomeChatOpenRef: { current: false },
      isLoggedInRef,
      liveSessionReadyRef,
      lobbyChatSubscriptionRef,
      manualDisconnectRef,
      requeueInFlightSubmissions: () => {
        requeued += 1;
      },
      resumeLockAtRef,
      resumeLockRef,
      resumeLoginFromSessionRef,
      setPlayers: () => {},
      setProvisionalRanking: () => {},
      showToast: (...args) => toasts.push(args),
      socket,
      standaloneTrainingSessionRef: { current: null },
      subscribeLobbyChat: () => {},
      transientHomeConnectionErrors: new Set([
        "Connexion au serveur impossible",
      ]),
      ...overrides,
    });

  configure();
  feature.start();
  assert.deepEqual([...handlers.keys()].sort(), [
    "connect",
    "connect_error",
    "disconnect",
  ]);

  socket.fire("connect");
  assert.equal(liveSessionReadyRef.current, false);
  assert.equal(batchUnsupportedRef.current, false);
  assert.equal(kernel.getState().session.loginError, "");
  assert.equal([...timers.values()][0].delayMs, 0);
  [...timers.values()][0].callback();
  assert.deepEqual(resumeReasons, ["socket_connect"]);

  socket.connected = false;
  socket.fire("disconnect");
  assert.equal(requeued, 1);
  assert.deepEqual(reconnectReasons, ["disconnect"]);
  assert.equal(
    kernel.getState().session.connectionError,
    LIVE_CONNECTION_INTERRUPTED_MESSAGE
  );
  assert.deepEqual(toasts.at(-1), [
    "Connexion interrompue, jeu local actif",
    3600,
  ]);
  const graceTimer = [...timers.values()].find(
    (timer) => timer.delayMs === 30_000
  );
  assert.ok(graceTimer);
  graceTimer.callback();
  assert.deepEqual(reconnectReasons, ["disconnect", "disconnect_grace"]);

  socket.connected = true;
  socket.fire("connect");
  assert.deepEqual(toasts.at(-1), ["Connexion rétablie", 2200]);

  feature.refs.intentionalDisconnect.current = true;
  socket.connected = false;
  socket.fire("disconnect");
  assert.equal(feature.refs.intentionalDisconnect.current, false);
  assert.equal(
    [...timers.values()].some((timer) => timer.delayMs === 30_000),
    false
  );

  configure({
    autoResumeEnabledRef: { current: false },
    hasSavedSession: () => false,
    isLoggedInRef: { current: false },
  });
  kernel.commands.realtime.patch({
    finalResults: [{ nick: "Tigre" }],
    roundId: "round-1",
    tournament: { id: "tournament-1" },
  });
  socket.fire("disconnect");
  assert.equal(kernel.getState().realtime.roundId, null);
  assert.deepEqual(kernel.getState().realtime.finalResults, []);
  assert.equal(kernel.getState().realtime.tournament, null);
  feature.cancelDisconnectGrace();

  kernel.commands.session.patch({
    connectionError: "",
    isConnecting: true,
    isLoggedIn: false,
  });
  socket.fire("connect_error");
  assert.equal(kernel.getState().session.isConnecting, false);
  assert.equal(
    kernel.getState().session.connectionError,
    "Connexion au serveur impossible"
  );

  scope.dispose();
  assert.equal(handlers.size, 0);
  assert.equal(timers.size, 0);
});
