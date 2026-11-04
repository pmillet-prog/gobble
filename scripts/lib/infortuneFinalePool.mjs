import { finaleClueCharacters, FINALE_VOWELS, INFORTUNE_FINALE_DEFAULTS, normalizeFinaleAnswer, normalizeFinaleText } from "../../shared/infortuneFinaleRules.js";
import { validateInfortuneFinaleBank } from "../../shared/infortuneFinaleCatalog.js";

const STOP_WORDS = new Set("a au aux avec ce ces cet cette de des du elle en est et fait il je la le les leur mais me mes mon ne ni nos notre on ou par pas plus pour qu que quel quelle quelles quels qui sa sans se ses son sous sur un une vos votre vous dans dont lui ses suis tout tous quelle appelle nom comment laquelle lequel".toUpperCase().split(" "));
const words = text => normalizeFinaleText(text).match(/[A-Z]+/g) || [];

export function compileInfortuneFinalePool(manifest, packs) {
  if (manifest?.schemaVersion !== 1 || packs.length !== manifest.packs?.length) throw new Error("infortune_pool_manifest_invalid");
  const categories = manifest.categories === undefined ? null : manifest.categories;
  if (categories !== null && (!Array.isArray(categories) || !categories.length
    || categories.some(value => typeof value !== "string" || !value.trim() || value.trim() !== value)
    || new Set(categories).size !== categories.length)) throw new Error("infortune_pool_categories_invalid");
  const allowedCategories = categories && new Set(categories);
  const puzzles = packs.flatMap((pack, packIndex) => {
    if (pack.schemaVersion !== 1) throw new Error(`infortune_pool_pack_invalid: ${manifest.packs[packIndex]}`);
    const groups = pack.groups || [{ puzzles: pack.puzzles }];
    return groups.flatMap(group => group.puzzles.map(value => {
      const reference = value.reference ? pack.references?.[value.reference] : null;
      if (value.reference && !reference?.url) throw new Error(`infortune_pool_reference_missing: ${value.id}`);
      const { reference: _key, ...entry } = value;
      return {
        kind: group.kind || pack.kind,
        category: group.category,
        status: "draft",
        ...entry,
        source: value.source || { kind: "original",
          note: reference ? `Rédaction originale pour Gobble. Référence factuelle : ${reference.title}.`
            : "Rédaction originale pour Gobble. Relecture éditoriale et factuelle à terminer avant publication.",
          ...(reference ? { url: reference.url } : {}),
        },
        editorial: { ...value.editorial, pack: manifest.packs[packIndex] },
      };
    }));
  });
  for (const puzzle of puzzles) {
    if (allowedCategories && !allowedCategories.has(puzzle.category)) {
      throw new Error(`infortune_pool_category_unknown: ${puzzle.id}/${puzzle.category}`);
    }
  }
  return validateInfortuneFinaleBank({ schemaVersion: 1, name: manifest.name, editorialNote: manifest.editorialNote, puzzles });
}

export function inspectInfortuneFinalePool(bank) {
  const byKind = {}, byDifficulty = {}, byStatus = {}, byCategory = {};
  const answers = new Map(), postings = new Map(), similarClues = [], warnings = [];
  const signatures = bank.puzzles.map(puzzle => new Set(words(puzzle.clue).filter(word => word.length > 2 && !STOP_WORDS.has(word))));
  signatures.forEach((set, index) => set.forEach(word => {
    if (!postings.has(word)) postings.set(word, []);
    postings.get(word).push(index);
  }));
  const entries = bank.puzzles.map((puzzle, index) => {
    for (const [counts, value] of [[byKind, puzzle.kind], [byDifficulty, puzzle.difficulty], [byStatus, puzzle.status], [byCategory, puzzle.category]]) {
      counts[value] = (counts[value] || 0) + 1;
    }
    const accepted = new Set([puzzle.answer, ...(puzzle.acceptedAnswers || [])].map(normalizeFinaleAnswer));
    for (const answer of accepted) {
      if (!answers.has(answer)) answers.set(answer, []);
      answers.get(answer).push(puzzle.id);
      if (words(puzzle.category).includes(answer)) warnings.push({ kind: "answer_in_category", ids: [puzzle.id], answer });
    }
    const characters = finaleClueCharacters(puzzle.clue);
    const letters = characters.map(normalizeFinaleText).filter(letter => /^[A-Z]$/.test(letter));
    const distinctLetters = [...new Set(letters)].sort();
    const fullRevealCost = distinctLetters.reduce((cost, letter) => cost + (FINALE_VOWELS.includes(letter)
      ? INFORTUNE_FINALE_DEFAULTS.vowelCost : INFORTUNE_FINALE_DEFAULTS.consonantCost), 0);
    if (characters.length > 130) warnings.push({ kind: "long_board", ids: [puzzle.id], characters: characters.length });
    if (/\d/.test(puzzle.clue)) warnings.push({ kind: "visible_numbers", ids: [puzzle.id] });

    // Inverted index: compare only texts sharing content words, avoiding a full
    // quadratic comparison of a future 20,000-entry collection.
    const overlaps = new Map();
    for (const word of signatures[index]) {
      const list = postings.get(word);
      if (list.length > Math.max(30, bank.puzzles.length * .06)) continue;
      for (const other of list) if (other < index) overlaps.set(other, (overlaps.get(other) || 0) + 1);
    }
    for (const [other, overlap] of overlaps) {
      if (overlap < 3) continue;
      const a = signatures[index], b = signatures[other];
      const intersection = [...a].filter(word => b.has(word)).length;
      const score = intersection / (a.size + b.size - intersection);
      if (score >= .55) similarClues.push({ ids: [bank.puzzles[other].id, puzzle.id], similarity: Math.round(score * 100) / 100 });
    }
    return { id: puzzle.id, kind: puzzle.kind, category: puzzle.category, difficulty: puzzle.difficulty,
      characters: characters.length, wordCount: puzzle.clue.split(" ").length,
      distinctLetters: distinctLetters.join(""), fullRevealCost,
      eCoverage: Math.round(100 * letters.filter(letter => letter === "E").length / letters.length),
      hasReference: Boolean(puzzle.source.url) };
  });
  const repeatedAnswers = [...answers].filter(([, ids]) => ids.length > 1).map(([answer, ids]) => ({ answer, ids }));
  const values = field => entries.map(entry => entry[field]).sort((a, b) => a - b);
  const distribution = field => {
    const list = values(field);
    return { min: list[0], median: list[Math.floor(list.length / 2)], max: list.at(-1) };
  };
  return { schemaVersion: 1,
    limitations: "Contrôles structurels et proximités lexicales uniquement. Une absence d’alerte ne garantit pas l’absence d’ambiguïté, la justesse d’un fait ou la difficulté en jeu.",
    summary: { total: entries.length, uniqueAnswers: answers.size, byKind, byDifficulty, byStatus, byCategory,
      withReference: entries.filter(entry => entry.hasReference).length,
      characters: distribution("characters"), fullRevealCost: distribution("fullRevealCost") },
    repeatedAnswers, similarClues, warnings, entries };
}
