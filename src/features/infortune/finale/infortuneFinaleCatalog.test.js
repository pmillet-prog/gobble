import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateInfortuneFinaleBank, selectInfortuneFinalePuzzle } from "../../../../shared/infortuneFinaleCatalog.js";

const bank = JSON.parse(readFileSync(new URL("../../../../data/infortune-finale-bank.json", import.meta.url), "utf8"));

test("the dedicated seed bank validates and contains both riddles and general knowledge", () => {
  assert.equal(validateInfortuneFinaleBank(bank), bank);
  assert.ok(bank.puzzles.some(puzzle => puzzle.kind === "riddle"));
  assert.ok(bank.puzzles.some(puzzle => puzzle.kind === "quiz"));
  assert.ok(bank.puzzles.every(puzzle => puzzle.source.kind === "original"));
});

test("drafts cannot be drawn for live; the workshop explicitly opts in", () => {
  assert.equal(selectInfortuneFinalePuzzle(bank), null);
  assert.equal(selectInfortuneFinalePuzzle(bank, { allowDrafts: true, random: () => 0 }), bank.puzzles[0]);
});

test("selection avoids recent puzzles, then recycles the least recent one", () => {
  const first = bank.puzzles[0], last = bank.puzzles.at(-1);
  assert.equal(selectInfortuneFinalePuzzle(bank, { allowDrafts: true, recentIds: bank.puzzles.slice(0, -1).map(puzzle => puzzle.id) }), last);
  assert.equal(selectInfortuneFinalePuzzle(bank, { allowDrafts: true, recentIds: bank.puzzles.map(puzzle => puzzle.id) }), first);
});

test("editorial validation rejects an answer in the clue, multiword answers and duplicated clues", () => {
  const clone = () => structuredClone(bank);
  const leaking = clone();
  leaking.puzzles[0].clue = "Une boussole est cet objet qui indique le nord.";
  assert.throws(() => validateInfortuneFinaleBank(leaking), /answer_in_clue/);
  const multi = clone(); multi.puzzles[0].answer = "une boussole";
  assert.throws(() => validateInfortuneFinaleBank(multi), /one_word_answer/);
  const duplicate = clone(); duplicate.puzzles[1].clue = duplicate.puzzles[0].clue;
  assert.throws(() => validateInfortuneFinaleBank(duplicate), /duplicate_clue/);
});
