export function createPlayerActivityFeature(
  { ports, scope },
  { documentObject = globalThis.document, windowObject = globalThis.window } = {}
) {
  const realtime = ports?.realtime;
  const passiveCapture = { passive: true, capture: true };
  let enabled = false;
  let listenersBound = false;
  let roomId = null;
  let lastSentAt = 0;

  function signal(kind = "interaction", options = {}) {
    if (!enabled || !realtime?.connected) return false;
    if (documentObject?.visibilityState === "hidden") return false;
    const now = Date.now();
    const force = !!options?.force;
    if (!force && now - lastSentAt < 1200) return false;
    lastSentAt = now;
    realtime.emit("player:activity", { roomId, kind });
    return true;
  }

  const onPointerActivity = () => signal("pointer");
  const onWheelActivity = () => signal("wheel");
  const onKeyboardActivity = () => signal("keyboard");
  const onScrollActivity = (event) => {
    if (event?.isTrusted === false) return;
    signal("scroll");
  };
  const onVisibilityActivity = () => {
    if (documentObject?.visibilityState === "visible") {
      signal("visible", { force: true });
    }
  };

  function bindListeners() {
    if (listenersBound || !windowObject || !documentObject) return;
    listenersBound = true;
    windowObject.addEventListener("pointerdown", onPointerActivity, passiveCapture);
    windowObject.addEventListener("wheel", onWheelActivity, passiveCapture);
    windowObject.addEventListener("keydown", onKeyboardActivity, true);
    documentObject.addEventListener("scroll", onScrollActivity, passiveCapture);
    documentObject.addEventListener("visibilitychange", onVisibilityActivity);
  }

  function unbindListeners() {
    if (!listenersBound || !windowObject || !documentObject) return;
    listenersBound = false;
    windowObject.removeEventListener("pointerdown", onPointerActivity, passiveCapture);
    windowObject.removeEventListener("wheel", onWheelActivity, passiveCapture);
    windowObject.removeEventListener("keydown", onKeyboardActivity, true);
    documentObject.removeEventListener("scroll", onScrollActivity, passiveCapture);
    documentObject.removeEventListener("visibilitychange", onVisibilityActivity);
  }

  function configure(next = {}) {
    roomId = String(next.roomId || "").trim() || null;
    const nextEnabled = !!next.enabled;
    if (nextEnabled === enabled) return;
    enabled = nextEnabled;
    if (!enabled) {
      unbindListeners();
      return;
    }
    bindListeners();
    signal("live_open", { force: true });
  }

  function start() {
    scope.add(() => {
      enabled = false;
      unbindListeners();
      roomId = null;
      lastSentAt = 0;
    });
  }

  return Object.freeze({ configure, signal, start });
}
