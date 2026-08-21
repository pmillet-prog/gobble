export function formatWeeklyDate(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return "";
  }
}

export function formatWeeklyDayTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("fr-FR", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return "";
  }
}

export function formatMsShort(ms) {
  if (!Number.isFinite(ms)) return "";
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(2)}s`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}m${secs.toString().padStart(2, "0")}s`;
}

export function getWeeklyEntryKey(entry) {
  if (!entry) return "";
  if (entry.playerKey) return entry.playerKey;
  if (entry.nick) return `nick:${String(entry.nick).trim().toLowerCase()}`;
  return "";
}

export function getWeeklyMetricValue(boardKey, entry) {
  if (!entry) return null;
  if (boardKey === "medals") return Number(entry.total) || 0;
  if (boardKey === "mostWordsInGame") return Number(entry.wordsCount) || 0;
  if (boardKey === "totalScore") return Number(entry.totalScore) || 0;
  if (boardKey === "bestWord") return Number(entry.pts) || 0;
  if (boardKey === "longestWord") return Number(entry.len) || 0;
  if (boardKey === "bestSpecial3Score") return Number(entry.pts) || 0;
  if (boardKey === "bestRoundScore") return Number(entry.pts) || 0;
  if (boardKey === "vocab") return Number(entry.vocabCount) || 0;
  if (boardKey === "weeklyVocab") {
    return Number(entry.weeklyVocabCount ?? entry.vocabCount) || 0;
  }
  if (boardKey === "bestTimeTargetLong" || boardKey === "bestTimeTargetScore") {
    return Number.isFinite(Number(entry.ms)) ? Number(entry.ms) : null;
  }
  if (boardKey === "mostGobbles") return Number(entry.gobbles) || 0;
  return null;
}

export function hasWeeklyChanges(
  boardKey,
  currentEntries,
  baselineRankMap,
  baselineValueMap
) {
  if (!baselineRankMap || baselineRankMap.size === 0) return false;
  const isTimeBoard =
    boardKey === "bestTimeTargetLong" || boardKey === "bestTimeTargetScore";
  for (let i = 0; i < currentEntries.length; i += 1) {
    const entry = currentEntries[i];
    const entryKey = getWeeklyEntryKey(entry);
    if (!entryKey) continue;
    const prevRank = baselineRankMap.get(entryKey);
    if (Number.isFinite(prevRank) && prevRank !== i + 1) return true;
    const currentValue = getWeeklyMetricValue(boardKey, entry);
    const baseValue = baselineValueMap?.get(entryKey);
    if (Number.isFinite(currentValue) && Number.isFinite(baseValue)) {
      if (isTimeBoard && currentValue < baseValue) return true;
      if (!isTimeBoard && currentValue > baseValue) return true;
    }
  }
  return false;
}
