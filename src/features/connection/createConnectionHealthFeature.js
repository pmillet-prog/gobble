function safeInvoke(callback, ...args) {
  try {
    const result = callback?.(...args);
    result?.catch?.(() => {});
  } catch (_) {}
}

export function createConnectionHealthFeature(
  { getKernel, scope },
  {
    clearIntervalFn = clearInterval,
    clearTimeoutFn = clearTimeout,
    documentTarget = globalThis.document,
    now = Date.now,
    setIntervalFn = setInterval,
    setTimeoutFn = setTimeout,
    windowTarget = globalThis.window,
  } = {}
) {
  const refs = Object.freeze({
    backgrounded: { current: false },
    foregroundAttemptAt: { current: 0 },
    lastBackgroundAt: { current: 0 },
    watchdogFailures: { current: 0 },
  });
  let active = false;
  let config = {};
  let foregroundRetryTimerId = null;
  let pageShowUnsubscribe = null;
  let retryIntervalId = null;
  let watchdogIntervalId = null;

  function isConnected() {
    try {
      if (typeof config.isConnected === "function") return !!config.isConnected();
      return !!config.connection?.connected;
    } catch (_) {
      return false;
    }
  }

  function getApplicationState() {
    try {
      return getKernel?.()?.getState?.() || null;
    } catch (_) {
      return null;
    }
  }

  function cancelForegroundRetry() {
    if (foregroundRetryTimerId != null) clearTimeoutFn(foregroundRetryTimerId);
    foregroundRetryTimerId = null;
  }

  function scheduleForegroundRetry(reason = "foreground_retry", delayMs = 1200) {
    cancelForegroundRetry();
    foregroundRetryTimerId = setTimeoutFn(() => {
      foregroundRetryTimerId = null;
      safeInvoke(config.onForeground, reason);
    }, Math.max(200, Number(delayMs) || 1200));
  }

  function clearRetryInterval() {
    if (retryIntervalId != null) clearIntervalFn(retryIntervalId);
    retryIntervalId = null;
  }

  function clearWatchdogInterval() {
    if (watchdogIntervalId != null) clearIntervalFn(watchdogIntervalId);
    watchdogIntervalId = null;
  }

  function reconcileIntervals() {
    if (!active) return;
    const state = getApplicationState();
    const isLoggedIn = !!state?.session?.isLoggedIn;
    const isPlaying = state?.game?.phase === "playing";
    const retryIntervalMs = Math.max(0, Number(config.retryIntervalMs) || 5500);
    const watchdogIntervalMs = Math.max(0, Number(config.watchdogIntervalMs) || 15000);

    if (isLoggedIn && retryIntervalId == null) {
      retryIntervalId = setIntervalFn(() => {
        if (documentTarget?.visibilityState !== "visible") return;
        if (isConnected()) return;
        safeInvoke(config.onForeground, "retry_timer");
      }, retryIntervalMs);
    } else if (!isLoggedIn) {
      clearRetryInterval();
    }

    const watchdogEnabled = isPlaying && !config.standaloneTrainingActive;
    if (watchdogEnabled && watchdogIntervalId == null) {
      watchdogIntervalId = setIntervalFn(
        () => safeInvoke(config.onHealthCheck, "watchdog_playing"),
        watchdogIntervalMs
      );
    } else if (!watchdogEnabled) {
      clearWatchdogInterval();
    }
  }

  function bindPageShow() {
    pageShowUnsubscribe?.();
    pageShowUnsubscribe = null;
    if (!active || typeof config.subscribePageShow !== "function") return;
    pageShowUnsubscribe = config.subscribePageShow(() => {
      refs.backgrounded.current = false;
      safeInvoke(config.onForeground, "pageshow");
      scheduleForegroundRetry("pageshow_retry", 1200);
    });
  }

  function configure(nextConfig = {}) {
    const previousSubscribePageShow = config.subscribePageShow;
    config = { ...config, ...nextConfig };
    if (previousSubscribePageShow !== config.subscribePageShow) bindPageShow();
    reconcileIntervals();
  }

  function start() {
    active = true;
    const kernel = getKernel?.();
    const onVisibility = () => {
      if (documentTarget?.visibilityState === "hidden") {
        refs.backgrounded.current = true;
        refs.lastBackgroundAt.current = now();
        return;
      }
      if (documentTarget?.visibilityState === "visible") {
        refs.backgrounded.current = false;
        safeInvoke(config.onForeground, "visibility");
        scheduleForegroundRetry("visibility_retry", 1400);
      }
    };
    const onFocus = () => safeInvoke(config.onForeground, "focus");
    const onOnline = () => safeInvoke(config.onForeground, "online");
    const onInteraction = () => {
      if (!getApplicationState()?.session?.isLoggedIn || isConnected()) return;
      safeInvoke(config.onForeground, "interaction");
    };
    const listen = (target, event, listener, options) => {
      target?.addEventListener?.(event, listener, options);
      scope.add(() => target?.removeEventListener?.(event, listener, options));
    };

    listen(windowTarget, "focus", onFocus);
    listen(windowTarget, "online", onOnline);
    listen(windowTarget, "pointerdown", onInteraction, { passive: true });
    listen(windowTarget, "touchstart", onInteraction, { passive: true });
    listen(documentTarget, "visibilitychange", onVisibility);
    if (kernel?.subscribe) scope.add(kernel.subscribe(reconcileIntervals));
    bindPageShow();
    reconcileIntervals();
    scope.add(() => {
      active = false;
      cancelForegroundRetry();
      clearRetryInterval();
      clearWatchdogInterval();
      pageShowUnsubscribe?.();
      pageShowUnsubscribe = null;
      config = {};
      refs.backgrounded.current = false;
      refs.foregroundAttemptAt.current = 0;
      refs.lastBackgroundAt.current = 0;
      refs.watchdogFailures.current = 0;
    });
  }

  return Object.freeze({
    cancelForegroundRetry,
    configure,
    refs,
    scheduleForegroundRetry,
    start,
  });
}
