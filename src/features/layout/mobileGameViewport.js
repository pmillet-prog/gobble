import { VIEWPORT_EVENTS } from "./createViewportEventHub.js";

const SETTLE_DELAYS_MS = [60, 180, 360, 720];
const sharedTrackers = new WeakMap();
const documentLocks = new WeakMap();

function isKeyboardTarget(element) {
  const name = String(element?.tagName || "").toUpperCase();
  return name === "TEXTAREA" || name === "SELECT" || element?.isContentEditable === true ||
    (name === "INPUT" && !/^(button|checkbox|color|file|hidden|radio|range|reset|submit)$/i.test(element.type || "text"));
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function readMobileGameViewport(windowTarget, documentTarget, { keyboardActive = false } = {}) {
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
  return {
    width,
    // Browser/system bars can reduce the visible surface without resizing the
    // layout viewport. Only typing may retain the larger layout reference.
    height: keyboardActive ? Math.max(layoutHeight, visualHeight) : visualHeight || layoutHeight,
  };
}

export function resolveMobileGameViewportLock(previous, measured, {
  keyboardActive = false, allowKeyboardRecovery = false,
} = {}) {
  const width = Math.round(positive(measured?.width));
  const height = Math.round(positive(measured?.height));
  const previousWidth = Math.round(positive(previous?.width));
  const previousHeight = Math.round(positive(previous?.height));
  if (!width || !height) return { width: previousWidth, height: previousHeight };
  if (!previousWidth || !previousHeight || width !== previousWidth) {
    return { width, height };
  }
  // Retaining a maximum forever also retains stale browser/system-bar heights.
  return { width, height: keyboardActive
    ? allowKeyboardRecovery ? Math.max(previousHeight, height) : previousHeight
    : height };
}

export function readMobileVisualViewportTop(windowTarget = globalThis.window) {
  const visual = windowTarget?.visualViewport;
  if (visual?.scale && visual.scale !== 1) return 0;
  if (positive(visual?.width) && Math.abs(visual.width - windowTarget.innerWidth) > 1) return 0;
  return Math.max(0, Number(visual?.offsetTop) || 0,
    (Number(visual?.pageTop) || 0) - (Number(windowTarget?.scrollY ?? windowTarget?.pageYOffset) || 0));
}

function subscribeWindowViewport(windowTarget, listener, types) {
  const events = {
    [VIEWPORT_EVENTS.WINDOW_RESIZE]: [windowTarget, "resize"],
    [VIEWPORT_EVENTS.VISUAL_RESIZE]: [windowTarget.visualViewport, "resize"],
    [VIEWPORT_EVENTS.VISUAL_SCROLL]: [windowTarget.visualViewport, "scroll"],
    [VIEWPORT_EVENTS.ORIENTATION_CHANGE]: [windowTarget, "orientationchange"],
    [VIEWPORT_EVENTS.PAGE_SHOW]: [windowTarget, "pageshow"],
  };
  for (const type of types) events[type]?.[0]?.addEventListener(events[type][1], listener, { passive: true });
  return () => {
    for (const type of types) events[type]?.[0]?.removeEventListener(events[type][1], listener);
  };
}

export function createMobileGameViewportTracker({
  subscribeViewport,
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
}) {
  let viewport = { width: 0, height: 0 };
  let keyboardClosing = false;
  let keyboardCloseTimer = null;
  let hadKeyboardFocus = isKeyboardTarget(documentTarget?.activeElement);
  let allowKeyboardRecovery = hadKeyboardFocus;
  const listeners = new Set();
  const timers = new Set();
  const rootStyle = documentTarget?.documentElement?.style;
  const cssProperties = ["--mobile-viewport-height", "--mobile-viewport-offset-top"];
  const previousCss = cssProperties.map(name => rootStyle?.getPropertyValue?.(name) || "");
  let previousOffset = null;
  const updateOffset = () => {
    const offset = readMobileVisualViewportTop(windowTarget);
    if (offset === previousOffset) return;
    previousOffset = offset;
    rootStyle?.setProperty?.("--mobile-viewport-offset-top", `${offset}px`);
  };
  const preserveKeyboardDismissal = () => {
    keyboardClosing = true;
    if (keyboardCloseTimer !== null) windowTarget.clearTimeout(keyboardCloseTimer);
    keyboardCloseTimer = windowTarget.setTimeout(() => {
      keyboardCloseTimer = null;
      keyboardClosing = false;
      update();
    }, 720);
  };
  const update = () => {
    if (documentTarget?.visibilityState === "hidden") return;
    updateOffset();
    const keyboardFocused = isKeyboardTarget(documentTarget?.activeElement);
    // Removing a focused React input need not dispatch blur/focusout.
    if (hadKeyboardFocus && !keyboardFocused && !keyboardClosing) preserveKeyboardDismissal();
    hadKeyboardFocus = keyboardFocused;
    const keyboardActive = keyboardClosing || keyboardFocused;
    const sameWidth = viewport.width === Math.round(positive(windowTarget.innerWidth) ||
      positive(documentTarget.documentElement?.clientWidth));
    const next = resolveMobileGameViewportLock(viewport,
      // Once observed, the visible surface is authoritative. Reading a larger
      // layout height on focus would expand a Safari screen behind its bars.
      readMobileGameViewport(windowTarget, documentTarget, { keyboardActive: keyboardActive && !sameWidth }),
      { keyboardActive, allowKeyboardRecovery });
    if (!keyboardActive || (viewport.height > 0 && next.height > viewport.height)) {
      allowKeyboardRecovery = false;
    }
    if (next.width === viewport.width && next.height === viewport.height) return;
    viewport = next;
    rootStyle?.setProperty?.("--mobile-viewport-height", `${viewport.height}px`);
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
  const onFocusOut = () => {
    // A focused input can unmount as a round starts, before WebKit dismisses
    // its keyboard. Preserve the reference through that native animation.
    preserveKeyboardDismissal();
    settle();
  };
  const subscribe = subscribeViewport || ((listener, types) => subscribeWindowViewport(windowTarget, listener, types));
  const unsubscribeViewport = subscribe(settle, [
    VIEWPORT_EVENTS.WINDOW_RESIZE,
    VIEWPORT_EVENTS.VISUAL_RESIZE,
    VIEWPORT_EVENTS.ORIENTATION_CHANGE,
    VIEWPORT_EVENTS.PAGE_SHOW,
  ]);
  const unsubscribeVisualScroll = subscribe(updateOffset, [VIEWPORT_EVENTS.VISUAL_SCROLL]);
  windowTarget.addEventListener("focusin", settle, true);
  windowTarget.addEventListener("focusout", onFocusOut, true);
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
      unsubscribeVisualScroll();
      windowTarget.removeEventListener("focusin", settle, true);
      windowTarget.removeEventListener("focusout", onFocusOut, true);
      if (keyboardCloseTimer !== null) windowTarget.clearTimeout(keyboardCloseTimer);
      documentTarget.removeEventListener("visibilitychange", settle);
      clearTimers();
      listeners.clear();
      cssProperties.forEach((name, index) => {
        if (previousCss[index]) rootStyle?.setProperty?.(name, previousCss[index]);
        else rootStyle?.removeProperty?.(name);
      });
    },
  };
}

export function acquireMobileGameViewportTracker(options = {}) {
  const windowTarget = options.windowTarget || globalThis.window;
  let entry = sharedTrackers.get(windowTarget);
  if (!entry) {
    entry = { tracker: createMobileGameViewportTracker({ ...options, windowTarget }), count: 0 };
    sharedTrackers.set(windowTarget, entry);
  }
  entry.count += 1;
  let released = false;
  return { tracker: entry.tracker, release() {
    if (released) return;
    released = true;
    if (--entry.count === 0) {
      entry.tracker.dispose();
      sharedTrackers.delete(windowTarget);
    }
  } };
}

export function lockMobileGameDocument({
  tracker,
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
}) {
  const current = documentLocks.get(documentTarget);
  if (current) {
    current.count += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--current.count === 0) current.restore();
    };
  }
  // The lock owns a lease independently of the screen. A chat can outlive the
  // home screen that first created this tracker during a phase transition.
  const sharedTracker = sharedTrackers.get(windowTarget)?.tracker;
  const acquired = !tracker || tracker === sharedTracker
    ? acquireMobileGameViewportTracker({ windowTarget, documentTarget }) : null;
  tracker ||= acquired.tracker;
  const bodyStyle = documentTarget.body.style;
  const rootStyle = documentTarget.documentElement.style;
  const savedScrollY = windowTarget.scrollY || 0;
  const bodyLock = {
    overflow: "hidden", overscrollBehavior: "none", position: "fixed",
    width: "100%", left: "0", right: "0",
    top: "0", height: bodyStyle.height,
  };
  const rootLock = {
    overflow: "hidden", overscrollBehavior: "none",
  };
  const previousBody = Object.fromEntries(Object.keys(bodyLock).map(key => [key, bodyStyle[key]]));
  const previousRoot = Object.fromEntries(Object.keys(rootLock).map(key => [key, rootStyle[key]]));
  Object.assign(bodyStyle, bodyLock);
  Object.assign(rootStyle, rootLock);
  windowTarget.scrollTo(0, 0);
  const applyHeight = ({ height }) => {
    if (!(height > 0)) return;
    bodyStyle.height = `${height}px`;
  };
  applyHeight(tracker.getSnapshot());
  const unsubscribe = tracker.subscribe(applyHeight);
  const entry = { count: 1, restore() {
    unsubscribe();
    Object.assign(bodyStyle, previousBody);
    Object.assign(rootStyle, previousRoot);
    documentLocks.delete(documentTarget);
    acquired?.release();
    if (savedScrollY) windowTarget.scrollTo(0, savedScrollY);
  } };
  documentLocks.set(documentTarget, entry);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--entry.count === 0) entry.restore();
  };
}
