import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import {
  createMonotonicDeadline,
  getDeadlineRemainingSeconds,
  getMonotonicNowMs,
  getNextDeadlineTickDelay,
} from "../../utils/realtimeClock.js";

export function createRoundClockFeature({ scope }) {
  const store = createFeatureStore({
    deadlineMonotonicMs: null,
    maxSeconds: 0,
    remainingSeconds: 0,
    running: false,
  });
  const expirationListeners = new Set();
  let timerId = null;
  let runToken = 0;

  function clearTimer() {
    if (timerId != null) clearTimeout(timerId);
    timerId = null;
  }

  function stop({ preserveRemaining = false, remainingSeconds = 0 } = {}) {
    runToken += 1;
    clearTimer();
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
    const monotonicNowMs = getMonotonicNowMs();
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
      const now = getMonotonicNowMs();
      const remainingSeconds = getDeadlineRemainingSeconds({
        deadlineMonotonicMs,
        maxSeconds: safeMaxSeconds,
        monotonicNowMs: now,
      });
      store.set("remainingSeconds", remainingSeconds);
      if (remainingSeconds <= 0) {
        timerId = null;
        store.set("running", false);
        for (const listener of [...expirationListeners]) listener();
        return;
      }
      timerId = setTimeout(
        update,
        getNextDeadlineTickDelay({
          deadlineMonotonicMs,
          displayedSeconds: remainingSeconds,
          monotonicNowMs: now,
        })
      );
    };
    update();
  }

  function setCountdown(seconds) {
    stop({ remainingSeconds: Math.max(0, Math.round(Number(seconds) || 0)) });
  }

  function onExpired(listener) {
    if (typeof listener !== "function") return () => {};
    expirationListeners.add(listener);
    return () => expirationListeners.delete(listener);
  }

  function startFeature() {
    scope.add(() => {
      stop();
      expirationListeners.clear();
    });
  }

  return Object.freeze({
    onExpired,
    setCountdown,
    start: startFeature,
    startRound: start,
    stop,
    store,
  });
}
