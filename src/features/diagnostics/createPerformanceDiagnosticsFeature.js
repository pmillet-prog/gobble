import AssetManager from "../../assets/assetManager.js";
import { AUDIO_COOLDOWN_MAX_KEYS } from "../../audio/audioRuntimeLimits.js";
import {
  isLikelySamsungDeviceUserAgent,
} from "../../app/adapters/deviceCapabilities.js";
import { isAndroidWebViewUserAgent } from "../../utils/displayMode.js";
import { createSamsungDiagnostics } from "../../perf/createSamsungDiagnostics.js";

const DEV_MODE = typeof import.meta !== "undefined" && !!import.meta.env?.DEV;
const SAMSUNG_SAFE_MODE_STORAGE_KEY = "samsungSafeMode";
const SAMSUNG_DIAG_QUERY_PARAM = "samsungDiag";
const SAMSUNG_DIAG_STORAGE_KEY = "gobbleSamsungDiagEnabled";
const SAMSUNG_BROWSER_WARNING_SESSION_KEY = "gobbleSamsungBrowserWarningShown";
const SAMSUNG_DIAG_FLUSH_INTERVAL_MS = 4000;
const EMPTY_LIST = Object.freeze([]);

function createDiagnosticsState() {
  return {
    seq: 0,
    events: [],
    counters: {
      touchStart: 0,
      touchMove: 0,
      touchEnd: 0,
      queueDragMove: 0,
      queueDragCoalesced: 0,
      socketPlayersUpdate: 0,
      socketRankingUpdate: 0,
      rafFired: 0,
      rafLagged: 0,
      rafGlobalJank: 0,
      rafGlobalStall: 0,
      rafNoPending: 0,
      rafNotDragging: 0,
      tileHitMiss: 0,
      longTask: 0,
      eventLoopStall: 0,
      jsError: 0,
      unhandledRejection: 0,
    },
    touchRate: {
      startAt: 0,
      count: 0,
      peakPerSec: 0,
      lastHighAt: 0,
    },
    lastFlushAt: 0,
    lastSnapshot: null,
  };
}

function safeInvoke(callback, ...args) {
  try {
    return callback?.(...args);
  } catch (_) {
    return undefined;
  }
}

export function createPerformanceDiagnosticsFeature(
  { scope },
  {
    assetManager = AssetManager,
    audioCooldownMaxKeys = AUDIO_COOLDOWN_MAX_KEYS,
    clearIntervalFn = clearInterval,
    clearTimeoutFn = clearTimeout,
    dateNow = Date.now,
    devMode = DEV_MODE,
    documentTarget = globalThis.document,
    localStorageTarget = globalThis.localStorage,
    navigatorTarget = globalThis.navigator,
    performanceObserverCtor = globalThis.PerformanceObserver,
    performanceTarget = globalThis.performance,
    requestAnimationFrameFn = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelAnimationFrameFn = globalThis.cancelAnimationFrame?.bind(globalThis),
    sessionStorageTarget = globalThis.sessionStorage,
    setIntervalFn = setInterval,
    setTimeoutFn = setTimeout,
    windowTarget = globalThis.window,
  } = {}
) {
  const refs = Object.freeze({
    enabled: { current: false },
    isSamsungBrowser: { current: false },
    safeMode: { current: false },
    safeModeSource: { current: "off" },
    source: { current: "off" },
    state: { current: createDiagnosticsState() },
  });
  let active = false;
  let config = {};
  let configured = false;
  let initialized = false;
  let perfLogLastAt = 0;
  let warningTimerId = null;
  let rafGapId = null;
  const intervals = new Set();
  const listeners = [];
  const observers = new Set();

  const sourceRef = (key, fallback) =>
    Object.freeze({
      get current() {
        return config[key]?.current ?? fallback;
      },
    });

  const [
    getNowMs,
    isActive,
    bumpCounter,
    buildSnapshot,
    flushSnapshot,
    pushEvent,
    noteTouchMoveRate,
  ] = createSamsungDiagnostics([
    refs.enabled,
    refs.state,
    sourceRef("dragGridMetricsRef", null),
    sourceRef("gridHitboxRef", null),
    sourceRef("audioVoiceRef", null),
    sourceRef("tickRef", null),
    sourceRef("currentTilesRef", EMPTY_LIST),
    refs.source,
    refs.isSamsungBrowser,
    refs.safeMode,
    sourceRef("phaseRef", ""),
    sourceRef("draggingRef", false),
    sourceRef("dragMoveRafRef", null),
    sourceRef("dragPendingPointRef", null),
  ]);

  function listen(target, eventName, listener) {
    if (!target?.addEventListener || typeof listener !== "function") return;
    target.addEventListener(eventName, listener);
    listeners.push(() => target.removeEventListener(eventName, listener));
  }

  function interval(callback, delayMs) {
    const id = setIntervalFn(callback, delayMs);
    intervals.add(id);
    return id;
  }

  function observeLongTasks(callback) {
    if (typeof performanceObserverCtor !== "function") return null;
    try {
      const observer = new performanceObserverCtor(callback);
      observer.observe({ entryTypes: ["longtask"] });
      observers.add(observer);
      return observer;
    } catch (_) {
      return null;
    }
  }

  function installDiagnosticHooks() {
    if (!refs.enabled.current || !windowTarget || !documentTarget) return;
    const onVisibility = () => {
      if (documentTarget.visibilityState === "hidden") {
        flushSnapshot("visibility-hidden");
      } else if (documentTarget.visibilityState === "visible") {
        pushEvent("visibility-visible");
      }
    };
    const onError = (event) => {
      bumpCounter("jsError");
      pushEvent(
        "window-error",
        {
          message: String(event?.message || ""),
          source: String(event?.filename || ""),
          line: Number(event?.lineno) || null,
          col: Number(event?.colno) || null,
        },
        { consoleLevel: "error", flush: true }
      );
    };
    const onUnhandledRejection = (event) => {
      const reason = event?.reason;
      let fallbackText = "";
      try {
        fallbackText = JSON.stringify(reason || null);
      } catch (_) {
        fallbackText = String(reason || "");
      }
      bumpCounter("unhandledRejection");
      pushEvent(
        "unhandled-rejection",
        {
          message: String(
            typeof reason === "string"
              ? reason
              : reason?.message || reason?.stack || fallbackText
          ),
        },
        { consoleLevel: "error", flush: true }
      );
    };

    interval(() => flushSnapshot("heartbeat"), SAMSUNG_DIAG_FLUSH_INTERVAL_MS);
    windowTarget.__gobbleSamsungDiagDump = (reason = "manual") =>
      flushSnapshot(String(reason || "manual"), { consoleLevel: "warn" });
    windowTarget.__gobbleSamsungDiagRead = () =>
      refs.state.current?.lastSnapshot || buildSnapshot("manual-read");
    pushEvent("diag-hooks-ready", { source: refs.source.current || "unknown" });
    flushSnapshot("diag-init");
    listen(documentTarget, "visibilitychange", onVisibility);
    listen(windowTarget, "pagehide", () => flushSnapshot("pagehide"));
    listen(windowTarget, "beforeunload", () => flushSnapshot("beforeunload"));
    listen(windowTarget, "error", onError);
    listen(windowTarget, "unhandledrejection", onUnhandledRejection);
  }

  function installDevelopmentLongTaskObserver() {
    if (!devMode) return;
    observeLongTasks((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.duration < 50) return;
        const phase = config.phaseRef?.current;
        const tickValue = config.tickRef?.current;
        if (phase === "playing" && typeof tickValue === "number" && tickValue <= 10) {
          console.warn("[perf] longtask", Math.round(entry.duration), "ms", "tick", tickValue);
        }
      });
    });
  }

  function installSamsungPerformanceMonitor() {
    if (!windowTarget || !performanceTarget?.now) return;
    if (!refs.isSamsungBrowser.current && !isActive()) return;
    const maybeLogPerf = (event, payload = {}) => {
      const now = dateNow();
      if (now - perfLogLastAt < 1500) return;
      perfLogLastAt = now;
      const voiceState = config.audioVoiceRef?.current || {};
      const tickValue = config.tickRef?.current;
      const currentTiles = config.currentTilesRef?.current;
      const meta = {
        phase: config.phaseRef?.current,
        tick: Number.isFinite(tickValue) ? tickValue : null,
        drag: !!config.draggingRef?.current,
        wordLen: Array.isArray(currentTiles) ? currentTiles.length : 0,
        samsungSafeMode: !!refs.safeMode.current,
        samsungSafeModeSource: refs.safeModeSource.current || "unknown",
        audioVoices: Number.isFinite(voiceState.activeVoices) ? voiceState.activeVoices : null,
        audioMaxVoices: Number.isFinite(voiceState.maxVoices) ? voiceState.maxVoices : null,
        audioDrops: Number.isFinite(voiceState.drops) ? voiceState.drops : null,
        audioCooldownKeys:
          voiceState.lastPlayed instanceof Map ? voiceState.lastPlayed.size : null,
        assetAudio: assetManager.getAudioDebugStats?.() || null,
        ...payload,
      };
      try {
        console.warn("[perf][samsung]", event, JSON.stringify(meta));
      } catch (_) {
        console.warn("[perf][samsung]", event, meta);
      }
      if (!isActive()) return;
      if (event === "longtask") {
        bumpCounter("longTask", Math.max(1, Number(payload?.count) || 1));
      } else if (event === "event-loop-stall") {
        bumpCounter("eventLoopStall");
      }
      const shouldWarn =
        event === "event-loop-stall" ||
        event === "longtask" ||
        event === "audio-cooldown-growth";
      pushEvent(
        `perf-${event}`,
        {
          tick: meta.tick,
          phase: meta.phase,
          drag: meta.drag,
          wordLen: meta.wordLen,
          ...payload,
        },
        shouldWarn ? { consoleLevel: "warn" } : {}
      );
      if (shouldWarn) {
        flushSnapshot(`perf-${event}`, {
          consoleLevel: "warn",
          extra: payload,
        });
      }
    };

    observeLongTasks((list) => {
      const entries = list.getEntries();
      let count = 0;
      let maxMs = 0;
      for (let index = 0; index < entries.length; index += 1) {
        const duration = entries[index]?.duration || 0;
        if (duration < 80) continue;
        count += 1;
        if (duration > maxMs) maxMs = duration;
      }
      if (count > 0) {
        maybeLogPerf("longtask", { count, maxMs: Math.round(maxMs) });
      }
    });

    let lastTick = performanceTarget.now();
    let lastFrameTs = performanceTarget.now();
    const rafGapLoop = (timestamp) => {
      const delta = timestamp - lastFrameTs;
      lastFrameTs = timestamp;
      if (delta >= 120) {
        bumpCounter("rafGlobalJank");
        if (delta >= 700) bumpCounter("rafGlobalStall");
        if (delta >= 220) {
          maybeLogPerf("raf-gap", { gapMs: Math.round(delta) });
        }
      }
      if (active && typeof requestAnimationFrameFn === "function") {
        rafGapId = requestAnimationFrameFn(rafGapLoop);
      }
    };
    if (typeof requestAnimationFrameFn === "function") {
      rafGapId = requestAnimationFrameFn(rafGapLoop);
    }
    interval(() => {
      const now = performanceTarget.now();
      const drift = now - lastTick - 1000;
      lastTick = now;
      if (drift >= 250) {
        maybeLogPerf("event-loop-stall", { driftMs: Math.round(drift) });
      }
    }, 1000);
    interval(() => {
      safeInvoke(assetManager.compactAudioState, { nowMs: dateNow() });
      const cooldownSize =
        config.audioVoiceRef?.current?.lastPlayed instanceof Map
          ? config.audioVoiceRef.current.lastPlayed.size
          : 0;
      if (cooldownSize > Math.floor(audioCooldownMaxKeys * 0.8)) {
        maybeLogPerf("audio-cooldown-growth", { cooldownSize });
      }
    }, 5000);
  }

  function detectSamsungRuntime() {
    const ua = navigatorTarget?.userAgent || "";
    const brands =
      Array.isArray(navigatorTarget?.userAgentData?.brands) &&
      navigatorTarget.userAgentData.brands.length
        ? navigatorTarget.userAgentData.brands
            .map((entry) => String(entry?.brand || ""))
            .join(" ")
        : "";
    const isSamsungBrowser = /SamsungBrowser/i.test(ua) || /Samsung Internet/i.test(brands);
    const isSamsungWebView =
      isAndroidWebViewUserAgent(ua) && isLikelySamsungDeviceUserAgent(ua);
    const isSamsung = isSamsungBrowser || isSamsungWebView;
    refs.isSamsungBrowser.current = isSamsungBrowser;

    const localHost = /^(localhost|127\.0\.0\.1)$/i.test(
      String(windowTarget?.location?.hostname || "")
    );
    if (isSamsung && windowTarget) {
      const bypassSessionGuard = devMode || localHost;
      let shouldShowWarning = bypassSessionGuard;
      if (!bypassSessionGuard) {
        shouldShowWarning = true;
        try {
          shouldShowWarning =
            sessionStorageTarget?.getItem(SAMSUNG_BROWSER_WARNING_SESSION_KEY) !== "1";
        } catch (_) {}
      }
      if (shouldShowWarning && typeof windowTarget.alert === "function") {
        warningTimerId = setTimeoutFn(() => {
          warningTimerId = null;
          windowTarget.alert(
            "Runtime Samsung detecte (Samsung Internet ou WebView Samsung).\n\nPour reduire les plantages, changez le navigateur par defaut:\n1) Parametres\n2) Applications\n3) Choisir les applications par defaut\n4) Application navigateur\n5) Selectionnez Chrome, Firefox ou Edge.\n\nImportant: apres ce changement, relancez completement le jeu.\n\nPour sauvegarder la progression et recuperer votre compte apres changement du navigateur par defaut:\n- Copiez votre code dans Reglages > A propos > Lier un code\n- Puis collez ce meme code dans ce meme menu une fois le navigateur change."
          );
        }, 0);
        try {
          sessionStorageTarget?.setItem(SAMSUNG_BROWSER_WARNING_SESSION_KEY, "1");
        } catch (_) {}
      }
    }

    let forcedDiag = null;
    let diagSource = "auto-off";
    try {
      localStorageTarget?.removeItem(SAMSUNG_SAFE_MODE_STORAGE_KEY);
    } catch (_) {}
    try {
      const rawDiag = new URLSearchParams(windowTarget?.location?.search || "").get(
        SAMSUNG_DIAG_QUERY_PARAM
      );
      if (/^(1|true|on)$/i.test(String(rawDiag || ""))) {
        forcedDiag = true;
        diagSource = "query";
      } else if (/^(0|false|off)$/i.test(String(rawDiag || ""))) {
        forcedDiag = false;
        diagSource = "query";
      }
    } catch (_) {}
    if (forcedDiag === null) {
      try {
        const savedDiag = localStorageTarget?.getItem(SAMSUNG_DIAG_STORAGE_KEY);
        if (/^(1|true|on)$/i.test(String(savedDiag || ""))) {
          forcedDiag = true;
          diagSource = "storage";
        } else if (/^(0|false|off)$/i.test(String(savedDiag || ""))) {
          forcedDiag = false;
          diagSource = "storage";
        }
      } catch (_) {}
      if (forcedDiag === null && (devMode || localHost)) {
        forcedDiag = true;
        diagSource = "dev-local";
      }
    } else {
      try {
        localStorageTarget?.setItem(SAMSUNG_DIAG_STORAGE_KEY, forcedDiag ? "1" : "0");
      } catch (_) {}
    }
    refs.safeMode.current = false;
    refs.safeModeSource.current = "disabled";
    refs.enabled.current = forcedDiag === null ? false : !!forcedDiag;
    refs.source.current = forcedDiag === null ? "auto-off" : diagSource;
    if (refs.enabled.current) {
      pushEvent(
        "diag-enabled",
        {
          source: refs.source.current,
          isSamsung,
          safeMode: refs.safeMode.current,
        },
        { consoleLevel: "warn", flush: true }
      );
    }
  }

  function initialize() {
    if (!active || !configured || initialized) return;
    initialized = true;
    detectSamsungRuntime();
    installDiagnosticHooks();
    installDevelopmentLongTaskObserver();
    installSamsungPerformanceMonitor();
  }

  function configure(nextConfig = {}) {
    config = { ...config, ...nextConfig };
    configured = true;
    initialize();
  }

  function cleanup() {
    if (warningTimerId != null) clearTimeoutFn(warningTimerId);
    warningTimerId = null;
    if (rafGapId != null && typeof cancelAnimationFrameFn === "function") {
      cancelAnimationFrameFn(rafGapId);
    }
    rafGapId = null;
    for (const id of intervals) clearIntervalFn(id);
    intervals.clear();
    for (const removeListener of listeners.splice(0).reverse()) safeInvoke(removeListener);
    for (const observer of observers) safeInvoke(observer.disconnect?.bind(observer));
    observers.clear();
    if (refs.enabled.current) flushSnapshot("diag-cleanup");
    try {
      delete windowTarget?.__gobbleSamsungDiagDump;
    } catch (_) {}
    try {
      delete windowTarget?.__gobbleSamsungDiagRead;
    } catch (_) {}
    active = false;
    initialized = false;
    configured = false;
    perfLogLastAt = 0;
    config = {};
    refs.enabled.current = false;
    refs.isSamsungBrowser.current = false;
    refs.safeMode.current = false;
    refs.safeModeSource.current = "off";
    refs.source.current = "off";
    refs.state.current = createDiagnosticsState();
  }

  function start() {
    active = true;
    initialize();
    scope.add(cleanup);
  }

  return Object.freeze({
    buildSnapshot,
    bumpCounter,
    configure,
    flushSnapshot,
    getNowMs,
    isActive,
    noteTouchMoveRate,
    pushEvent,
    refs,
    start,
  });
}
