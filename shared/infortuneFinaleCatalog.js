import { finaleClueCharacters, normalizeFinaleAnswer, normalizeFinaleText } from "./infortuneFinaleRules.js";

export function validateInfortuneFinaleBank(bank) {
  if (bank?.schemaVersion !== 1 || !Array.isArray(bank.puzzles) || !bank.puzzles.length) {
    throw new Error("infortune_finale_invalid_bank");
  }
  const ids = new Set(), clues = new Set();
  for (const puzzle of bank.puzzles) {
    const fail = reason => { throw new Error(`infortune_finale_invalid_puzzle: ${puzzle?.id || "?"}/${reason}`); };
    if (typeof puzzle.id !== "string" || !puzzle.id.trim() || ids.has(puzzle.id)) fail("id");
    ids.add(puzzle.id);
    if (!["definition", "riddle", "quiz"].includes(puzzle.kind)) fail("kind");
    if (typeof puzzle.category !== "string" || !puzzle.category.trim()) fail("category");
    if (![1, 2, 3].includes(puzzle.difficulty)) fail("difficulty");
    if (typeof puzzle.clue !== "string" || puzzle.clue.trim() !== puzzle.clue || /\s{2}|[\r\n]/u.test(puzzle.clue)) fail("clue");
    const length = finaleClueCharacters(puzzle.clue).length;
    if (length < 20 || length > 160) fail("clue_length");
    const clue = normalizeFinaleText(puzzle.clue).replace(/[^A-Z0-9]+/g, " ").trim();
    if (clues.has(clue)) fail("duplicate_clue");
    clues.add(clue);
    if (!normalizeFinaleAnswer(puzzle.answer)) fail("one_word_answer");
    for (const field of ["acceptedAnswers", "excludedAnswers"]) {
      if (puzzle[field] !== undefined && (!Array.isArray(puzzle[field]) || !puzzle[field].every(normalizeFinaleAnswer))) fail(field);
    }
    const answers = [puzzle.answer, ...(puzzle.acceptedAnswers || [])].map(normalizeFinaleAnswer);
    if (answers.some(answer => clue.split(" ").includes(answer))) fail("answer_in_clue");
    if ((puzzle.excludedAnswers || []).some(word => answers.includes(normalizeFinaleAnswer(word)))) fail("contradictory_answers");
    if (!puzzle.source?.kind || !puzzle.source?.note) fail("source");
    if (!["draft", "reviewed"].includes(puzzle.status)) fail("status");
  }
  return bank;
}

// The host selects once for the tournament; every player gets that same puzzle.
// Drafts are available only when explicitly requested by the workshop.
export function selectInfortuneFinalePuzzle(bank, { recentIds = [], allowDrafts = false, random = Math.random } = {}) {
  const eligible = bank.puzzles.filter(puzzle => allowDrafts || puzzle.status === "reviewed");
  if (!eligible.length) return null;
  const recent = new Set(recentIds);
  let candidates = eligible.filter(puzzle => !recent.has(puzzle.id));
  if (!candidates.length) {
    // recentIds runs from oldest to newest: repeat the least recent puzzle first.
    const oldest = recentIds.find(id => eligible.some(puzzle => puzzle.id === id));
    candidates = eligible.filter(puzzle => puzzle.id === oldest);
  }
  return candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))];
}
