const MAX_WEEK_GAP_MS = 8.5 * 24 * 60 * 60 * 1000;

function normalizePodium(entries) {
  return (Array.isArray(entries) ? entries : [])
    .slice(0, 3)
    .map((entry, index) => ({
      ...entry,
      rank: Number(entry?.rank) || index + 1,
    }));
}

export function isWeeklyRecapPodiumReady(summary, weeklyStats) {
  if (!summary || typeof summary !== "object") return false;
  if (Array.isArray(summary.weeklyVocabPodium)) return true;

  const recapWeekStart = Number(summary.weekStartTs);
  const currentStatsWeekStart = Number(weeklyStats?.weekStartTs);
  if (!Number.isFinite(recapWeekStart) || !Number.isFinite(currentStatsWeekStart)) {
    return false;
  }
  const gap = currentStatsWeekStart - recapWeekStart;
  return gap > 0 && gap <= MAX_WEEK_GAP_MS;
}

export function resolveWeeklyRecapPodium(summary, weeklyStats) {
  if (Array.isArray(summary?.weeklyVocabPodium)) {
    return normalizePodium(summary.weeklyVocabPodium);
  }
  if (!isWeeklyRecapPodiumReady(summary, weeklyStats)) return [];

  const recapWeekStart = Number(summary?.weekStartTs);
  const podium = Array.isArray(weeklyStats?.previousWeeklyVocabPodium)
    ? weeklyStats.previousWeeklyVocabPodium
    : [];
  const matchingPodium = podium.filter((entry) => {
    const entryWeekStart = Number(entry?.weekStartTs);
    return !Number.isFinite(entryWeekStart) || entryWeekStart === recapWeekStart;
  });
  if (matchingPodium.length) return normalizePodium(matchingPodium);

  const champion = weeklyStats?.previousWeeklyVocabChampion;
  const championWeekStart = Number(champion?.weekStartTs);
  if (
    champion &&
    typeof champion === "object" &&
    (!Number.isFinite(championWeekStart) || championWeekStart === recapWeekStart)
  ) {
    return normalizePodium([{ ...champion, rank: 1 }]);
  }
  return [];
}
