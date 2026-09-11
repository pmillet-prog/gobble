import { normalizeWord } from "../../../shared/gameLogic.js";

const nonNegativeCount = (value) => Number.isFinite(value) ? Math.max(0, value) : null;
const difference = (after, before) =>
  Number.isFinite(after) && Number.isFinite(before) ? Math.max(0, after - before) : null;

export function resolveVocabRoundProgress({
  result,
  count,
  weeklyCount,
  baseline,
  weeklyBaseline,
  delta,
  weeklyDelta,
} = {}) {
  const hasNewWords = Array.isArray(result?.newVocabWords);
  const newWords = hasNewWords
    ? Array.from(new Set(result.newVocabWords
        .map((word) => normalizeWord(String(word || "").trim()))
        .filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    : [];
  const roundDelta = hasNewWords
    ? newWords.length
    : nonNegativeCount(delta) ?? difference(count, baseline);
  const serverBefore = nonNegativeCount(result?.vocabWeeklyRace?.beforeCount);
  const serverAfter = nonNegativeCount(result?.vocabWeeklyRace?.afterCount);
  const resolvedWeeklyCount = serverAfter ?? nonNegativeCount(weeklyCount);
  const resolvedWeeklyBaseline = serverBefore ?? nonNegativeCount(weeklyBaseline);
  const roundWeeklyDelta = difference(serverAfter, serverBefore)
    ?? nonNegativeCount(weeklyDelta)
    ?? difference(resolvedWeeklyCount, resolvedWeeklyBaseline);

  return {
    newWords,
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
