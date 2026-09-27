export const RESULTS_WORD_INTROS = Object.freeze([
  "On pouvait aussi trouver",
  "On pouvait également former",
  "La grille proposait aussi",
  "Parmi les mots possibles, il y avait",
  "Les lettres permettaient aussi de trouver",
  "Cette grille cachait aussi",
]);

export function getResultsWordIntro(seed = "") {
  let hash = 0;
  for (const letter of String(seed)) hash = (Math.imul(hash, 31) + letter.codePointAt(0)) >>> 0;
  return RESULTS_WORD_INTROS[hash % RESULTS_WORD_INTROS.length];
}

export function getResultsWordFormText(word, lemma, label = "forme de") {
  return word && lemma && word !== lemma ? `${word}, ${label} ` : "";
}
