export const INTER_TOURNAMENT_MIN_COOLDOWN_MS = 20_000;

export function getTournamentLobbyCooldownStatus({
  cooldownEndsAt = null,
  humanCount = 0,
  now = Date.now(),
  readyCount = 0,
  readyThreshold = 1,
} = {}) {
  const safeNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const safeEndsAt = Number(cooldownEndsAt);
  const remainingMs = Number.isFinite(safeEndsAt)
    ? Math.max(0, safeEndsAt - safeNow)
    : 0;
  const hasMultipleHumans = Math.max(0, Number(humanCount) || 0) > 1;
  const active = hasMultipleHumans && remainingMs > 0;
  const threshold = Math.max(1, Math.trunc(Number(readyThreshold) || 1));
  return {
    active,
    endsAt: active ? safeEndsAt : null,
    readyThresholdMet: Math.max(0, Number(readyCount) || 0) >= threshold,
    remainingMs: active ? remainingMs : 0,
  };
}
