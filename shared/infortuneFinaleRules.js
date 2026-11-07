import { INFORTUNE_FINALE_VICTORY_POINTS } from './infortuneTournamentFinale.js';

// Shared defaults for the tournament and its workshop.
export const INFORTUNE_FINALE_DEFAULTS = Object.freeze({
  consonantCost: 50,
  vowelCost: 150,
  victoryPoints: INFORTUNE_FINALE_VICTORY_POINTS,
  bankPerGobblar: 10,
});

export const FINALE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const FINALE_VOWELS = "AEIOUY";

export function normalizeFinaleText(value) {
  return String(value ?? "").trim().toUpperCase().replaceAll("Œ", "OE").replaceAll("Æ", "AE")
    .normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalizeFinaleAnswer(value) {
  const text = normalizeFinaleText(value);
  // Do not concatenate several guesses into one answer.
  return /^[A-Z]+$/.test(text) ? text : null;
}

export function normalizeFinaleRules(value = {}) {
  const rules = { ...INFORTUNE_FINALE_DEFAULTS, ...value };
  for (const key of Object.keys(INFORTUNE_FINALE_DEFAULTS)) {
    if (!Number.isSafeInteger(rules[key]) || rules[key] < (key === "victoryPoints" ? 0 : 1)) {
      throw new RangeError(`infortune_finale_invalid_rule: ${key}`);
    }
  }
  if (rules.vowelCost <= rules.consonantCost) throw new RangeError("infortune_finale_vowels_must_cost_more");
  return Object.freeze(rules);
}

export function finaleLetterCost(letter, rules) {
  return FINALE_VOWELS.includes(letter) ? rules.vowelCost : rules.consonantCost;
}

function oneTypoApart(left, right) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let index = 0;
  while (index < Math.min(left.length, right.length) && left[index] === right[index]) index++;
  if (left.length === right.length) {
    // One replacement or a single adjacent transposition.
    return left.slice(index + 1) === right.slice(index + 1)
      || (left[index] === right[index + 1] && left[index + 1] === right[index]
        && left.slice(index + 2) === right.slice(index + 2));
  }
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  return shorter.slice(index) === longer.slice(index + 1);
}

export function judgeFinaleAnswer(raw, puzzle) {
  const answer = normalizeFinaleAnswer(raw);
  if (!answer) return { valid: false, correct: false, typo: false };
  const expected = [puzzle.answer, ...(puzzle.acceptedAnswers || [])].map(normalizeFinaleAnswer);
  if (expected.includes(answer)) return { valid: true, correct: true, typo: false };
  // Close but genuinely different answers can be explicitly excluded by editors.
  const excluded = (puzzle.excludedAnswers || []).map(normalizeFinaleAnswer);
  const correct = !excluded.includes(answer)
    && expected.some(word => word.length >= 6 && oneTypoApart(answer, word));
  return { valid: true, correct, typo: correct };
}

export function finaleClueCharacters(clue) {
  // Keep the visible accents; a purchase of E also reveals É, È, Ê and Ë.
  return Array.from(clue.normalize("NFC").replaceAll("œ", "oe").replaceAll("Œ", "OE")
    .replaceAll("æ", "ae").replaceAll("Æ", "AE").toUpperCase());
}
