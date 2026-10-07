export const WEEKLY_TOP3_ROUND_TYPES = Object.freeze([
  "normal",
  "speed",
  "monstrous",
  "self_specials_3_words",
  "fake_twins",
  "target_long",
  "target_score",
  "ocid",
  "bonus_letter",
  "massive_boggle",
  "finale",
]);

export function createWeeklyTop3Maps(source = {}) {
  return Object.fromEntries(WEEKLY_TOP3_ROUND_TYPES.map((type) => {
    const entries = Object.entries(source?.[type] || {}).flatMap(([playerKey, entry]) => {
      const roundsPlayed = Number(entry?.roundsPlayed);
      const top3Count = Number(entry?.top3Count);
      if (!playerKey || !entry?.nick || !Number.isInteger(roundsPlayed) || roundsPlayed <= 0
        || !Number.isInteger(top3Count) || top3Count < 0 || top3Count > roundsPlayed) return [];
      return [[playerKey, {
        playerKey,
        nick: entry.nick,
        roundsPlayed,
        top3Count,
        achievedAt: Number(entry.achievedAt) || 0,
      }]];
    });
    return [type, new Map(entries)];
  }));
}

// Results are the final, ordered round results, including presenters. Keep the
// same competition ranks as tournament points; target rounds use arrival order.
export function getRoundTop3Outcomes(roundType, results) {
  const isTarget = roundType === "target_long" || roundType === "target_score";
  const seenPlayers = new Set();
  const outcomes = [];
  let previousTieKey = null;
  let rank = 0;
  for (const [index, entry] of (Array.isArray(results) ? results : []).entries()) {
    const score = Number(entry?.score);
    const targetTime = Number.isFinite(entry?.targetFoundAt) ? entry.targetFoundAt : null;
    const tieKey = roundType === "ocid" ? `${score}:${targetTime ?? "no-target"}` : score;
    if (isTarget || index === 0 || tieKey !== previousTieKey) rank = index + 1;
    previousTieKey = tieKey;
    if (entry?.isBot || !entry?.playerKey || !entry?.nick || !Number.isFinite(score) || score <= 0
      || seenPlayers.has(entry.playerKey)) continue;
    seenPlayers.add(entry.playerKey);
    outcomes.push({ playerKey: entry.playerKey, nick: entry.nick, isTop3: rank <= 3 });
  }
  return outcomes;
}

export function buildWeeklyTop3Boards(maps, topN) {
  return Object.fromEntries(WEEKLY_TOP3_ROUND_TYPES.map((type) => [type,
    Array.from(maps[type].values())
      .sort((a, b) => {
        // Compare the fractions before any display rounding.
        const ratioDiff = b.top3Count * a.roundsPlayed - a.top3Count * b.roundsPlayed;
        return ratioDiff || b.top3Count - a.top3Count || b.roundsPlayed - a.roundsPlayed
          || a.achievedAt - b.achievedAt || a.playerKey.localeCompare(b.playerKey);
      })
      .slice(0, topN)
      .map((entry) => ({ ...entry, percentage: entry.top3Count / entry.roundsPlayed * 100 })),
  ]));
}
