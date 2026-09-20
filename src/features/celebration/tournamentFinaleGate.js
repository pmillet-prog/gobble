// Server timestamps survive tab changes and reconnects. Older payloads get one
// local deadline per final round, never a fresh delay on every snapshot.
export function resolveTournamentFinaleGate(previous, { key, summaryAt, now, delayMs }) {
  if (Number.isFinite(summaryAt) && summaryAt > 0) return { key, at: summaryAt };
  if (previous?.key === key) return previous;
  return { key, at: now + delayMs };
}
