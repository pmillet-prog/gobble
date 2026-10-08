// Same historic sum used by the profile fallback, computed only on stats reads.
export function buildAllTimeGobbleCandidates(weeks, topN = 50) {
  const totals = new Map();
  for (const week of weeks) {
    for (const [key, entry] of week?.mostGobbles || []) {
      const match = /^install:([1-9]\d*)$/.exec(key);
      const userId = match ? Number(match[1]) : 0;
      const gobbles = Number(entry?.gobbles);
      if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(gobbles) || gobbles <= 0) continue;
      totals.set(userId, (totals.get(userId) || 0) + gobbles);
    }
  }
  return [...totals].map(([userId, gobbles]) => ({ userId, gobbles }))
    .sort((a, b) => b.gobbles - a.gobbles || a.userId - b.userId)
    .slice(0, Math.min(200, Math.max(1, Math.round(Number(topN) || 50))));
}
