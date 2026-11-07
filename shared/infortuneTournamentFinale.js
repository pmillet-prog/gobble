export const INFORTUNE_FINALE_INTRO_MS = 4000;
export const INFORTUNE_FINALE_DURATION_MS = 120_000;
export const INFORTUNE_FINALE_VICTORY_POINTS = 10;
export const INFORTUNE_FINAL_RANKING_MS = 15_000;

// Keep the tournament's existing tie breakers after adding the wheel bonus.
export function rankInfortuneFinale(entries, outcomes = new Map()) {
  const ranking = entries.map(entry => {
    const outcome = outcomes.get(entry.nick);
    const wheelPoints = outcome?.correct ? INFORTUNE_FINALE_VICTORY_POINTS : 0;
    return { ...entry, points: entry.points + wheelPoints,
      basePoints: entry.basePoints + wheelPoints, wheelPoints,
      wheelStatus: outcome ? outcome.correct ? "won" : "finished" : entry.isBot ? null : "playing" };
  }).sort((a, b) => b.points - a.points || b.gobbles - a.gobbles
    || b.roundScoreSum - a.roundScoreSum || a.nick.localeCompare(b.nick));
  const groups = new Map();
  for (const entry of ranking) {
    const key = `${entry.points}|${entry.gobbles}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return ranking.map((entry, index) => {
    const group = groups.get(`${entry.points}|${entry.gobbles}`);
    return { ...entry, pos: index + 1, delta: (entry.pos || index + 1) - index - 1,
      tieGroupSize: group.length > 1 ? group.length : 0,
      tieBreakBy: group.length < 2 ? null : new Set(group.map(row => row.roundScoreSum)).size > 1 ? "round_score_sum" : "alphabetical",
      tieBreakRoundScore: entry.roundScoreSum };
  });
}
