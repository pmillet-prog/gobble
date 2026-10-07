import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  TARGET_QUIZ_BANK_PATH,
  TARGET_QUIZ_BOUNDARY_GAP,
  loadTargetQuizCatalog,
  validateTargetQuizBank,
  targetQuizBankVersion,
} from "./targetQuizCatalog.js";
import { buildTargetQuizBank } from "../../scripts/build-target-quiz-bank.mjs";

const bank = JSON.parse(await readFile(TARGET_QUIZ_BANK_PATH, "utf8"));
const catalog = await loadTargetQuizCatalog();

test("all five routes contain the entire shared bank once, with both independently drawn modes", () => {
  assert.equal(catalog.questionCount, 8444);
  assert.equal(catalog.routeCount, 5);
  const routeOrders = new Set();
  for (let routeIndex = 0; routeIndex < catalog.routeCount; routeIndex += 1) {
    const ids = [];
    const modes = [];
    for (let questionIndex = 0; questionIndex < catalog.questionCount; questionIndex += 1) {
      const question = catalog.getQuestion({ routeIndex, questionIndex });
      ids.push(question.id);
      modes.push(question.mode);
      assert.equal(question.choices.length, 4);
      assert.ok(question.answerIndex >= 0 && question.answerIndex < 4);
      assert.deepEqual(Object.keys(question).sort(), ["answerIndex", "choices", "definition", "id", "mode"]);
    }
    assert.equal(new Set(ids).size, catalog.questionCount);
    assert.deepEqual([...ids].sort(), bank.questions.map((question) => question.id).sort());
    const wordsCount = modes.filter((mode) => mode === "words").length;
    assert.ok(wordsCount > catalog.questionCount * 0.45 && wordsCount < catalog.questionCount * 0.55);
    assert.ok(modes.some((mode, index) => index > 1 && mode === modes[index - 1] && mode === modes[index - 2]));
    routeOrders.add(ids.join(","));
  }
  assert.equal(routeOrders.size, 5);
});

test("route boundaries, including the fifth-to-first loop, never repeat a recent word", () => {
  for (let routeIndex = 0; routeIndex < catalog.routeCount; routeIndex += 1) {
    const nextIndex = (routeIndex + 1) % catalog.routeCount;
    const previousTail = new Set(Array.from({ length: TARGET_QUIZ_BOUNDARY_GAP }, (_, offset) => catalog.getQuestion({
      routeIndex, questionIndex: catalog.questionCount - TARGET_QUIZ_BOUNDARY_GAP + offset,
    }).id));
    for (let questionIndex = 0; questionIndex < TARGET_QUIZ_BOUNDARY_GAP; questionIndex += 1) {
      assert.ok(!previousTail.has(catalog.getQuestion({ routeIndex: nextIndex, questionIndex }).id));
    }
    assert.deepEqual(catalog.advance({ routeIndex, questionIndex: catalog.questionCount - 1 }), { routeIndex: nextIndex, questionIndex: 0 });
  }
  assert.deepEqual(catalog.advance({ routeIndex: 0, questionIndex: 0 }), { routeIndex: 0, questionIndex: 1 });
});

test("rebuilding the candidate bank is reproducible and preserves both sets of answers", () => {
  const candidates = bank.questions.map((question) => ({
    id: question.id,
    definition: question.definition,
    words: question.words,
    spellings: question.spellings,
    answer: question.words[question.answerIndices[0]],
    sourceUrl: question.source.url,
    sourceLicense: question.source.license,
  }));
  const rebuilt = buildTargetQuizBank(candidates);
  assert.deepEqual(rebuilt, bank);
  for (const question of bank.questions) {
    assert.equal(question.words[question.answerIndices[0]], question.spellings[question.answerIndices[1]]);
  }
  assert.throws(() => buildTargetQuizBank(candidates.slice(1)), /exactly 8444/);
});

test("catalog caches concurrent reads and prevents accidental mutation", async () => {
  const first = loadTargetQuizCatalog();
  const second = loadTargetQuizCatalog();
  assert.equal(first, second);
  assert.equal(await first, catalog);
  const question = catalog.getQuestion({ routeIndex: 0, questionIndex: 0 });
  assert.throws(() => { question.choices[0] = "changed"; }, TypeError);
  assert.throws(() => { question.answerIndex = 9; }, TypeError);
  assert.deepEqual(catalog.getQuestion({ routeIndex: 0, questionIndex: 0 }), question);
});

test("invalid cursors cannot silently restart or skip progression", () => {
  for (const cursor of [undefined, {}, { routeIndex: -1, questionIndex: 0 }, { routeIndex: 5, questionIndex: 0 }, { routeIndex: 0, questionIndex: 8444 }, { routeIndex: 0, questionIndex: 1.5 }]) {
    assert.throws(() => catalog.getQuestion(cursor), /cursor_invalid/);
    assert.throws(() => catalog.advance(cursor), /cursor_invalid/);
  }
});

test("a corrupted bank is rejected instead of filtering questions or accepting stale versions", () => {
  const corrupted = structuredClone(bank);
  corrupted.questions[0].answerIndices[0] = (corrupted.questions[0].answerIndices[0] + 1) % 4;
  assert.throws(() => validateTargetQuizBank(corrupted), /mode answers differ/);
  const duplicate = structuredClone(bank);
  duplicate.routes[0].questionIndices[0] = duplicate.routes[0].questionIndices[1];
  assert.throws(() => validateTargetQuizBank(duplicate), /duplicates/);
  const tampered = structuredClone(bank);
  tampered.questions[0].definition += " Texte modifié.";
  assert.notEqual(targetQuizBankVersion(tampered), bank.version);
  assert.throws(() => validateTargetQuizBank(tampered), /content version mismatch/);
});
