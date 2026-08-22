import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import {
  createMonotonicDeadline,
  getDeadlineRemainingSeconds,
  getMonotonicNowMs,
  getNextDeadlineTickDelay,
} from "../../utils/realtimeClock.js";

export function createIntermissionClockFeature({ scope }) {
  const store = createFeatureStore({
    deadlineMonotonicMs: null,
    remainingSeconds: null,
    running: false,
  });
  let timerId = null;
  let runToken = 0;

  function clearTimer() {
    if (timerId != null) clearTimeout(timerId);
    timerId = null;
  }

  function stop() {
    runToken += 1;
    clearTimer();
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
    const monotonicNowMs = getMonotonicNowMs();
    const deadlineMonotonicMs = createMonotonicDeadline({
      deadlineServerMs,
      monotonicNowMs,
      serverNowMs,
    });
    store.patch({ deadlineMonotonicMs, running: true });

    const update = () => {
      if (token !== runToken) return;
      const now = getMonotonicNowMs();
      const remainingSeconds = getDeadlineRemainingSeconds({
        deadlineMonotonicMs,
        monotonicNowMs: now,
      });
      store.set("remainingSeconds", remainingSeconds);
      if (remainingSeconds <= 0) {
        timerId = null;
        store.set("running", false);
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

  function start() {
    scope.add(stop);
  }

  return Object.freeze({ start, startCountdown, stop, store });
}
