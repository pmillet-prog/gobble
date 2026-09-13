import { normalizeWord } from "../../../shared/gameLogic.js";

const REASONS = {
  not_in_dictionary: "Absent du dictionnaire du jeu.",
  duplicate_word: "Ce mot a déjà été compté.",
  duplicate_start: "La tuile de départ est déjà utilisée par un autre mot validé.",
  invalid_path: "Le tracé proposé ne forme pas ce mot sur la grille.",
  not_counted: "Ce mot n’a pas été retenu. Le motif détaillé n’a pas été conservé.",
  empty: "Aucun mot proposé pour cet emplacement.",
};

export function getDailySpecialWordReview(result) {
  if (!result) return null;
  let entries = result.wordReview;
  if (!Array.isArray(entries)) {
    // Old results retain words and submissions, but not individual points or reasons.
    if (!Array.isArray(result.wordSubmissions) || !Array.isArray(result.words)) return null;
    const accepted = new Set(result.words.map(normalizeWord));
    entries = result.wordSubmissions.map(({ word }) => ({
      word,
      valid: accepted.has(normalizeWord(word)),
      points: accepted.has(normalizeWord(word)) ? null : 0,
      reason: "not_counted",
    }));
    if (!entries.length && result.words.length) return null;
  }
  return Array.from({ length: 3 }, (_, index) => {
    const entry = entries[index];
    const word = String(entry?.word || "").trim();
    const valid = !!word && entry?.valid === true;
    return {
      word,
      valid,
      points: valid ? (Number.isFinite(entry.points) ? entry.points : null) : 0,
      label: !word ? "Non proposé" : valid ? "Validé" : "Non retenu",
      explanation: !word ? REASONS.empty : valid ? "" : REASONS[entry.reason] || REASONS.not_counted,
    };
  });
}

export function isOwnDailyEntry(entry, { installId, selfNick }, normalizeId = String) {
  if (!entry || entry.isPalier) return false;
  if (entry.installId && installId) return normalizeId(entry.installId) === normalizeId(installId);
  return !!entry.nick && !!selfNick && entry.nick === selfNick;
}
