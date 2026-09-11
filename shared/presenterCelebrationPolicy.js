export const TOURNAMENT_END_BREAK_KIND = "tournament_end";

export function isTournamentCelebrationActive({
  breakKind = "",
  celebrationAt = null,
  nowMs = Date.now(),
} = {}) {
  if (String(breakKind || "") !== TOURNAMENT_END_BREAK_KIND) return false;
  const gate = Number(celebrationAt);
  if (!Number.isFinite(gate) || gate <= 0) return true;
  return Number(nowMs) >= gate;
}
