const STATE_KEY = "__gobblePerfState";
const PUBLIC_KEY = "__gobblePerf";
const TILE_SELECTOR = "[data-board-index], .tile-cell";
const MAX_SESSIONS = 200;

let probeEnabled = false;

function getNow() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
}

function isTileEvent(event) {
  const target = event?.target;
  return target instanceof Element && Boolean(target.closest(TILE_SELECTOR));
}

function getEventTile(event) {
  if (event?.touches?.length) {
    const touch = event.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    return element instanceof Element ? element.closest(TILE_SELECTOR) : null;
  }
  const target = event?.target;
  return target instanceof Element ? target.closest(TILE_SELECTOR) : null;
}

function getTileKey(state, tile) {
  if (!(tile instanceof Element)) return "";
  const boardIndex = tile.getAttribute("data-board-index");
  if (boardIndex != null && boardIndex !== "") return `idx:${boardIndex}`;
  if (!state.tileIds.has(tile)) {
    state.tileIds.set(tile, state.nextTileId);
    state.nextTileId += 1;
  }
  return `el:${state.tileIds.get(tile)}`;
}

function captureTraceTile(state, event) {
  if (!state.activeSession) return;
  const key = getTileKey(state, getEventTile(event));
  if (key) state.activeSession.tileKeys.add(key);
}

function attachTraceListeners(state) {
  if (state.listenersAttached || typeof window === "undefined") return;
  state.listenersAttached = true;

  const startTrace = (event) => {
    if (!state.autoTrace || !isTileEvent(event) || state.activeSession) return;
    startSession(state, "trace", { auto: true, eventType: event.type });
    captureTraceTile(state, event);
  };

  const moveTrace = (event) => {
    if (!state.activeSession?.auto) return;
    captureTraceTile(state, event);
  };

  const stopTrace = (event) => {
    if (!state.activeSession?.auto) return;
    if (state.stopTimer) window.clearTimeout(state.stopTimer);
    state.stopTimer = window.setTimeout(() => {
      state.stopTimer = null;
      stopSession(state, event?.type || "trace-end");
    }, 80);
  };

  window.addEventListener("pointerdown", startTrace, true);
  window.addEventListener("mousedown", startTrace, true);
  window.addEventListener("touchstart", startTrace, true);
  window.addEventListener("pointermove", moveTrace, true);
  window.addEventListener("mousemove", moveTrace, true);
  window.addEventListener("touchmove", moveTrace, true);
  window.addEventListener("pointerup", stopTrace, true);
  window.addEventListener("mouseup", stopTrace, true);
  window.addEventListener("touchend", stopTrace, true);
  window.addEventListener("touchcancel", stopTrace, true);
  state.detachTraceListeners = () => {
    window.removeEventListener("pointerdown", startTrace, true);
    window.removeEventListener("mousedown", startTrace, true);
    window.removeEventListener("touchstart", startTrace, true);
    window.removeEventListener("pointermove", moveTrace, true);
    window.removeEventListener("mousemove", moveTrace, true);
    window.removeEventListener("touchmove", moveTrace, true);
    window.removeEventListener("pointerup", stopTrace, true);
    window.removeEventListener("mouseup", stopTrace, true);
    window.removeEventListener("touchend", stopTrace, true);
    window.removeEventListener("touchcancel", stopTrace, true);
    state.listenersAttached = false;
    state.detachTraceListeners = null;
  };
}

function createState() {
  return {
    activeSession: null,
    autoTrace: true,
    detachTraceListeners: null,
    listenersAttached: false,
    nextTileId: 1,
    sessions: [],
    stopTimer: null,
    tileIds: new WeakMap(),
    totalAppRenders: 0,
  };
}

function snapshotSession(session, totalAppRenders) {
  if (!session) return null;
  return {
    appRenders: totalAppRenders - session.startRenderCount,
    durationMs: roundMs(getNow() - session.startAt),
    label: session.label,
    startedAt: session.startedAt,
    tileCount: session.tileKeys?.size || 0,
  };
}

function getState() {
  if (typeof window === "undefined") return null;
  if (!window[STATE_KEY]) {
    window[STATE_KEY] = createState();
  }
  const state = window[STATE_KEY];
  if (probeEnabled) attachTraceListeners(state);
  if (!window[PUBLIC_KEY]) {
    window[PUBLIC_KEY] = {
      reset() {
        state.activeSession = null;
        state.sessions = [];
        state.totalAppRenders = 0;
        if (state.stopTimer) window.clearTimeout(state.stopTimer);
        state.stopTimer = null;
        return this.snapshot();
      },
      snapshot() {
        return {
          active: snapshotSession(state.activeSession, state.totalAppRenders),
          autoTrace: state.autoTrace,
          sessions: [...state.sessions],
          totalAppRenders: state.totalAppRenders,
        };
      },
      start(label = "manual") {
        return startSession(state, label, { auto: false });
      },
      stop(reason = "manual") {
        return stopSession(state, reason);
      },
      setAutoTrace(enabled) {
        state.autoTrace = Boolean(enabled);
        return this.snapshot();
      },
    };
  }
  return state;
}

function startSession(state, label, { auto = false, eventType = "" } = {}) {
  if (state.stopTimer && typeof window !== "undefined") {
    window.clearTimeout(state.stopTimer);
    state.stopTimer = null;
  }
  state.activeSession = {
    auto,
    eventType,
    label,
    startAt: getNow(),
    startedAt: new Date().toISOString(),
    startRenderCount: state.totalAppRenders,
    tileKeys: new Set(),
  };
  return window[PUBLIC_KEY].snapshot();
}

function stopSession(state, reason = "stop") {
  if (!state.activeSession) return window[PUBLIC_KEY].snapshot();
  const session = state.activeSession;
  const result = {
    appRenders: state.totalAppRenders - session.startRenderCount,
    auto: session.auto,
    durationMs: roundMs(getNow() - session.startAt),
    eventType: session.eventType,
    label: session.label,
    reason,
    startedAt: session.startedAt,
    stoppedAt: new Date().toISOString(),
    tileCount: session.tileKeys?.size || 0,
  };
  state.sessions.push(result);
  if (state.sessions.length > MAX_SESSIONS) {
    state.sessions.splice(0, state.sessions.length - MAX_SESSIONS);
  }
  state.activeSession = null;
  return result;
}

export function recordAppRender() {
  if (!probeEnabled) return;
  const state = getState();
  if (!state) return;
  state.totalAppRenders += 1;
}

export function getPerfSnapshot() {
  if (!probeEnabled) {
    return {
      active: null,
      autoTrace: false,
      sessions: [],
      totalAppRenders: 0,
    };
  }
  const state = getState();
  if (!state || typeof window === "undefined" || !window[PUBLIC_KEY]) {
    return {
      active: null,
      autoTrace: true,
      sessions: [],
      totalAppRenders: 0,
    };
  }
  return window[PUBLIC_KEY].snapshot();
}

export function resetPerfProbe() {
  if (!probeEnabled) return getPerfSnapshot();
  const state = getState();
  if (!state || typeof window === "undefined" || !window[PUBLIC_KEY]) {
    return getPerfSnapshot();
  }
  return window[PUBLIC_KEY].reset();
}

export function setPerfProbeEnabled(enabled) {
  const wasEnabled = probeEnabled;
  probeEnabled = Boolean(enabled);
  if (typeof window === "undefined") return;
  const state = window[STATE_KEY];
  if (probeEnabled) {
    const nextState = getState();
    if (!wasEnabled && nextState) {
      nextState.activeSession = null;
      nextState.sessions = [];
      nextState.totalAppRenders = 0;
    }
    attachTraceListeners(nextState);
    return;
  }
  if (!state) return;
  if (state.stopTimer) window.clearTimeout(state.stopTimer);
  state.stopTimer = null;
  state.activeSession = null;
  state.detachTraceListeners?.();
}
