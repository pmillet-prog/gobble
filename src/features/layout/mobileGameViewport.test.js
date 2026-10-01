import assert from "node:assert/strict";
import test from "node:test";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createViewportEventHub } from "./createViewportEventHub.js";
import {
  createMobileGameViewportTracker,
  lockMobileGameDocument,
  readMobileGameViewport,
  resolveMobileGameViewportLock,
} from "./mobileGameViewport.js";

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type) {
      for (const listener of [...(listeners.get(type) || [])]) listener();
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
  };
}

function harness(t, { width = 390, height = 844, scrollY = 0 } = {}) {
  const timers = new Map();
  const frames = new Map();
  let now = 0;
  let nextId = 1;
  const windowTarget = Object.assign(eventTarget(), {
    innerWidth: width,
    innerHeight: height,
    scrollY,
    visualViewport: Object.assign(eventTarget(), { width, height, scale: 1 }),
    setTimeout(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    scrollTo(x, y) {
      windowTarget.scrollY = y;
    },
  });
  const bodyStyle = {
    overflow: "auto", overscrollBehavior: "contain", position: "relative",
    width: "95%", left: "2px", right: "3px", touchAction: "pan-y",
    top: "4px", height: "auto", color: "red",
  };
  const rootStyle = {
    overflow: "visible", overscrollBehavior: "auto", position: "static",
    width: "auto", left: "", right: "", height: "100%", color: "blue",
  };
  const documentTarget = Object.assign(eventTarget(), {
    visibilityState: "visible",
    body: { style: bodyStyle },
    documentElement: {
      style: rootStyle,
      clientWidth: width,
      // A pixel document lock feeds its height back through clientHeight.
      get clientHeight() {
        return rootStyle.height.endsWith("px") ? parseFloat(rootStyle.height) : height;
      },
    },
  });
  const scope = createResourceScope("mobile-game-viewport-test");
  const hub = createViewportEventHub({ scope }, {
    windowTarget,
    visualViewportTarget: windowTarget.visualViewport,
    requestFrame(callback) {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame: id => frames.delete(id),
  });
  hub.start();
  const tracker = createMobileGameViewportTracker({
    subscribeViewport: hub.subscribe, windowTarget, documentTarget,
  });
  const cleanups = [];
  t.after(() => {
    for (const cleanup of cleanups.reverse()) cleanup();
    tracker.dispose();
    scope.dispose();
  });
  const flushFrames = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback();
  };
  return {
    tracker, windowTarget, documentTarget, timers, bodyStyle, rootStyle,
    lock() {
      const cleanup = lockMobileGameDocument({ tracker, windowTarget, documentTarget });
      cleanups.push(cleanup);
      return () => {
        const index = cleanups.indexOf(cleanup);
        if (index >= 0) cleanups.splice(index, 1);
        cleanup();
      };
    },
    resize(nextHeight, { visualOnly = false, width: nextWidth = windowTarget.innerWidth } = {}) {
      if (!visualOnly) {
        windowTarget.innerWidth = nextWidth;
        windowTarget.innerHeight = nextHeight;
        windowTarget.dispatch("resize");
      }
      Object.assign(windowTarget.visualViewport, { width: nextWidth, height: nextHeight });
      windowTarget.visualViewport.dispatch("resize");
      flushFrames();
    },
    rotate(nextWidth, nextHeight, { staleVisual = false } = {}) {
      windowTarget.innerWidth = nextWidth;
      windowTarget.innerHeight = nextHeight;
      if (!staleVisual) {
        Object.assign(windowTarget.visualViewport, { width: nextWidth, height: nextHeight });
      }
      windowTarget.dispatch("orientationchange");
      flushFrames();
    },
    advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= end)
          .sort((left, right) => left[1].at - right[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        timers.delete(id);
        now = timer.at;
        timer.callback();
        flushFrames();
      }
      now = end;
    },
  };
}

test("the first round keeps the full lobby height when its chat keyboard is open", t => {
  const h = harness(t);
  h.resize(478);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 390, height: 844 });

  h.lock();
  assert.equal(h.bodyStyle.height, "844px");
  assert.equal(h.rootStyle.height, "844px");
  h.resize(844);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 390, height: 844 });
  assert.equal(h.bodyStyle.height, "844px");
});

test("a first sample taken with the keyboard open repairs the already locked document", t => {
  const h = harness(t, { height: 478 });
  h.lock();
  assert.equal(h.documentTarget.documentElement.clientHeight, 478);
  const snapshots = [];
  h.tracker.subscribe(viewport => snapshots.push(viewport));

  h.resize(844);
  assert.deepEqual(snapshots, [{ width: 390, height: 844 }]);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 390, height: 844 });
  assert.equal(h.bodyStyle.height, "844px");
  assert.equal(h.rootStyle.height, "844px");
  h.resize(478);
  assert.equal(h.bodyStyle.height, "844px");
  assert.equal(snapshots.length, 1);
});

test("visual viewport recovery repairs the round even while innerHeight stays keyboard-sized", t => {
  const h = harness(t, { height: 478 });
  h.lock();
  h.resize(844, { visualOnly: true });

  assert.equal(h.windowTarget.innerHeight, 478);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 390, height: 844 });
  assert.equal(h.bodyStyle.height, "844px");
  assert.equal(h.rootStyle.height, "844px");
});

test("delayed WebKit dimensions after blur are recovered without another resize event", t => {
  const h = harness(t, { height: 478 });
  h.lock();
  h.windowTarget.dispatch("focusout");
  h.advance(100);
  assert.equal(h.bodyStyle.height, "478px");

  h.windowTarget.visualViewport.height = 844;
  h.advance(100);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 390, height: 844 });
  assert.equal(h.bodyStyle.height, "844px");
  assert.equal(h.rootStyle.height, "844px");
  h.advance(1000);
  assert.equal(h.timers.size, 0);
});

test("mounting during keyboard dismissal recovers even when blur happened before subscription", t => {
  const h = harness(t, { height: 478 });
  h.lock();
  h.advance(100);
  h.windowTarget.innerHeight = 844;
  h.windowTarget.visualViewport.height = 844;
  h.advance(300);

  assert.deepEqual(h.tracker.getSnapshot(), { width: 390, height: 844 });
  assert.equal(h.bodyStyle.height, "844px");
  assert.equal(h.rootStyle.height, "844px");
  assert.equal(h.timers.size, 0);
});

test("rotation establishes the new height and subsequent keyboard resizes cannot shrink it", t => {
  const h = harness(t);
  h.lock();
  h.rotate(844, 390);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 844, height: 390 });
  assert.equal(h.bodyStyle.height, "390px");
  h.resize(200);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 844, height: 390 });
  h.rotate(390, 844);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 390, height: 844 });
  assert.equal(h.rootStyle.height, "844px");
});

test("a stale portrait visual viewport cannot inflate the new landscape layout", t => {
  const h = harness(t);
  h.lock();
  h.rotate(844, 390, { staleVisual: true });
  assert.equal(h.windowTarget.visualViewport.width, 390);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 844, height: 390 });
  assert.equal(h.bodyStyle.height, "390px");

  h.resize(390, { visualOnly: true, width: 844 });
  assert.deepEqual(h.tracker.getSnapshot(), { width: 844, height: 390 });
  assert.equal(h.rootStyle.height, "390px");
});

test("unlock restores existing styles and scroll, then disposal releases listeners and pending recovery", t => {
  const h = harness(t, { scrollY: 25 });
  const bodyBefore = { ...h.bodyStyle };
  const rootBefore = { ...h.rootStyle };
  const unlock = h.lock();
  assert.equal(h.windowTarget.scrollY, 0);
  assert.equal(h.bodyStyle.top, "-25px");
  h.windowTarget.dispatch("focusout");
  assert.ok(h.timers.size > 0);

  unlock();
  assert.deepEqual(h.bodyStyle, bodyBefore);
  assert.deepEqual(h.rootStyle, rootBefore);
  assert.equal(h.windowTarget.scrollY, 25);
  h.resize(900);
  assert.equal(h.tracker.getSnapshot().height, 900);
  assert.deepEqual(h.bodyStyle, bodyBefore);
  assert.deepEqual(h.rootStyle, rootBefore);

  const snapshots = [];
  h.tracker.subscribe(viewport => snapshots.push(viewport));
  h.tracker.dispose();
  assert.equal(h.timers.size, 0);
  assert.equal(h.windowTarget.listenerCount("focusout"), 0);
  assert.equal(h.documentTarget.listenerCount("visibilitychange"), 0);
  h.resize(1000);
  h.windowTarget.dispatch("focusout");
  h.documentTarget.dispatch("visibilitychange");
  h.advance(1000);
  assert.equal(h.timers.size, 0);
  assert.equal(h.tracker.getSnapshot().height, 900);
  assert.deepEqual(snapshots, []);
});

test("zoomed visual dimensions and invalid samples cannot corrupt the game reference height", () => {
  const documentTarget = { documentElement: { clientHeight: 478, clientWidth: 390 } };
  assert.deepEqual(readMobileGameViewport({
    innerWidth: 390, innerHeight: 844,
    visualViewport: { height: 1688, scale: 0.5 },
  }, documentTarget), { width: 390, height: 844 });

  const baseline = { width: 390, height: 844 };
  assert.deepEqual(resolveMobileGameViewportLock(baseline, { width: 0, height: NaN }), baseline);
  assert.deepEqual(resolveMobileGameViewportLock(baseline, { width: 390, height: 478 }), baseline);
  assert.deepEqual(resolveMobileGameViewportLock({ width: 390, height: 478 }, baseline), baseline);
});
