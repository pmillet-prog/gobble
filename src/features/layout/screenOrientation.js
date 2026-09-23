// Android TWAs may expose neither a WebView UA nor an android-app referrer.
// Device identity must not change when a phone rotates into a desktop layout.
export function isOrientationMobileDevice(navigator = globalThis.navigator) {
  return /Android|iPhone|iPad|iPod/i.test(navigator?.userAgent || "") ||
    (/Macintosh/i.test(navigator?.userAgent || "") && navigator?.maxTouchPoints > 1);
}

export function resolveScreenOrientationMode({ isMobileLayout, allowLandscape, isAndroidApp, isMobileDevice }) {
  if (!(isMobileDevice || isMobileLayout || isAndroidApp)) return null;
  return allowLandscape ? "any" : "portrait";
}

export function createScreenOrientationController({ orientation, document, window }) {
  let active = false, mode = null, applied = null, pending = null, revision = 0;
  const release = () => { try { orientation?.unlock?.(); } catch { /* Optional browser API. */ } };
  const apply = (force = false) => {
    if (!active || !mode || document?.visibilityState === "hidden" || typeof orientation?.lock !== "function") return;
    if (pending?.mode === mode || (!force && applied === mode)) return;
    const request = { mode, revision: ++revision };
    pending = request;
    const failed = () => {
      if (!active || request.revision !== revision) return;
      pending = null; applied = null;
      if (mode === "any") release();
    };
    try {
      Promise.resolve(orientation.lock(mode)).then(() => {
        if (!active || request.revision !== revision) return;
        pending = null; applied = request.mode;
      }, failed);
    } catch { failed(); }
  };
  const refresh = () => apply(true);
  const retryFromGesture = () => apply();
  const rotated = () => {
    if (mode === "portrait" && orientation?.type?.startsWith("landscape")) apply(true);
  };
  const listeners = [
    [document, "visibilitychange", refresh], [document, "fullscreenchange", refresh],
    [document, "pointerup", retryFromGesture], [document, "keydown", retryFromGesture],
    [window, "pageshow", refresh], [window, "focus", refresh], [orientation, "change", rotated],
  ];
  return {
    setMode(next) {
      if (mode === next) return;
      mode = next; applied = null; pending = null; revision++;
      if (next) apply(); else release();
    },
    start() {
      if (active) return;
      active = true;
      for (const [target, event, listener] of listeners) target?.addEventListener?.(event, listener);
      apply();
    },
    stop() {
      active = false; pending = null; applied = null; revision++;
      for (const [target, event, listener] of listeners) target?.removeEventListener?.(event, listener);
      // Never return to the wrapper's unrestricted default when leaving the board.
      if (mode === "any") {
        try { Promise.resolve(orientation?.lock?.("portrait")).catch(() => {}); } catch { /* Page closing. */ }
      }
    },
  };
}
