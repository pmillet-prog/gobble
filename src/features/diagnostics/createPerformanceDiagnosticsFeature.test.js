import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createPerformanceDiagnosticsFeature } from "./createPerformanceDiagnosticsFeature.js";

function createEventTarget(initial = {}) {
  const listeners = new Map();
  return {
    ...initial,
    addEventListener(eventName, listener) {
      const bucket = listeners.get(eventName) || new Set();
      bucket.add(listener);
      listeners.set(eventName, bucket);
    },
    removeEventListener(eventName, listener) {
      listeners.get(eventName)?.delete(listener);
    },
    listenerCount(eventName) {
      return listeners.get(eventName)?.size || 0;
    },
  };
}

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("diagnostic monitoring stays idle without explicit URL opt-in", async (t) => {
  const cases = [
    { name: "development", devMode: true },
    { name: "localhost", hostname: "localhost" },
    { name: "local IP", hostname: "127.0.0.1" },
    { name: "Samsung Internet", samsung: true },
    { name: "saved opt-in", saved: "1" },
    { name: "Samsung with saved opt-in", samsung: true, saved: "true" },
    { name: "explicit off in development", devMode: true, search: "?samsungDiag=0" },
    { name: "explicit off on Samsung", samsung: true, search: "?samsungDiag=off" },
    { name: "invalid opt-in", devMode: true, search: "?samsungDiag=invalid" },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, (t) => {
      const scope = createResourceScope("idle-performance-diagnostics");
      t.after(() => scope.dispose());
      const scheduled = { observers: 0, intervals: 0, frames: 0 };
      const localStorageTarget = createStorage();
      const sessionStorageTarget = createStorage();
      sessionStorageTarget.setItem("gobbleSamsungBrowserWarningShown", "1");
      if (scenario.saved) {
        localStorageTarget.setItem("gobbleSamsungDiagEnabled", scenario.saved);
      }
      const documentTarget = createEventTarget({ visibilityState: "visible" });
      const windowTarget = createEventTarget({
        location: {
          hostname: scenario.hostname || "gobble.test",
          search: scenario.search || "",
        },
      });
      const warn = t.mock.method(console, "warn", () => {});
      const feature = createPerformanceDiagnosticsFeature({ scope }, {
        devMode: scenario.devMode || false,
        documentTarget,
        localStorageTarget,
        navigatorTarget: {
          userAgent: scenario.samsung ? "Mozilla/5.0 SamsungBrowser/28.0" : "Mozilla/5.0 Chrome/140.0",
        },
        performanceObserverCtor: class {
          constructor() { scheduled.observers += 1; }
          observe() {}
          disconnect() {}
        },
        performanceTarget: { now: () => 0 },
        requestAnimationFrameFn: () => { scheduled.frames += 1; return scheduled.frames; },
        cancelAnimationFrameFn() {},
        setIntervalFn: () => { scheduled.intervals += 1; return scheduled.intervals; },
        clearIntervalFn() {},
        sessionStorageTarget,
        windowTarget,
      });

      feature.start();
      feature.configure({ phaseRef: { current: "lobby" }, tickRef: { current: 0 } });
      feature.configure({ phaseRef: { current: "playing" }, tickRef: { current: 8 } });
      feature.bumpCounter("longTask");
      feature.pushEvent("perf-longtask", { maxMs: 118 }, { consoleLevel: "warn", flush: true });

      assert.equal(feature.isActive(), false);
      assert.deepEqual(scheduled, { observers: 0, intervals: 0, frames: 0 });
      assert.equal(documentTarget.listenerCount("visibilitychange"), 0);
      for (const eventName of ["error", "unhandledrejection", "pagehide", "beforeunload"]) {
        assert.equal(windowTarget.listenerCount(eventName), 0);
      }
      assert.equal(windowTarget.__gobbleSamsungDiagDump, undefined);
      assert.equal(windowTarget.__gobbleSamsungDiagRead, undefined);
      assert.equal(feature.flushSnapshot(), null);
      assert.equal(feature.refs.state.current.counters.longTask, 0);
      assert.equal(feature.refs.state.current.events.length, 0);
      assert.equal(warn.mock.callCount(), 0);
      assert.equal(localStorageTarget.getItem("gobbleSamsungDiagEnabled"), null);
    });
  }
});

test("performance diagnostics owns Samsung observers, loops, listeners and cleanup", (t) => {
  const previousWarn = console.warn;
  console.warn = () => {};
  t.after(() => {
    console.warn = previousWarn;
  });
  const intervals = new Map();
  const timeouts = new Map();
  const animationFrames = new Map();
  const observers = [];
  const scope = createResourceScope("performance-diagnostics-test");
  const localStorageTarget = createStorage();
  const documentTarget = createEventTarget({ visibilityState: "visible" });
  const windowTarget = createEventTarget({
    alert() {},
    location: { hostname: "gobble.test", search: "?samsungDiag=1" },
  });
  let nextId = 1;
  let performanceNow = 0;

  class FakePerformanceObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observers.push(this);
    }

    disconnect() {
      this.disconnected = true;
    }

    observe(options) {
      this.options = options;
    }
  }

  const feature = createPerformanceDiagnosticsFeature(
    { scope },
    {
      assetManager: {
        compactAudioState() {},
        getAudioDebugStats: () => null,
      },
      cancelAnimationFrameFn: (id) => animationFrames.delete(id),
      clearIntervalFn: (id) => intervals.delete(id),
      clearTimeoutFn: (id) => timeouts.delete(id),
      dateNow: () => 2000,
      devMode: false,
      documentTarget,
      localStorageTarget,
      navigatorTarget: { userAgent: "Mozilla/5.0 SamsungBrowser/28.0" },
      performanceObserverCtor: FakePerformanceObserver,
      performanceTarget: { now: () => performanceNow },
      requestAnimationFrameFn: (callback) => {
        const id = nextId++;
        animationFrames.set(id, callback);
        return id;
      },
      sessionStorageTarget: createStorage(),
      setIntervalFn: (callback, delayMs) => {
        const id = nextId++;
        intervals.set(id, { callback, delayMs });
        return id;
      },
      setTimeoutFn: (callback, delayMs) => {
        const id = nextId++;
        timeouts.set(id, { callback, delayMs });
        return id;
      },
      windowTarget,
    }
  );
  feature.start();
  assert.equal(intervals.size, 0);

  feature.configure({
    audioVoiceRef: { current: { lastPlayed: new Map() } },
    currentTilesRef: { current: [] },
    dragGridMetricsRef: { current: null },
    draggingRef: { current: false },
    dragMoveRafRef: { current: null },
    dragPendingPointRef: { current: null },
    gridHitboxRef: { current: null },
    phaseRef: { current: "playing" },
    tickRef: { current: 8 },
  });

  assert.equal(feature.refs.isSamsungBrowser.current, true);
  assert.equal(feature.isActive(), true);
  assert.equal(feature.refs.source.current, "query");
  assert.equal(localStorageTarget.getItem("gobbleSamsungDiagEnabled"), null);
  assert.deepEqual(
    [...intervals.values()].map((timer) => timer.delayMs).sort((a, b) => a - b),
    [1000, 4000, 5000]
  );
  assert.equal(timeouts.size, 1);
  assert.equal(animationFrames.size, 1);
  assert.equal(observers.length, 1);
  assert.deepEqual(observers[0].options, { entryTypes: ["longtask"] });
  assert.equal(documentTarget.listenerCount("visibilitychange"), 1);
  assert.equal(windowTarget.listenerCount("error"), 1);
  assert.equal(typeof windowTarget.__gobbleSamsungDiagDump, "function");

  const [rafId, rafCallback] = [...animationFrames.entries()][0];
  animationFrames.delete(rafId);
  performanceNow = 800;
  rafCallback(performanceNow);
  assert.equal(feature.refs.state.current.counters.rafGlobalJank, 1);
  assert.equal(feature.refs.state.current.counters.rafGlobalStall, 1);
  assert.equal(animationFrames.size, 1);

  scope.dispose();
  assert.equal(intervals.size, 0);
  assert.equal(timeouts.size, 0);
  assert.equal(animationFrames.size, 0);
  assert.equal(observers[0].disconnected, true);
  assert.equal(documentTarget.listenerCount("visibilitychange"), 0);
  assert.equal(windowTarget.listenerCount("error"), 0);
  assert.equal(windowTarget.__gobbleSamsungDiagDump, undefined);
  assert.equal(feature.refs.isSamsungBrowser.current, false);
  assert.equal(feature.isActive(), false);
});
