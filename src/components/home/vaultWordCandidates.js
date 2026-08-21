import { normalizeWord } from "../gameLogic.js";

const DEFAULT_CANDIDATE_LIMIT = 8;

export function pickVaultWordOfDayCandidates(
  words,
  limit = DEFAULT_CANDIDATE_LIMIT,
  random = Math.random
) {
  const seen = new Set();
  const entries = [];
  for (const entry of Array.isArray(words) ? words : []) {
    const word = String(entry?.word || "").trim();
    const wordKey = String(entry?.wordKey || normalizeWord(word)).trim();
    if (!word || !wordKey || seen.has(wordKey)) continue;
    seen.add(wordKey);
    entries.push({ word, wordKey });
  }
  for (let index = entries.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [entries[index], entries[swapIndex]] = [entries[swapIndex], entries[index]];
  }
  return entries.slice(0, Math.max(1, Number(limit) || 1));
}
