import { INFORTUNE_LEADER_WINDOW_MS } from './infortuneLeaders.js';

// The wheel runs locally; these windows belong to the shared room clock.
export const INFORTUNE_LAUNCH_WINDOW_MS = 10_000;
export const INFORTUNE_WINDOW_MS = 40_000;
export const INFORTUNE_RESULTS_READING_MS = 20_000;
export const INFORTUNE_OUTRO_MS = 6_000;
export const INFORTUNE_EXCHANGE_REPLAY_MS = 10_100;

export function scheduleInfortuneAfterResults(policy, resultsReadyAt, roundEndedAt = resultsReadyAt, outroMs = INFORTUNE_OUTRO_MS) {
  if (!policy?.enabled) return policy;
  return { ...policy, afterResults: true, resultsReadyAt, resultsVisibleAt: Math.max(resultsReadyAt, roundEndedAt + outroMs),
    openedAt: Math.max(resultsReadyAt, roundEndedAt + outroMs) + INFORTUNE_RESULTS_READING_MS };
}

export function infortuneRoundPolicy({ enabled, training, round, totalRounds }) {
  if (!enabled || training || !Number.isInteger(round) || round < 1 || round >= totalRounds) return null;
  return { enabled: true, roundNumber: round, exchangeEnabled: round === 4, banksHidden: round >= 4,
    launchWindowMs: INFORTUNE_LAUNCH_WINDOW_MS, windowMs: round === 4 ? 50_000 : INFORTUNE_WINDOW_MS };
}

export function infortuneBreakDuration(baseMs, policy, closedAt, now) {
  if (!policy?.enabled) return baseMs;
  return Math.max(0, closedAt + policy.windowMs + (policy.exchangeEnabled ? INFORTUNE_EXCHANGE_REPLAY_MS : 0)
    + (policy.roundNumber === 4 ? 0 : INFORTUNE_LEADER_WINDOW_MS) - now);
}
