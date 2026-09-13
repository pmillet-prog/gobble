import { normalizeWord } from "../../../shared/gameLogic.js";

const uniqueWords = words => Array.from(new Set((Array.isArray(words) ? words : [])
  .filter(word => typeof word === "string").map(normalizeWord).filter(Boolean)));

export function createVocabWordSequence(words, seasonWords = []) {
  const orderedWords = uniqueWords(words)
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  const seasonSet = new Set(uniqueWords(seasonWords));
  let displayed = 0;
  let seasonDisplayed = 0;
  let lastDisplayAt = -Infinity;
  return {
    length: orderedWords.length,
    seasonLength: orderedWords.filter(word => seasonSet.has(word)).length,
    advance(progress, now) {
      const due = Math.round(orderedWords.length * Math.max(0, Math.min(1, progress)));
      // A delayed frame must never skip words or emit several verdicts at once.
      const changed = displayed < due && now - lastDisplayAt >= 80;
      if (changed) {
        displayed += 1;
        if (seasonSet.has(orderedWords[displayed - 1])) seasonDisplayed += 1;
        lastDisplayAt = now;
      }
      return {
        changed, displayed, word: orderedWords[displayed - 1] || "",
        isSeasonNew: seasonSet.has(orderedWords[displayed - 1]), seasonDisplayed,
        complete: displayed === orderedWords.length,
      };
    },
  };
}
