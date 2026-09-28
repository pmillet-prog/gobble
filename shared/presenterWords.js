const WORD_SOURCE = "[\\p{L}\\p{M}]+(?:[-’'][\\p{L}\\p{M}]+)*";
const WHOLE_WORD = new RegExp(`^${WORD_SOURCE}$`, "u");

export function isPresenterWord(text) {
  return WHOLE_WORD.test(String(text || ""));
}

export function presenterWordKey(text) {
  return String(text || "").trim().normalize("NFC").toLocaleLowerCase("fr");
}

export function getPresenterWordRanges(text) {
  return Array.from(String(text || "").matchAll(new RegExp(WORD_SOURCE, "gu")), match => ({
    word: match[0], start: match.index, end: match.index + match[0].length,
  }));
}
