const MAX_RECORDS = { bestWord: "pts", longestWord: "len", bestRoundScore: "pts", bestSpecial3Score: "pts", mostWordsInGame: "wordsCount" };
const MIN_RECORDS = { bestTimeTargetLong: "ms", bestTimeTargetScore: "ms" };

export function mergeAbsoluteRecords(...sources) {
  const out = {};
  for (const source of sources) {
    for (const [key, field] of Object.entries({ ...MAX_RECORDS, ...MIN_RECORDS })) {
      const value = source?.[key];
      if (value?.[field] == null || !Number.isFinite(Number(value[field])) || Number(value[field]) < 0) continue;
      if (!out[key] || (key in MIN_RECORDS ? Number(value[field]) < Number(out[key][field]) : Number(value[field]) > Number(out[key][field]))) out[key] = value;
    }
  }
  return out;
}

export const LIFETIME_COUNTERS = ["roundsPlayed", "totalScore", "wordsFound", "gobbles", "doubleGobbles", "targetRoundsPlayed", "targetRoundsFound", "special3RoundsPlayed"];
export const LIFETIME_RECORDS = { bestRoundScore: "bestRoundId", bestWordsInRound: "bestWordsInRoundId", bestWordScore: "bestWord", longestWordLength: "longestWord", bestSpecial3Score: null };

export function mergeLifetimeStats(target = {}, source = {}, records = {}) {
  const out = { ...target };
  for (const key of LIFETIME_COUNTERS) out[key] = (Number(target[key]) || 0) + (Number(source[key]) || 0);
  for (const [key, detail] of Object.entries(LIFETIME_RECORDS)) {
    out[key] = Number(target[key]) || 0;
    if ((Number(source[key]) || 0) > out[key]) {
      out[key] = source[key];
      if (detail) out[detail] = source[detail];
    }
  }
  const fromWeekly = {
    bestRoundScore: records.bestRoundScore?.pts, bestRoundId: records.bestRoundScore?.roundId,
    bestWordScore: records.bestWord?.pts, bestWord: records.bestWord?.word,
    longestWordLength: records.longestWord?.len, longestWord: records.longestWord?.word,
    bestWordsInRound: records.mostWordsInGame?.wordsCount, bestWordsInRoundId: records.mostWordsInGame?.roundId,
    bestSpecial3Score: records.bestSpecial3Score?.pts,
  };
  for (const [key, detail] of Object.entries(LIFETIME_RECORDS)) if ((Number(fromWeekly[key]) || 0) > out[key]) {
    out[key] = fromWeekly[key];
    if (detail) out[detail] = fromWeekly[detail] || null;
  }
  out.createdAt = Math.min(...[target.createdAt, source.createdAt, Date.now()].filter(value => Number(value) > 0));
  return out;
}
