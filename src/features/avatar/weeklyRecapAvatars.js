import { resolveWeeklyRecapPodium } from "../../utils/weeklyRecap.js";

export function recapAvatarUserId(entry) {
  if (entry?.isBot) return null;
  const raw = entry?.userId ?? entry?.installId ?? String(entry?.playerKey || "").replace(/^install:/, "");
  const text = String(raw ?? "");
  const id = Number(text);
  return /^[1-9]\d*$/.test(text) && Number.isSafeInteger(id) ? id : null;
}

export function collectRecapAvatarIds(summary, weeklyStats, viewerUserId) {
  const top = (entries, count) => Array.isArray(entries) ? entries.slice(0, count) : [];
  const entries = [
    ...top(summary?.contributorsByTeam?.red, 5), ...top(summary?.contributorsByTeam?.blue, 5),
    ...top(summary?.weeklyRecords?.medals, 3), ...top(summary?.weeklyRecords?.mostWordsInGame, 3),
    ...top(summary?.weeklyRecords?.totalScore, 3), ...resolveWeeklyRecapPodium(summary, weeklyStats),
  ];
  return [...new Set(entries.filter(entry => !entry?.avatar).map(recapAvatarUserId))]
    .filter(id => id && id !== Number(viewerUserId)).sort((a, b) => a - b);
}
