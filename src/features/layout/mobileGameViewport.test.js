import assert from "node:assert/strict";
import test from "node:test";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createViewportEventHub } from "./createViewportEventHub.js";
import {
  acquireMobileGameViewportTracker,
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

function harness(t, { width = 390, height = 844, scrollY = 0, keyboardFocused = false } = {}) {
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
  const css = new Map();
  rootStyle.setProperty = (name, value) => css.set(name, value);
  rootStyle.getPropertyValue = name => css.get(name) || "";
  rootStyle.removeProperty = name => css.delete(name);
  const documentTarget = Object.assign(eventTarget(), {
    visibilityState: "visible",
    activeElement: keyboardFocused ? { tagName: "TEXTAREA" } : null,
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
    tracker, windowTarget, documentTarget, timers, bodyStyle, rootStyle, css,
    focus() {
      documentTarget.activeElement = { tagName: "TEXTAREA" };
      windowTarget.dispatch("focusin");
    },
    blur() {
      documentTarget.activeElement = null;
      windowTarget.dispatch("focusout");
    },
    pan(top) {
      windowTarget.visualViewport.offsetTop = top;
      windowTarget.visualViewport.dispatch("scroll");
      flushFrames();
    },
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
  h.focus();
  h.resize(478);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 390, height: 844 });

  h.lock();
  assert.equal(h.bodyStyle.height, "844px");
  assert.equal(h.rootStyle.height, "100%");
  assert.equal(h.rootStyle.position, "static");
  h.resize(844);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 390, height: 844 });
  assert.equal(h.bodyStyle.height, "844px");
});

test("a first sample taken with the keyboard open repairs the already locked document", t => {
  const h = harness(t, { height: 478, keyboardFocused: true });
  h.focus();
  h.lock();
  assert.equal(h.documentTarget.documentElement.clientHeight, 478);
  const snapshots = [];
  h.tracker.subscribe(viewport => snapshots.push(viewport));

  h.resize(844);
  assert.deepEqual(snapshots, [{ width: 390, height: 844 }]);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 390, height: 844 });
  assert.equal(h.bodyStyle.height, "844px");
  assert.equal(h.rootStyle.height, "100%");
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
  assert.equal(h.rootStyle.height, "100%");
});

test("delayed WebKit dimensions after blur are recovered without another resize event", t => {
  const h = harness(t, { height: 478 });
  h.lock();
  h.windowTarget.dispatch("focusout");
  h.advance(100);
  assert.equal(h.bodyStyle.height, "478px");

  h.windowTarget.visualViewport.height = 844;
  h.advance(100);
  assert.equal(h.bodyStyle.height, "478px");
  h.advance(520);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 390, height: 844 });
  assert.equal(h.bodyStyle.height, "844px");
  assert.equal(h.rootStyle.height, "100%");
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
  assert.equal(h.rootStyle.height, "100%");
  h.advance(400);
  assert.equal(h.timers.size, 0);
});

test("rotation establishes the new height and subsequent keyboard resizes cannot shrink it", t => {
  const h = harness(t);
  h.lock();
  h.rotate(844, 390);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 844, height: 390 });
  assert.equal(h.bodyStyle.height, "390px");
  h.focus();
  h.resize(200);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 844, height: 390 });
  h.rotate(390, 844);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 390, height: 844 });
  assert.equal(h.rootStyle.height, "100%");
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
  assert.equal(h.rootStyle.height, "100%");
});

test("unlock restores existing styles and scroll, then disposal releases listeners and pending recovery", t => {
  const h = harness(t, { scrollY: 25 });
  const bodyBefore = { ...h.bodyStyle };
  const rootBefore = { ...h.rootStyle };
  const unlock = h.lock();
  assert.equal(h.windowTarget.scrollY, 0);
  assert.equal(h.bodyStyle.top, "0");
  h.windowTarget.dispatch("focusout");
  assert.ok(h.timers.size > 0);

  unlock();
  assert.deepEqual(h.bodyStyle, bodyBefore);
  assert.deepEqual(h.rootStyle, rootBefore);
  assert.equal(h.windowTarget.scrollY, 25);
  h.resize(900);
  h.advance(720);
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
  assert.deepEqual(resolveMobileGameViewportLock(baseline, { width: 390, height: 478 }, { keyboardActive: true }), baseline);
  assert.deepEqual(resolveMobileGameViewportLock({ width: 390, height: 478 }, baseline), baseline);
});

test("browser and Android system bars can shrink an unfocused surface after startup", t => {
  const h = harness(t);
  h.lock();
  h.resize(810, { visualOnly: true });
  assert.equal(h.windowTarget.innerHeight, 844);
  assert.deepEqual(h.tracker.getSnapshot(), { width: 390, height: 810 });
  assert.equal(h.bodyStyle.height, "810px");
  h.resize(844, { visualOnly: true });
  assert.equal(h.bodyStyle.height, "844px");
});

test("focusing chat never expands a visible surface into Safari browser bars", t => {
  const h = harness(t);
  h.resize(720, { visualOnly: true });
  h.focus();
  assert.equal(h.tracker.getSnapshot().height, 720);
  // Safari can briefly reveal the larger layout height while its bars animate.
  h.resize(844, { visualOnly: true });
  assert.equal(h.tracker.getSnapshot().height, 720);
  h.resize(478, { visualOnly: true });
  assert.equal(h.tracker.getSnapshot().height, 720);
  h.resize(720, { visualOnly: true });
  assert.equal(h.tracker.getSnapshot().height, 720);
});

test("closing a lobby keyboard across a phase transition retains height until native dismissal", t => {
  const h = harness(t);
  h.focus();
  h.resize(478);
  h.blur();
  const unlock = h.lock();
  h.advance(600);
  assert.equal(h.bodyStyle.height, "844px");
  h.resize(810);
  h.advance(120);
  assert.equal(h.bodyStyle.height, "810px");
  unlock();
});

test("visual panning moves the screen origin without shrinking or rerendering its board budget", t => {
  const h = harness(t);
  h.focus();
  h.resize(478);
  const updates = [];
  h.tracker.subscribe(value => updates.push(value));
  h.pan(180);
  assert.equal(h.css.get("--mobile-viewport-offset-top"), "180px");
  assert.equal(h.css.get("--mobile-viewport-height"), "844px");
  assert.deepEqual(updates, []);
  h.pan(0);
  assert.equal(h.css.get("--mobile-viewport-offset-top"), "0px");
  h.windowTarget.visualViewport.pageTop = 54;
  h.windowTarget.scrollY = 12;
  h.pan(0);
  assert.equal(h.css.get("--mobile-viewport-offset-top"), "42px");
});

test("overlapping game and chat locks restore document styles only after the last owner", t => {
  const h = harness(t);
  const bodyBefore = { ...h.bodyStyle };
  const rootBefore = { ...h.rootStyle };
  const unlockGame = h.lock();
  const unlockChat = lockMobileGameDocument({ windowTarget: h.windowTarget, documentTarget: h.documentTarget });
  unlockGame();
  unlockGame();
  assert.equal(h.bodyStyle.position, "fixed");
  h.resize(810);
  assert.equal(h.bodyStyle.height, "810px");
  unlockChat();
  unlockChat();
  assert.deepEqual(h.bodyStyle, bodyBefore);
  assert.deepEqual(h.rootStyle, rootBefore);
});

test("shared viewport ownership survives changing screens and disposes only the last subscriber", t => {
  const h = harness(t);
  h.tracker.dispose();
  const options = { windowTarget: h.windowTarget, documentTarget: h.documentTarget };
  const first = acquireMobileGameViewportTracker(options);
  const second = acquireMobileGameViewportTracker(options);
  assert.equal(first.tracker, second.tracker);
  first.release();
  first.release();
  assert.equal(h.windowTarget.listenerCount("focusin"), 1);
  second.release();
  assert.equal(h.windowTarget.listenerCount("focusin"), 0);
  assert.equal(h.css.has("--mobile-viewport-height"), false);
  assert.equal(h.timers.size, 0);
});

test("removing a focused input without blur still protects a keyboard-sized phase transition", t => {
  const h = harness(t);
  h.focus();
  h.documentTarget.activeElement = null;
  h.resize(478);
  assert.equal(h.tracker.getSnapshot().height, 844);
  h.advance(600);
  assert.equal(h.tracker.getSnapshot().height, 844);
  h.resize(844);
  h.advance(120);
  assert.equal(h.tracker.getSnapshot().height, 844);
});

test("a chat lock retains the shared tracker after its source screen unmounts", t => {
  const h = harness(t);
  h.tracker.dispose();
  const options = { windowTarget: h.windowTarget, documentTarget: h.documentTarget };
  const screen = acquireMobileGameViewportTracker(options);
  const unlockScreen = lockMobileGameDocument({ ...options, tracker: screen.tracker });
  const unlockChat = lockMobileGameDocument(options);
  unlockScreen();
  screen.release();
  assert.equal(h.windowTarget.listenerCount("focusin"), 1);
  h.resize(810);
  assert.equal(h.bodyStyle.height, "810px");
  unlockChat();
  assert.equal(h.windowTarget.listenerCount("focusin"), 0);
  assert.equal(h.timers.size, 0);
});
