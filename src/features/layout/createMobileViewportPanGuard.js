const RECOVERY_DELAYS_MS = Object.freeze([0, 80, 240, 480, 800]);

export function isAppleTouchDevice(navigatorTarget = globalThis.navigator) {
  const userAgent = String(navigatorTarget?.userAgent || "");
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return (
    String(navigatorTarget?.platform || "") === "MacIntel" &&
    Number(navigatorTarget?.maxTouchPoints || 0) > 1
  );
}

export function isViewportKeyboardTarget(element) {
  const tagName = String(element?.tagName || "").toUpperCase();
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    element?.isContentEditable === true
  );
}

export function buildViewportPanTransform(baseTransform, offsetTop) {
  const base = String(baseTransform || "").trim();
  const offset = Math.max(0, Math.round(Number(offsetTop) || 0));
  if (!(offset > 0)) return base;
  const compensation = `translate3d(0, ${offset}px, 0)`;
  return base && base !== "none" ? `${base} ${compensation}` : compensation;
}

export function createMobileViewportPanGuard(
  {
    documentTarget = globalThis.document,
    isChatKeyboardExpected = () => false,
    subscribeViewport = () => () => {},
    windowTarget = globalThis.window,
  },
  {
    cancelFrame = (id) => windowTarget?.cancelAnimationFrame?.(id),
    clearTimer = (id) => windowTarget?.clearTimeout?.(id),
    enabled = isAppleTouchDevice(windowTarget?.navigator || globalThis.navigator),
    requestFrame = (callback) => windowTarget?.requestAnimationFrame?.(callback),
    setTimer = (callback, delayMs) => windowTarget?.setTimeout?.(callback, delayMs),
  } = {},
) {
  const body = documentTarget?.body;
  const root = documentTarget?.documentElement;
  const visualViewport = windowTarget?.visualViewport;
  if (!enabled || !body || !root || !visualViewport) {
    return Object.freeze({
      dispose() {},
      scheduleRecovery() {},
      syncNow() {},
    });
  }

  const originalTransform = body.style.transform;
  const timers = new Set();
  let frameId = null;
  let disposed = false;
  let observedKeyboardPan = false;

  const resetDocumentScroll = () => {
    if (isChatKeyboardExpected()) return;
    root.scrollTop = 0;
    body.scrollTop = 0;
    windowTarget.scrollTo?.(0, 0);
  };

  const syncNow = () => {
    frameId = null;
    if (disposed) return;
    const keyboardExpected = !!isChatKeyboardExpected();
    const offsetTop = Math.max(
      0,
      Math.round(Number(visualViewport.offsetTop) || 0),
    );
    if (keyboardExpected && offsetTop > 0) observedKeyboardPan = true;

    const shouldCompensate =
      offsetTop > 0 && (keyboardExpected || observedKeyboardPan);
    body.style.transform = shouldCompensate
      ? buildViewportPanTransform(originalTransform, offsetTop)
      : originalTransform;

    if (!keyboardExpected && observedKeyboardPan && offsetTop === 0) {
      observedKeyboardPan = false;
      resetDocumentScroll();
    }
  };

  const scheduleSync = () => {
    if (disposed || frameId != null) return;
    frameId = requestFrame?.(syncNow);
    if (frameId == null) syncNow();
  };

  const scheduleRecovery = () => {
    if (disposed) return;
    if (Number(visualViewport.offsetTop) > 0) observedKeyboardPan = true;
    for (const delayMs of RECOVERY_DELAYS_MS) {
      const timerId = setTimer?.(() => {
        timers.delete(timerId);
        if (disposed) return;
        resetDocumentScroll();
        scheduleSync();
      }, delayMs);
      if (timerId != null) timers.add(timerId);
    }
  };

  const onFocusOut = () => scheduleRecovery();
  const unsubscribeViewport = subscribeViewport(scheduleSync);
  documentTarget.addEventListener?.("focusout", onFocusOut, true);
  syncNow();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    unsubscribeViewport?.();
    documentTarget.removeEventListener?.("focusout", onFocusOut, true);
    if (frameId != null) cancelFrame?.(frameId);
    frameId = null;
    for (const timerId of timers) clearTimer?.(timerId);
    timers.clear();
    body.style.transform = originalTransform;
  };

  return Object.freeze({ dispose, scheduleRecovery, syncNow });
}
