import { FINALE_ALPHABET, normalizeFinaleText } from './infortuneFinaleRules.js';

// Sample distinct letters actually present in the clue, uniformly without
// replacement. The tournament draws once, then shares that gift with everyone.
export function drawFinaleGiftLetters(clue, random = Math.random) {
  const pool = [...new Set([...normalizeFinaleText(clue)].filter(letter => FINALE_ALPHABET.includes(letter)))];
  const letters = [];
  while (pool.length && letters.length < 3) letters.push(...pool.splice(Math.min(pool.length - 1, Math.floor(random() * pool.length)), 1));
  return letters;
}
