export const COUNTDOWN_BOUNDARY_EPSILON_MS = 12;

export function getMonotonicNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function createServerClockState({
  monotonicNowMs = getMonotonicNowMs(),
  serverNowMs = Date.now(),
  synchronized = false,
} = {}) {
  const monotonicAnchor = Number(monotonicNowMs);
  const serverAnchor = Number(serverNowMs);
  return {
    monotonicNowMs: Number.isFinite(monotonicAnchor) ? monotonicAnchor : 0,
    serverNowMs: Number.isFinite(serverAnchor) ? serverAnchor : Date.now(),
    synchronized: !!synchronized,
  };
}

export function readServerClockMs(clock, monotonicNowMs = getMonotonicNowMs()) {
  const anchorMonotonicMs = Number(clock?.monotonicNowMs);
  const anchorServerMs = Number(clock?.serverNowMs);
  const now = Number(monotonicNowMs);
  if (
    !Number.isFinite(anchorMonotonicMs) ||
    !Number.isFinite(anchorServerMs) ||
    !Number.isFinite(now)
  ) {
    return Date.now();
  }
  return anchorServerMs + (now - anchorMonotonicMs);
}

export function updateServerClockFromSample(
  clock,
  {
    force = false,
    maxSlewMs = 80,
    monotonicNowMs = getMonotonicNowMs(),
    sampledServerNowMs,
    smoothing = 0.25,
    snapThresholdMs = 1500,
  } = {}
) {
  const sampled = Number(sampledServerNowMs);
  const now = Number(monotonicNowMs);
  if (!Number.isFinite(sampled) || !Number.isFinite(now)) return clock;

  const predicted = readServerClockMs(clock, now);
  const errorMs = sampled - predicted;
  const shouldSnap = force || !clock?.synchronized || Math.abs(errorMs) >= snapThresholdMs;
  const correctionMs = shouldSnap
    ? errorMs
    : Math.max(
        -Math.max(0, Number(maxSlewMs) || 0),
        Math.min(
          Math.max(0, Number(maxSlewMs) || 0),
          errorMs * Math.max(0, Math.min(1, Number(smoothing) || 0))
        )
      );

  return createServerClockState({
    monotonicNowMs: now,
    serverNowMs: predicted + correctionMs,
    synchronized: true,
  });
}

export function createMonotonicDeadline({
  deadlineServerMs,
  monotonicNowMs = getMonotonicNowMs(),
  serverNowMs,
} = {}) {
  const deadline = Number(deadlineServerMs);
  const serverNow = Number(serverNowMs);
  const monotonicNow = Number(monotonicNowMs);
  if (
    !Number.isFinite(deadline) ||
    !Number.isFinite(serverNow) ||
    !Number.isFinite(monotonicNow)
  ) {
    return null;
  }
  return monotonicNow + (deadline - serverNow);
}

export function getDeadlineRemainingSeconds({
  deadlineMonotonicMs,
  maxSeconds = Number.POSITIVE_INFINITY,
  monotonicNowMs = getMonotonicNowMs(),
} = {}) {
  if (deadlineMonotonicMs == null) return 0;
  const deadline = Number(deadlineMonotonicMs);
  const now = Number(monotonicNowMs);
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return 0;
  const rawSeconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const cap = Number(maxSeconds);
  return Number.isFinite(cap) ? Math.min(Math.max(0, Math.trunc(cap)), rawSeconds) : rawSeconds;
}

export function getDelayUntilDeadlineWindow({
  deadlineMonotonicMs,
  monotonicNowMs = getMonotonicNowMs(),
  windowMs = 0,
} = {}) {
  if (deadlineMonotonicMs == null) return 0;
  const deadline = Number(deadlineMonotonicMs);
  const now = Number(monotonicNowMs);
  const windowDuration = Math.max(0, Number(windowMs) || 0);
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return 0;
  const delayMs = deadline - now - windowDuration;
  if (delayMs <= 0) return 0;
  return Math.max(16, Math.ceil(delayMs) + COUNTDOWN_BOUNDARY_EPSILON_MS);
}

export function getNextDeadlineTickDelay({
  deadlineMonotonicMs,
  displayedSeconds,
  monotonicNowMs = getMonotonicNowMs(),
} = {}) {
  if (deadlineMonotonicMs == null) return 0;
  const deadline = Number(deadlineMonotonicMs);
  const now = Number(monotonicNowMs);
  const seconds = Math.max(0, Math.trunc(Number(displayedSeconds) || 0));
  if (!Number.isFinite(deadline) || !Number.isFinite(now) || seconds <= 0) return 0;
  const remainingMs = Math.max(0, deadline - now);
  const boundaryMs = Math.max(0, remainingMs - Math.max(0, seconds - 1) * 1000);
  return Math.max(16, Math.ceil(boundaryMs) + COUNTDOWN_BOUNDARY_EPSILON_MS);
}
