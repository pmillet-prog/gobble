import { VIEWPORT_EVENTS } from "./createViewportEventHub.js";

const SETTLE_DELAYS_MS = [60, 180, 360];

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function readMobileGameViewport(windowTarget, documentTarget) {
  const visualViewport = windowTarget?.visualViewport;
  // clientHeight can be our own inline document lock. Reading it back with
  // Math.min would prevent recovery forever after a keyboard-sized first sample.
  const width = positive(windowTarget?.innerWidth) ||
    positive(documentTarget?.documentElement?.clientWidth);
  const layoutHeight = positive(windowTarget?.innerHeight) ||
    positive(documentTarget?.documentElement?.clientHeight);
  const visualWidth = positive(visualViewport?.width);
  const visualMatchesLayout = (!visualViewport?.scale || visualViewport.scale === 1) &&
    (!visualWidth || Math.abs(visualWidth - width) <= 1);
  const visualHeight = visualMatchesLayout ? positive(visualViewport?.height) : 0;
  return { width, height: Math.max(layoutHeight, visualHeight) };
}

export function resolveMobileGameViewportLock(previous, measured) {
  const width = Math.round(positive(measured?.width));
  const height = Math.round(positive(measured?.height));
  const previousWidth = Math.round(positive(previous?.width));
  const previousHeight = Math.round(positive(previous?.height));
  if (!width || !height) return { width: previousWidth, height: previousHeight };
  if (!previousWidth || !previousHeight || width !== previousWidth) {
    return { width, height };
  }
  // Opening a keyboard must not shrink the board. Closing one must still be
  // able to repair a first sample taken while typing in the lobby.
  return { width, height: Math.max(previousHeight, height) };
}

export function createMobileGameViewportTracker({
  subscribeViewport,
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
}) {
  let viewport = { width: 0, height: 0 };
  const listeners = new Set();
  const timers = new Set();
  const update = () => {
    if (documentTarget?.visibilityState === "hidden") return;
    const next = resolveMobileGameViewportLock(
      viewport, readMobileGameViewport(windowTarget, documentTarget),
    );
    if (next.width === viewport.width && next.height === viewport.height) return;
    viewport = next;
    for (const listener of listeners) listener(viewport);
  };
  const clearTimers = () => {
    for (const id of timers) windowTarget.clearTimeout(id);
    timers.clear();
  };
  const settle = () => {
    update();
    clearTimers();
    // WebKit can publish its final dimensions after blur/resize has fired.
    for (const delay of SETTLE_DELAYS_MS) {
      const id = windowTarget.setTimeout(() => {
        timers.delete(id);
        update();
      }, delay);
      timers.add(id);
    }
  };
  const unsubscribeViewport = subscribeViewport(settle, [
    VIEWPORT_EVENTS.WINDOW_RESIZE,
    VIEWPORT_EVENTS.VISUAL_RESIZE,
    VIEWPORT_EVENTS.ORIENTATION_CHANGE,
    VIEWPORT_EVENTS.PAGE_SHOW,
  ]);
  windowTarget.addEventListener("focusout", settle, true);
  documentTarget.addEventListener("visibilitychange", settle);
  settle();

  return {
    getSnapshot: () => viewport,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      unsubscribeViewport();
      windowTarget.removeEventListener("focusout", settle, true);
      documentTarget.removeEventListener("visibilitychange", settle);
      clearTimers();
      listeners.clear();
    },
  };
}

export function lockMobileGameDocument({
  tracker,
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
}) {
  const bodyStyle = documentTarget.body.style;
  const rootStyle = documentTarget.documentElement.style;
  const savedScrollY = windowTarget.scrollY || 0;
  const bodyLock = {
    overflow: "hidden", overscrollBehavior: "none", position: "fixed",
    width: "100%", left: "0", right: "0", touchAction: "none",
    top: `-${savedScrollY}px`, height: bodyStyle.height,
  };
  const rootLock = {
    overflow: "hidden", overscrollBehavior: "none", position: "fixed",
    width: "100%", left: "0", right: "0", height: rootStyle.height,
  };
  const previousBody = Object.fromEntries(Object.keys(bodyLock).map(key => [key, bodyStyle[key]]));
  const previousRoot = Object.fromEntries(Object.keys(rootLock).map(key => [key, rootStyle[key]]));
  Object.assign(bodyStyle, bodyLock);
  Object.assign(rootStyle, rootLock);
  windowTarget.scrollTo(0, 0);
  const applyHeight = ({ height }) => {
    if (!(height > 0)) return;
    bodyStyle.height = `${height}px`;
    rootStyle.height = `${height}px`;
  };
  applyHeight(tracker.getSnapshot());
  const unsubscribe = tracker.subscribe(applyHeight);
  return () => {
    unsubscribe();
    Object.assign(bodyStyle, previousBody);
    Object.assign(rootStyle, previousRoot);
    if (savedScrollY) windowTarget.scrollTo(0, savedScrollY);
  };
}
