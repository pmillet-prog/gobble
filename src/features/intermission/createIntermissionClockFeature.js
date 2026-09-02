import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import {
  createMonotonicDeadline,
  getDeadlineRemainingSeconds,
  getMonotonicNowMs,
  getNextDeadlineTickDelay,
  subscribeForegroundClockRefresh,
} from "../../utils/realtimeClock.js";

export function createIntermissionClockFeature(
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
    remainingSeconds: null,
    running: false,
  });
  let activeUpdate = null;
  let timerId = null;
  let runToken = 0;

  function clearTimer() {
    if (timerId != null) clearTimeoutFn(timerId);
    timerId = null;
  }

  function stop() {
    runToken += 1;
    clearTimer();
    activeUpdate = null;
    store.patch({
      deadlineMonotonicMs: null,
      remainingSeconds: null,
      running: false,
    });
  }

  function startCountdown({ deadlineServerMs, serverNowMs }) {
    if (!Number.isFinite(deadlineServerMs)) {
      stop();
      return;
    }
    runToken += 1;
    const token = runToken;
    clearTimer();
    const monotonicNowMs = getNowMs();
    const deadlineMonotonicMs = createMonotonicDeadline({
      deadlineServerMs,
      monotonicNowMs,
      serverNowMs,
    });
    store.patch({ deadlineMonotonicMs, running: true });

    const update = () => {
      if (token !== runToken) return;
      clearTimer();
      const now = getNowMs();
      const remainingSeconds = getDeadlineRemainingSeconds({
        deadlineMonotonicMs,
        monotonicNowMs: now,
      });
      store.set("remainingSeconds", remainingSeconds);
      if (remainingSeconds <= 0) {
        activeUpdate = null;
        store.set("running", false);
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

  function start() {
    scope.add(
      subscribeForegroundClockRefresh(
        () => activeUpdate?.(),
        { documentTarget, windowTarget }
      )
    );
    scope.add(stop);
  }

  return Object.freeze({ start, startCountdown, stop, store });
}
