// An unacknowledged response can be recovered briefly, but never grants a new clock.
export const DAILY_LAUNCH_RECOVERY_MS = 30_000;

export function normalizeDailyLaunchId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{16,80}$/.test(value) ? value : null;
}

export function canRecoverDailyLaunch(attempt, now = Date.now()) {
  return !!attempt?.launchId && !attempt.confirmedAt &&
    now >= attempt.startedAt && now < attempt.startedAt + DAILY_LAUNCH_RECOVERY_MS;
}
