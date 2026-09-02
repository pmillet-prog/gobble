import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import {
  createMonotonicDeadline,
  getDeadlineRemainingSeconds,
  getMonotonicNowMs,
  getNextDeadlineTickDelay,
  subscribeForegroundClockRefresh,
} from "../../utils/realtimeClock.js";

export function createRoundClockFeature(
  { scope },
  {
    clearTimeoutFn = clearTimeout,
    documentTarget = globalThis.document,
    getNowMs = getMonotonicNowMs,
    setTimeoutFn = setTimeout,
    windowTarget = globalThis.window,
  } = {}
) {
  const store = createFeatureStore({
    deadlineMonotonicMs: null,
    maxSeconds: 0,
    remainingSeconds: 0,
    running: false,
  });
  const expirationListeners = new Set();
  let activeUpdate = null;
  let timerId = null;
  let runToken = 0;

  function clearTimer() {
    if (timerId != null) clearTimeoutFn(timerId);
    timerId = null;
  }

  function stop({ preserveRemaining = false, remainingSeconds = 0 } = {}) {
    runToken += 1;
    clearTimer();
    activeUpdate = null;
    const currentRemaining = store.getState().remainingSeconds;
    store.patch({
      deadlineMonotonicMs: null,
      remainingSeconds: preserveRemaining ? currentRemaining : remainingSeconds,
      running: false,
    });
  }

  function start({ deadlineServerMs, maxSeconds, serverNowMs }) {
    runToken += 1;
    const token = runToken;
    clearTimer();
    const safeMaxSeconds = Math.max(1, Math.round(Number(maxSeconds) || 1));
    const monotonicNowMs = getNowMs();
    const deadlineMonotonicMs = createMonotonicDeadline({
      deadlineServerMs,
      monotonicNowMs,
      serverNowMs,
    });
    store.patch({
      deadlineMonotonicMs,
      maxSeconds: safeMaxSeconds,
      remainingSeconds: safeMaxSeconds,
      running: true,
    });

    const update = () => {
      if (token !== runToken) return;
      clearTimer();
      const now = getNowMs();
      const remainingSeconds = getDeadlineRemainingSeconds({
        deadlineMonotonicMs,
        maxSeconds: safeMaxSeconds,
        monotonicNowMs: now,
      });
      store.set("remainingSeconds", remainingSeconds);
      if (remainingSeconds <= 0) {
        activeUpdate = null;
        store.set("running", false);
        for (const listener of [...expirationListeners]) listener();
        return;
      }
      timerId = setTimeoutFn(
        update,
        getNextDeadlineTickDelay({
          deadlineMonotonicMs,
          displayedSeconds: remainingSeconds,
          monotonicNowMs: now,
        })
      );
    };
    activeUpdate = update;
    update();
  }

  function setCountdown(seconds) {
    stop({ remainingSeconds: Math.max(0, Math.round(Number(seconds) || 0)) });
  }

  function primeRemaining(seconds) {
    store.set(
      "remainingSeconds",
      Math.max(0, Math.round(Number(seconds) || 0))
    );
  }

  function onExpired(listener) {
    if (typeof listener !== "function") return () => {};
    expirationListeners.add(listener);
    return () => expirationListeners.delete(listener);
  }

  function startFeature() {
    scope.add(
      subscribeForegroundClockRefresh(
        () => activeUpdate?.(),
        { documentTarget, windowTarget }
      )
    );
    scope.add(() => {
      stop();
      expirationListeners.clear();
    });
  }

  return Object.freeze({
    onExpired,
    primeRemaining,
    setCountdown,
    start: startFeature,
    startRound: start,
    stop,
    store,
  });
}
