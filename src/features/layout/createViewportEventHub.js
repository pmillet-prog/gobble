export const VIEWPORT_EVENTS = Object.freeze({
  ORIENTATION_CHANGE: "window:orientationchange",
  PAGE_SHOW: "window:pageshow",
  VISUAL_RESIZE: "visualViewport:resize",
  VISUAL_SCROLL: "visualViewport:scroll",
  WINDOW_RESIZE: "window:resize",
});

const ALL_VIEWPORT_EVENTS = Object.freeze(Object.values(VIEWPORT_EVENTS));

function safeCall(listener, payload) {
  try {
    listener(payload);
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
  }
}

export function createViewportEventHub(
  { scope },
  {
    cancelFrame = (id) => globalThis.window?.cancelAnimationFrame?.(id),
    requestFrame = (callback) => globalThis.window?.requestAnimationFrame?.(callback),
    visualViewportTarget = globalThis.window?.visualViewport,
    windowTarget = globalThis.window,
  } = {}
) {
  const subscribers = new Set();
  const pendingTypes = new Set();
  let frameId = null;
  let started = false;

  function flush() {
    frameId = null;
    if (pendingTypes.size === 0) return;
    const types = Object.freeze([...pendingTypes]);
    pendingTypes.clear();
    const payload = Object.freeze({
      types,
      visualViewport: visualViewportTarget || null,
      window: windowTarget || null,
    });
    for (const entry of [...subscribers]) {
      if (!entry.types.some((type) => types.includes(type))) continue;
      safeCall(entry.listener, payload);
    }
  }

  function schedule(type) {
    pendingTypes.add(type);
    if (frameId != null) return;
    frameId = requestFrame?.(flush);
    if (frameId == null) flush();
  }

  function subscribe(listener, types = ALL_VIEWPORT_EVENTS) {
    if (typeof listener !== "function") return () => {};
    const normalizedTypes = Array.from(
      new Set(
        (Array.isArray(types) ? types : [types]).filter((type) =>
          ALL_VIEWPORT_EVENTS.includes(type)
        )
      )
    );
    const entry = {
      listener,
      types: normalizedTypes.length ? normalizedTypes : ALL_VIEWPORT_EVENTS,
    };
    subscribers.add(entry);
    return () => subscribers.delete(entry);
  }

  function start() {
    if (started) return;
    started = true;
    scope.listen(windowTarget, "resize", () => schedule(VIEWPORT_EVENTS.WINDOW_RESIZE), {
      passive: true,
    });
    scope.listen(
      windowTarget,
      "orientationchange",
      () => schedule(VIEWPORT_EVENTS.ORIENTATION_CHANGE),
      { passive: true }
    );
    scope.listen(windowTarget, "pageshow", () => schedule(VIEWPORT_EVENTS.PAGE_SHOW), {
      passive: true,
    });
    scope.listen(
      visualViewportTarget,
      "resize",
      () => schedule(VIEWPORT_EVENTS.VISUAL_RESIZE),
      { passive: true }
    );
    scope.listen(
      visualViewportTarget,
      "scroll",
      () => schedule(VIEWPORT_EVENTS.VISUAL_SCROLL),
      { passive: true }
    );
    scope.add(() => {
      if (frameId != null) cancelFrame?.(frameId);
      frameId = null;
      pendingTypes.clear();
      subscribers.clear();
      started = false;
    });
  }

  return Object.freeze({ flush, schedule, start, subscribe });
}
