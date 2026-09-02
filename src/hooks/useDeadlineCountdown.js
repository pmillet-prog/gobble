import React from "react";

import {
  createMonotonicDeadline,
  getDeadlineRemainingSeconds,
  getMonotonicNowMs,
  getNextDeadlineTickDelay,
  subscribeForegroundClockRefresh,
} from "../utils/realtimeClock.js";

export default function useDeadlineCountdown({
  active = false,
  deadlineServerMs = null,
  maxSeconds = Number.POSITIVE_INFINITY,
  serverNowMs = null,
} = {}) {
  const serverNowRef = React.useRef(serverNowMs);
  serverNowRef.current = serverNowMs;
  const [remainingSeconds, setRemainingSeconds] = React.useState(0);

  React.useLayoutEffect(() => {
    if (!active || !Number.isFinite(Number(deadlineServerMs))) {
      setRemainingSeconds(0);
      return undefined;
    }

    const monotonicNowMs = getMonotonicNowMs();
    const initialServerNowMs = Number(serverNowRef.current);
    const deadlineMonotonicMs = createMonotonicDeadline({
      deadlineServerMs,
      monotonicNowMs,
      serverNowMs: Number.isFinite(initialServerNowMs) ? initialServerNowMs : Date.now(),
    });
    if (!Number.isFinite(deadlineMonotonicMs)) {
      setRemainingSeconds(0);
      return undefined;
    }

    let cancelled = false;
    let timerId = null;
    const update = () => {
      if (cancelled) return;
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
      const now = getMonotonicNowMs();
      const nextSeconds = getDeadlineRemainingSeconds({
        deadlineMonotonicMs,
        maxSeconds,
        monotonicNowMs: now,
      });
      setRemainingSeconds((current) => (current === nextSeconds ? current : nextSeconds));
      if (nextSeconds <= 0) return;
      timerId = window.setTimeout(
        update,
        getNextDeadlineTickDelay({
          deadlineMonotonicMs,
          displayedSeconds: nextSeconds,
          monotonicNowMs: now,
        })
      );
    };
    update();
    const unsubscribeForegroundRefresh =
      subscribeForegroundClockRefresh(update);

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      unsubscribeForegroundRefresh();
    };
  }, [active, deadlineServerMs, maxSeconds]);

  return remainingSeconds;
}
