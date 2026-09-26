import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLepersQuestionHistory, LEPERS_QUESTION_HISTORY_LIMIT } from "../bots/lepersQuestionHistory.js";
import { rankLepersChallenges } from "../bots/lepersChallenge.js";

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "gobble-lepers-history-"));
  const filePath = path.join(directory, "history.json");
  const errors = [];
  const history = createLepersQuestionHistory({ filePath, onError: error => errors.push(error) });
  await history.load();
  t.after(async () => {
    await history.flush();
    if (path.dirname(directory) === path.resolve(tmpdir()) && path.basename(directory).startsWith("gobble-lepers-history-")) {
      await rm(directory, { recursive: true, force: true });
    }
  });
  return { history, filePath, errors };
}

const question = i => ({ word: `lexeme${String.fromCharCode(97 + Math.floor(i / 26), 97 + i % 26)}`,
  definition: `Objet servant à ranger les pièces, modèle ${i}.`, text: `TOP ! Question ${i}.` });
const take = (history, candidates, rest = {}) => history.takeForRound({
  enabled: true, tournamentRound: 1, training: false, seed: "same-seed", candidates, ...rest,
});

test("only a started eligible round consumes a question; precomputation and training do not", async t => {
  const { history, errors } = await setup(t);
  const candidates = [question(0)];
  const options = { recentQuestions: history.snapshot(),
    rarityMetaMap: new Map([[candidates[0].word, { rarityBucket: "rare" }]]),
    loadDefinitionEntry: async () => ({ definition: candidates[0].definition }),
  };
  await rankLepersChallenges(candidates, options);
  await rankLepersChallenges(candidates, options);
  assert.deepEqual(history.snapshot(), []);
  for (const config of [{ training: true }, { enabled: false }, { tournamentRound: 2 }]) {
    assert.equal(take(history, candidates, config), null);
  }
  assert.deepEqual(history.snapshot(), []);
  assert.equal(take(history, candidates)?.word, candidates[0].word);
  assert.equal(take(history, candidates), null);
  await history.flush();
  assert.deepEqual(errors, []);
});

test("successive rounds with stale prepared candidates use different words and definitions", async t => {
  const { history } = await setup(t);
  const candidates = [question(0), question(1), question(2)];
  const first = take(history, candidates);
  const second = take(history, candidates);
  assert.notEqual(second.word, first.word);
  assert.equal(take(history, [{ ...question(3), definition: first.definition.toUpperCase() }]), null);
  const exposed = history.snapshot();
  exposed[0].word = "modified";
  assert.equal(history.snapshot()[0].word, first.word, "worker snapshots cannot mutate the owner");
});

test("history survives reload, keeps the last 100 questions and never falls back to a repeat", async t => {
  const { history, filePath, errors } = await setup(t);
  for (let i = 0; i <= LEPERS_QUESTION_HISTORY_LIMIT; i++) assert.ok(take(history, [question(i)]));
  await history.flush();
  assert.deepEqual(errors, []);
  const persisted = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(persisted.questions.length, 100);
  const reloaded = createLepersQuestionHistory({ filePath });
  await reloaded.load();
  assert.deepEqual(reloaded.snapshot(), history.snapshot());
  assert.equal(take(reloaded, [question(100)]), null);
  assert.ok(take(reloaded, [question(0)]), "an answer becomes eligible only after leaving the window");
  await reloaded.flush();
});

test("invalid persisted data is reported, while write failure retains the in-memory protection", async t => {
  const { filePath } = await setup(t);
  await writeFile(filePath, "invalid JSON");
  const errors = [];
  const history = createLepersQuestionHistory({ filePath: path.join(filePath, "impossible.json"), onError: error => errors.push(error) });
  const corrupt = createLepersQuestionHistory({ filePath, onError: error => errors.push(error) });
  await corrupt.load();
  assert.equal(errors.length, 1);
  assert.ok(take(history, [question(0)]));
  await history.flush();
  assert.equal(errors.length, 2);
  assert.equal(take(history, [question(0)]), null);
});
