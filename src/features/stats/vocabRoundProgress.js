import { normalizeWord } from "../../../shared/gameLogic.js";

const nonNegativeCount = (value) => Number.isFinite(value) ? Math.max(0, value) : null;
const difference = (after, before) =>
  Number.isFinite(after) && Number.isFinite(before) ? Math.max(0, after - before) : null;
const orderedUniqueWords = words => Array.from(new Set(words
  .map(word => normalizeWord(String(word || "").trim())).filter(Boolean)))
  .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));

export function resolveVocabRoundProgress({
  result,
  count,
  weeklyCount,
  baseline,
  weeklyBaseline,
  delta,
  weeklyDelta,
} = {}) {
  if (result?.vocabProgress?.status === "unavailable") {
    return { available: false, newWords: [], newWeeklyWords: [], count: null, delta: null, weeklyDelta: null, weeklyCount: null, weeklyBaseline: null };
  }
  const serverCount = nonNegativeCount(result?.vocabProgress?.afterCount);
  const serverBaseline = nonNegativeCount(result?.vocabProgress?.beforeCount);
  const resolvedCount = serverCount ?? nonNegativeCount(count);
  const hasNewWords = Array.isArray(result?.newVocabWords);
  const newWords = hasNewWords ? orderedUniqueWords(result.newVocabWords) : [];
  const hasNewWeeklyWords = Array.isArray(result?.newWeeklyVocabWords);
  const newWeeklyWords = hasNewWeeklyWords ? orderedUniqueWords(result.newWeeklyVocabWords) : [];
  const roundDelta = hasNewWords
    ? newWords.length
    : difference(serverCount, serverBaseline) ?? nonNegativeCount(delta) ?? difference(resolvedCount, baseline);
  const serverBefore = nonNegativeCount(result?.vocabWeeklyRace?.beforeCount);
  const serverAfter = nonNegativeCount(result?.vocabWeeklyRace?.afterCount);
  const resolvedWeeklyCount = serverAfter ?? nonNegativeCount(weeklyCount);
  const resolvedWeeklyBaseline = serverBefore ?? nonNegativeCount(weeklyBaseline);
  const roundWeeklyDelta = hasNewWeeklyWords ? newWeeklyWords.length : difference(serverAfter, serverBefore)
    ?? nonNegativeCount(weeklyDelta)
    ?? difference(resolvedWeeklyCount, resolvedWeeklyBaseline);

  return {
    available: true,
    newWords,
    newWeeklyWords,
    count: resolvedCount,
    delta: roundDelta,
    weeklyDelta: roundWeeklyDelta,
    weeklyCount: resolvedWeeklyCount,
    weeklyBaseline: resolvedWeeklyBaseline,
  };
}

export function getVocabProgressWord(words, countedNewWords) {
  if (!Array.isArray(words) || !words.length) return "";
  const index = Math.max(0, Math.min(Math.floor(countedNewWords) - 1, words.length - 1));
  return words[index] || "";
}
