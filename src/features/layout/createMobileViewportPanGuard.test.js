import assert from "node:assert/strict";
import test from "node:test";

import {
  buildViewportPanTransform,
  createMobileViewportPanGuard,
  isAppleTouchDevice,
  isViewportKeyboardTarget,
} from "./createMobileViewportPanGuard.js";

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    dispatch(type) {
      for (const listener of listeners.get(type) || []) listener({ type });
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };
}

test("recognizes iPhone and iPadOS desktop user agents", () => {
  assert.equal(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (iPhone)" }), true);
  assert.equal(
    isAppleTouchDevice({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 }),
    true,
  );
  assert.equal(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (Android)" }), false);
});

test("recognizes editable keyboard targets", () => {
  assert.equal(isViewportKeyboardTarget({ tagName: "input" }), true);
  assert.equal(isViewportKeyboardTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isViewportKeyboardTarget({ tagName: "BUTTON" }), false);
});

test("preserves an existing transform while compensating viewport pan", () => {
  assert.equal(buildViewportPanTransform("", 84), "translate3d(0, 84px, 0)");
  assert.equal(
    buildViewportPanTransform("scale(1)", 84),
    "scale(1) translate3d(0, 84px, 0)",
  );
  assert.equal(buildViewportPanTransform("scale(1)", 0), "scale(1)");
});

test("compensates iOS keyboard pan and restores the game after blur", () => {
  const events = createEventTarget();
  const body = { style: { transform: "scale(1)" }, scrollTop: 19 };
  const root = { scrollTop: 23 };
  const documentTarget = {
    ...events,
    activeElement: { tagName: "INPUT" },
    body,
    documentElement: root,
  };
  const visualViewport = { offsetTop: 0 };
  const scrollCalls = [];
  const timers = [];
  let viewportListener = null;
  const windowTarget = {
    visualViewport,
    scrollTo: (...args) => scrollCalls.push(args),
  };
  const guard = createMobileViewportPanGuard(
    {
      documentTarget,
      isChatKeyboardExpected: () => isViewportKeyboardTarget(documentTarget.activeElement),
      subscribeViewport(listener) {
        viewportListener = listener;
        return () => {
          viewportListener = null;
        };
      },
      windowTarget,
    },
    {
      enabled: true,
      requestFrame(callback) {
        callback();
        return null;
      },
      setTimer(callback) {
        timers.push(callback);
        return timers.length;
      },
    },
  );

  visualViewport.offsetTop = 84;
  viewportListener();
  assert.equal(body.style.transform, "scale(1) translate3d(0, 84px, 0)");

  documentTarget.activeElement = { tagName: "BODY" };
  documentTarget.dispatch("focusout");
  visualViewport.offsetTop = 0;
  for (const callback of timers) callback();

  assert.equal(body.style.transform, "scale(1)");
  assert.equal(body.scrollTop, 0);
  assert.equal(root.scrollTop, 0);
  assert.deepEqual(scrollCalls.at(-1), [0, 0]);

  guard.dispose();
  assert.equal(body.style.transform, "scale(1)");
  assert.equal(documentTarget.listenerCount("focusout"), 0);
  assert.equal(viewportListener, null);
});
