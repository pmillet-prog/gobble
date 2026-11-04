// The wheel runs locally; these windows belong to the shared room clock.
export const INFORTUNE_LAUNCH_WINDOW_MS = 20_000;
export const INFORTUNE_WINDOW_MS = 55_000;
export const INFORTUNE_RESULTS_READING_MS = 15_000;

export function infortuneRoundPolicy({ enabled, training, round, totalRounds }) {
  if (!enabled || training || !Number.isInteger(round) || round < 1 || round >= totalRounds) return null;
  return { enabled: true, roundNumber: round, exchangeEnabled: round === 4, banksHidden: round >= 4,
    launchWindowMs: INFORTUNE_LAUNCH_WINDOW_MS, windowMs: round === 4 ? 75_000 : INFORTUNE_WINDOW_MS };
}

export function infortuneBreakDuration(baseMs, policy, closedAt, now) {
  if (!policy?.enabled) return baseMs;
  return Math.max(baseMs, closedAt + policy.windowMs + INFORTUNE_RESULTS_READING_MS - now);
}
