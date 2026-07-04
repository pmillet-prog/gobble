export const LIVE_SESSION_BOOT_RESUME_MAX_AGE_MS = 45 * 1000;

export function getLiveSessionActivityAt(session) {
  const lastActiveAt = Number(session?.lastActiveAt);
  if (Number.isFinite(lastActiveAt) && lastActiveAt > 0) return lastActiveAt;
  const lastLoginAt = Number(session?.lastLoginAt);
  return Number.isFinite(lastLoginAt) && lastLoginAt > 0 ? lastLoginAt : null;
}

export function isLiveSessionFreshForBoot(
  session,
  now = Date.now(),
  maxAgeMs = LIVE_SESSION_BOOT_RESUME_MAX_AGE_MS
) {
  const activityAt = getLiveSessionActivityAt(session);
  if (!Number.isFinite(activityAt)) return false;
  const ageMs = Math.max(0, Number(now) - activityAt);
  return ageMs <= Math.max(0, Number(maxAgeMs) || 0);
}
