const percentageFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function formatWeeklyTop3Percentage(percentage) {
  return `${percentageFormatter.format(Number.isFinite(percentage) ? percentage : 0)} %`;
}

export function getWeeklyTop3Entries(entries, limit = 50) {
  if (!Array.isArray(entries)) return [];
  const byPlayer = new Map();
  for (const entry of entries) {
    const roundsPlayed = Number(entry?.roundsPlayed);
    const top3Count = Number(entry?.top3Count);
    const key = entry?.playerKey || String(entry?.nick || "").trim().toLowerCase();
    if (!key || !Number.isInteger(roundsPlayed) || roundsPlayed <= 0 ||
        !Number.isInteger(top3Count) || top3Count < 0 || top3Count > roundsPlayed) continue;
    const current = byPlayer.get(key);
    // Ratios can decrease: the most recent cumulative record wins over an older peak.
    if (current && (Number(current.achievedAt || 0) > Number(entry.achievedAt || 0) ||
        (Number(current.achievedAt || 0) === Number(entry.achievedAt || 0) &&
         current.roundsPlayed >= roundsPlayed))) continue;
    byPlayer.set(key, { ...entry, roundsPlayed, top3Count, percentage: 100 * top3Count / roundsPlayed });
  }
  return [...byPlayer.values()].sort((a, b) =>
    b.top3Count * a.roundsPlayed - a.top3Count * b.roundsPlayed ||
    b.top3Count - a.top3Count ||
    b.roundsPlayed - a.roundsPlayed ||
    (Number(a.achievedAt) || Infinity) - (Number(b.achievedAt) || Infinity) ||
    String(a.playerKey || a.nick || "").localeCompare(String(b.playerKey || b.nick || ""))
  ).slice(0, limit);
}
