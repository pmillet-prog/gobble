import { GOTUS_WORD_LENGTH } from "../../../shared/gotusRules.js";

const normalizeLetters = value => String(value ?? "").replace(/œ/gi, "oe").replace(/æ/gi, "ae")
  .normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
const normalizeDraft = value => normalizeLetters(value).replace(/[^A-Z ]/g, "")
  .slice(0, GOTUS_WORD_LENGTH).trimEnd();
const columnOf = value => Math.min(GOTUS_WORD_LENGTH - 1, Math.max(0, Math.trunc(Number(value) || 0)));
const slotsOf = input => normalizeDraft(input.draft).padEnd(GOTUS_WORD_LENGTH, " ").split("");
const result = (slots, activeColumn) => ({ draft: slots.join("").trimEnd(), activeColumn });

export function createGotusInput(firstLetter = "", known = []) {
  const slots = Array.from({ length: GOTUS_WORD_LENGTH }, (_, column) =>
    normalizeLetters(known[column]).replace(/[^A-Z]/g, "").slice(0, 1) || " ");
  slots[0] = normalizeDraft(firstLetter).slice(0, 1) || slots[0];
  return editGotusInput(slots.join(""));
}

export function editGotusInput(value) {
  const slots = slotsOf({ draft: value });
  const hole = slots.indexOf(" ");
  return result(slots, hole >= 0 ? hole : GOTUS_WORD_LENGTH - 1);
}

export function selectGotusCell(input, column) {
  return { draft: input.draft, activeColumn: columnOf(column) };
}

export function typeGotusLetters(input, text) {
  const slots = slotsOf(input), start = columnOf(input.activeColumn);
  const letters = normalizeLetters(text).replace(/[^A-Z]/g, "").slice(0, GOTUS_WORD_LENGTH - start);
  if (!letters) return { draft: input.draft, activeColumn: start };
  for (let index = 0; index < letters.length; index++) slots[start + index] = letters[index];
  return result(slots, columnOf(start + letters.length));
}

export function backspaceGotusInput(input) {
  const slots = slotsOf(input);
  let column = columnOf(input.activeColumn);
  if (slots[column] === " " && column > 0) column--;
  slots[column] = " ";
  return result(slots, column);
}

export function deleteGotusLetter(input) {
  const slots = slotsOf(input), column = columnOf(input.activeColumn);
  slots[column] = " ";
  return result(slots, column);
}

export function moveGotusCursor(input, key) {
  const column = columnOf(input.activeColumn);
  const next = { ArrowLeft: column - 1, ArrowRight: column + 1, Home: 0, End: GOTUS_WORD_LENGTH - 1 }[key];
  return selectGotusCell(input, next ?? column);
}
