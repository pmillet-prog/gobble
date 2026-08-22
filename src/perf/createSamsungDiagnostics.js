import AssetManager from "../assets/assetManager.js";

const SAMSUNG_DIAG_SNAPSHOT_STORAGE_KEY = "gobbleSamsungDiagLast";
const SAMSUNG_DIAG_RING_LIMIT = 180;
const SAMSUNG_DIAG_TOUCH_RATE_WINDOW_MS = 1000;
const SAMSUNG_DIAG_HIGH_TOUCH_RATE_PER_SEC = 70;
const SAMSUNG_DIAG_TOUCH_RATE_MIN_SAMPLES = 8;
const SAMSUNG_DIAG_TOUCH_RATE_MIN_ELAPSED_MS = 140;

export function createSamsungDiagnostics(runtime) {
  const [
    samsungDiagEnabledRef,
    samsungDiagRef,
    dragGridMetricsRef,
    gridHitboxRef,
    audioVoiceRef,
    tickRef,
    currentTilesRef,
    samsungDiagSourceRef,
    isSamsungBrowserRef,
    samsungSafeModeRef,
    phaseRef,
    draggingRef,
    dragMoveRafRef,
    dragPendingPointRef,
  ] = runtime;

function getSamsungDiagNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function isSamsungDiagActive() {
  return !!samsungDiagEnabledRef.current;
}

function bumpSamsungDiagCounter(counter, delta = 1) {
  if (!isSamsungDiagActive()) return;
  if (!counter) return;
  const diag = samsungDiagRef.current;
  if (!diag?.counters || !Object.prototype.hasOwnProperty.call(diag.counters, counter)) return;
  const base = Number(diag.counters[counter]) || 0;
  diag.counters[counter] = base + delta;
}

function buildSamsungDiagSnapshot(reason = "heartbeat", extra = null) {
  const diag = samsungDiagRef.current || {};
  const metrics = dragGridMetricsRef.current || gridHitboxRef.current;
  const voiceState = audioVoiceRef.current || {};
  const tickValue = tickRef.current;
  const wordLen = Array.isArray(currentTilesRef.current) ? currentTilesRef.current.length : 0;
  const payload = {
    at: new Date().toISOString(),
    reason,
    source: samsungDiagSourceRef.current || "unknown",
    samsungBrowser: !!isSamsungBrowserRef.current,
    samsungSafeMode: !!samsungSafeModeRef.current,
    phase: phaseRef.current,
    tick: Number.isFinite(tickValue) ? tickValue : null,
    drag: !!draggingRef.current,
    dragRafPending: dragMoveRafRef.current != null,
    dragPointPending: !!dragPendingPointRef.current,
    wordLen,
    touchRate: {
      peakPerSec: Math.round(diag?.touchRate?.peakPerSec || 0),
      inWindow: Number(diag?.touchRate?.count) || 0,
    },
    counters: { ...(diag?.counters || {}) },
    grid: metrics
      ? {
          size: metrics.size,
          cellWidth: Math.round(metrics.cellWidth || 0),
          cellHeight: Math.round(metrics.cellHeight || 0),
          colGap: Math.round(metrics.colGap || 0),
          rowGap: Math.round(metrics.rowGap || 0),
        }
      : null,
    audio: {
      activeVoices: Number.isFinite(voiceState.activeVoices) ? voiceState.activeVoices : null,
      maxVoices: Number.isFinite(voiceState.maxVoices) ? voiceState.maxVoices : null,
      drops: Number.isFinite(voiceState.drops) ? voiceState.drops : null,
      cooldownKeys:
        voiceState.lastPlayed instanceof Map ? voiceState.lastPlayed.size : null,
    },
    assetAudio: AssetManager.getAudioDebugStats?.() || null,
    recent: Array.isArray(diag?.events) ? diag.events.slice(-18) : [],
  };
  if (extra && typeof extra === "object") {
    payload.extra = extra;
  }
  return payload;
}

function flushSamsungDiagSnapshot(reason = "heartbeat", { consoleLevel = "", extra = null } = {}) {
  if (!isSamsungDiagActive()) return null;
  const diag = samsungDiagRef.current;
  const now = Date.now();
  const forceConsole = consoleLevel === "warn" || consoleLevel === "error";
  if (!forceConsole && now - (diag.lastFlushAt || 0) < 1200) return diag.lastSnapshot || null;
  diag.lastFlushAt = now;
  const snapshot = buildSamsungDiagSnapshot(reason, extra);
  diag.lastSnapshot = snapshot;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SAMSUNG_DIAG_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
    }
  } catch (_) {}
  if (typeof window !== "undefined") {
    window.__gobbleSamsungDiagLast = snapshot;
  }
  if (consoleLevel === "error") {
    try {
      console.error("[perf][samsung][diag]", reason, JSON.stringify(snapshot));
    } catch (_) {
      console.error("[perf][samsung][diag]", reason, snapshot);
    }
  } else if (consoleLevel === "warn") {
    try {
      console.warn("[perf][samsung][diag]", reason, JSON.stringify(snapshot));
    } catch (_) {
      console.warn("[perf][samsung][diag]", reason, snapshot);
    }
  } else if (reason === "heartbeat" && samsungDiagSourceRef.current === "query") {
    try {
      console.info("[perf][samsung][diag]", reason, JSON.stringify(snapshot));
    } catch (_) {
      console.info("[perf][samsung][diag]", reason, snapshot);
    }
  }
  return snapshot;
}

function pushSamsungDiagEvent(event, payload = null, { consoleLevel = "", flush = false } = {}) {
  if (!isSamsungDiagActive()) return;
  const diag = samsungDiagRef.current;
  const entry = {
    seq: (diag.seq || 0) + 1,
    at: new Date().toISOString(),
    t: Math.round(getSamsungDiagNowMs()),
    event,
  };
  if (payload && typeof payload === "object") {
    entry.payload = payload;
  }
  diag.seq = entry.seq;
  diag.events.push(entry);
  if (diag.events.length > SAMSUNG_DIAG_RING_LIMIT) {
    diag.events.splice(0, diag.events.length - SAMSUNG_DIAG_RING_LIMIT);
  }
  if (consoleLevel === "error") {
    try {
      console.error("[perf][samsung][diag-event]", event, JSON.stringify(payload || {}));
    } catch (_) {
      console.error("[perf][samsung][diag-event]", event, payload || {});
    }
  } else if (consoleLevel === "warn") {
    try {
      console.warn("[perf][samsung][diag-event]", event, JSON.stringify(payload || {}));
    } catch (_) {
      console.warn("[perf][samsung][diag-event]", event, payload || {});
    }
  }
  if (flush) {
    flushSamsungDiagSnapshot(event, {
      consoleLevel: consoleLevel || "warn",
      extra: payload && typeof payload === "object" ? payload : null,
    });
  }
}

function noteSamsungTouchMoveRate() {
  if (!isSamsungDiagActive()) return;
  const now = getSamsungDiagNowMs();
  const diag = samsungDiagRef.current;
  const bucket = diag.touchRate;
  if (now - (bucket.startAt || 0) > SAMSUNG_DIAG_TOUCH_RATE_WINDOW_MS) {
    bucket.startAt = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  const elapsed = Math.max(1, now - bucket.startAt);
  if (
    bucket.count < SAMSUNG_DIAG_TOUCH_RATE_MIN_SAMPLES ||
    elapsed < SAMSUNG_DIAG_TOUCH_RATE_MIN_ELAPSED_MS
  ) {
    return;
  }
  const perSec = (bucket.count * 1000) / elapsed;
  if (perSec > bucket.peakPerSec) {
    bucket.peakPerSec = perSec;
  }
  if (
    perSec >= SAMSUNG_DIAG_HIGH_TOUCH_RATE_PER_SEC &&
    now - (bucket.lastHighAt || 0) > 1800
  ) {
    bucket.lastHighAt = now;
    pushSamsungDiagEvent(
      "touch-rate-high",
      {
        perSec: Math.round(perSec),
        drag: !!draggingRef.current,
        rafPending: dragMoveRafRef.current != null,
        pointPending: !!dragPendingPointRef.current,
      },
      { consoleLevel: "warn", flush: true }
    );
  }
}


  return [
    getSamsungDiagNowMs,
    isSamsungDiagActive,
    bumpSamsungDiagCounter,
    buildSamsungDiagSnapshot,
    flushSamsungDiagSnapshot,
    pushSamsungDiagEvent,
    noteSamsungTouchMoveRate,
  ];
}
