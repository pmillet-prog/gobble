import test from "node:test";
import assert from "node:assert/strict";
import { createInfortuneFinaleSession } from "../../../../shared/createInfortuneFinaleSession.js";
import { judgeFinaleAnswer } from "../../../../shared/infortuneFinaleRules.js";

const puzzle = {
  id: "opaque-1", kind: "riddle", category: "Orientation",
  clue: "Égaré ? Elle évite les détours.", answer: "boussole",
};
const create = (bank = 400) => createInfortuneFinaleSession({ puzzle, bank });

test("public snapshots hide the answer and every unpurchased letter, including accents", () => {
  const value = create().snapshot();
  assert.equal(JSON.stringify(value).includes("boussole"), false);
  assert.equal(JSON.stringify(value).includes(puzzle.clue), false);
  assert.ok(value.tiles.filter(tile => tile.kind === "letter").every(tile => tile.character === null));
  assert.equal(value.tiles.find(tile => tile.kind === "punctuation").character, "?");
});

test("buying E reveals all accented forms in reading order and charges once", () => {
  const session = create();
  const response = session.buyLetter("é");
  assert.equal(response.ok, true);
  const characters = Array.from(puzzle.clue.toUpperCase());
  const expected = characters.flatMap((character, index) => /[EÉÈÊË]/.test(character) ? [index] : []);
  assert.deepEqual(response.indices, expected);
  assert.equal(response.snapshot.bank, 250);
  assert.deepEqual(response.snapshot.tiles.filter(tile => tile.kind === "letter" && tile.character !== null)
    .map(tile => tile.character), expected.map(index => characters[index]));
  assert.deepEqual(session.buyLetter("E"), { ok: false, error: "already_purchased" });
  assert.equal(session.snapshot().bank, 250);
});

test("absent letters still cost their price, duplicates and insufficient funds never debit", () => {
  const session = create(50);
  const first = session.buyLetter("Z");
  assert.deepEqual(first.indices, []);
  assert.equal(first.snapshot.bank, 0);
  assert.equal(first.snapshot.lastPurchase.count, 0);
  assert.equal(session.buyLetter("Z").error, "already_purchased");
  assert.equal(session.buyLetter("A").error, "insufficient_bank");
  assert.equal(session.buyLetter("AB").error, "invalid_letter");
  assert.equal(session.snapshot().bank, 0);
});

test("exact balance can be spent and a zero bank still allows the one answer", () => {
  const session = create(150);
  assert.equal(session.buyLetter("E").snapshot.bank, 0);
  assert.equal(session.submitAnswer("boussole").snapshot.outcome.correct, true);
  assert.equal(session.snapshot().outcome.gobblars, 0);
});

test("one accepted proposal freezes the outcome, rewards only the remaining bank", () => {
  const session = create(423);
  session.buyLetter("E");
  const result = session.submitAnswer(" bouSsole ");
  assert.equal(result.snapshot.outcome.points, 1000);
  assert.equal(result.snapshot.outcome.gobblars, 27);
  assert.equal(result.snapshot.bank, 273);
  assert.ok(result.snapshot.tiles.every(tile => tile.character !== null));
  assert.equal(session.submitAnswer("autre").error, "finished");
  assert.equal(session.buyLetter("B").error, "finished");
  assert.equal(session.snapshot().outcome.proposal, "bouSsole");
});

test("a wrong answer consumes the attempt; malformed or multiple words do not", () => {
  const session = create();
  for (const answer of ["", "bous sole", "une boussole", "123"]) {
    assert.equal(session.submitAnswer(answer).error, "one_word_required");
    assert.equal(session.snapshot().outcome, null);
  }
  assert.equal(session.submitAnswer("parapluie").snapshot.outcome.correct, false);
  assert.equal(session.snapshot().outcome.points, 0);
  assert.equal(session.snapshot().outcome.gobblars, 0);
  assert.equal(session.submitAnswer("boussole").error, "finished");
});

test("typo tolerance handles accents, ligatures, one edit or adjacent transposition, not loose guesses", () => {
  for (const word of ["boussole", "bousole", "boussolle", "boussloe", "boussola"]) {
    assert.equal(judgeFinaleAnswer(word, puzzle).correct, true, word);
  }
  assert.equal(judgeFinaleAnswer("bouslo", puzzle).correct, false);
  assert.equal(judgeFinaleAnswer("echo", { answer: "écho" }).typo, false);
  assert.equal(judgeFinaleAnswer("oeuf", { answer: "œuf" }).correct, true);
  assert.equal(judgeFinaleAnswer("rime", { answer: "Rome" }).correct, false);
  assert.equal(judgeFinaleAnswer("anguille", { answer: "aiguille", excludedAnswers: ["anguille"] }).correct, false);
  assert.equal(judgeFinaleAnswer("vélo", { answer: "bicyclette", acceptedAnswers: ["vélo"] }).correct, true);
});

test("invalid economic parameters cannot create a session", () => {
  assert.throws(() => create(-1), /bankroll/);
  assert.throws(() => create(1.5), /bankroll/);
  assert.throws(() => createInfortuneFinaleSession({ puzzle, bank: 100, rules: { vowelCost: 50 } }), /vowels/);
  assert.throws(() => createInfortuneFinaleSession({ puzzle, bank: 100, rules: { bankPerGobblar: 0 } }), /invalid_rule/);
});
