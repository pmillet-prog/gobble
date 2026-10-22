import assert from "node:assert/strict";
import test from "node:test";
import { createGotusFeature } from "./createGotusFeature.js";
import { normalizeGotusProgress } from "../../../shared/gotusProgress.js";

const context = { key: "7:live:42", roundId: 42, selfUserId: 7, selfNick: "Tigre" };
const rewardProgression = {
  before: normalizeGotusProgress(9), after: normalizeGotusProgress(10),
  reward: { amount: 500, balance: 800, receipt: "gotus:1" },
};
function fixture(storage = new Map()) {
  let cleanup, timerId = 0;
  const pending = new Map();
  const feature = createGotusFeature({ scope: { add: fn => { cleanup = fn; } } }, {
    storage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    timers: { setTimeout: (fn, ms) => { const id = ++timerId; pending.set(id, { fn, ms }); return id; }, clearTimeout: id => pending.delete(id) },
  });
  feature.start();
  feature.configure(context);
  return { feature, storage, pending, dispose: () => cleanup() };
}

test("loading, training and reports for another round cannot replace the live outro", async () => {
  const f = fixture();
  f.feature.capture(42, { started: false, phase: "loading" });
  f.feature.capture(43, { started: true, phase: "won" });
  assert.equal(f.feature.hasPlayed(42), false);
  await f.feature.showRecap(42);
  assert.equal(f.pending.size, 0);
  f.feature.configure({ key: "", roundId: 42 });
  f.feature.capture(42, { started: true, phase: "won" });
  assert.equal(f.feature.hasPlayed(42), false);
});

test("Gotus dismissal and summary survive remount within the same identity and room only", () => {
  const f = fixture();
  f.feature.capture(42, { started: true, phase: "won", attemptsUsed: 3, solution: "JARDIN", progression: rewardProgression, score: 100 });
  f.feature.dismiss();
  const restored = fixture(f.storage).feature;
  assert.equal(restored.store.getState().dismissed, true);
  assert.equal(restored.hasPlayed(42), true);
  assert.equal(restored.store.getState().summary.wordsFound, 1);
  assert.equal(restored.store.getState().summary.score, undefined, "no game or tournament score is invented");
  assert.equal(restored.store.getState().summary.progression.reward.amount, 500);
  restored.configure({ ...context, key: "7:other:42" });
  assert.equal(restored.hasPlayed(42), false);
  assert.equal(restored.store.getState().dismissed, false);
});

test("public results preserve private rewards and stale UI reports cannot undo a win", async () => {
  const f = fixture();
  f.feature.capture(42, { started: true, phase: "won", attemptsUsed: 3, solution: "JARDIN", progression: rewardProgression });
  f.feature.capture(42, { started: true, phase: "revealing", attemptsUsed: 2,
    progression: { before: normalizeGotusProgress(9), after: normalizeGotusProgress(9), reward: null } });
  assert.equal(f.feature.store.getState().summary.won, true);
  assert.equal(f.feature.store.getState().summary.progression, rewardProgression);
  const done = f.feature.showRecap(42, { roundId: 42, results: [
    { userId: 8, nick: "Tigre", gotus: { phase: "lost", attemptsUsed: 6, solution: "BANANE" } },
    { userId: 7, nick: "Renamed", gotus: { phase: "won", attemptsUsed: 3, solution: "JARDIN" } },
  ] });
  assert.equal(f.feature.store.getState().recap.solution, "JARDIN");
  assert.equal(f.feature.store.getState().recap.progression, rewardProgression);
  f.feature.capture(42, { started: true, phase: "lost", attemptsUsed: 6, solution: "BANANE" });
  assert.equal(f.feature.store.getState().recap.won, true);
  assert.equal(f.feature.store.getState().recap.attemptsUsed, 3);
  f.dispose(); await done;
});

test("a late private receipt can complete the recap after the authoritative public result", async () => {
  const f = fixture();
  f.feature.capture(42, { started: true, phase: "playing", attemptsUsed: 2 });
  const done = f.feature.showRecap(42, { roundId: 42, results: [{ userId: 7, gotus: { phase: "won", attemptsUsed: 3, solution: "JARDIN" } }] });
  f.feature.capture(42, { started: true, phase: "revealing", progression: rewardProgression });
  assert.equal(f.feature.store.getState().recap.solution, "JARDIN");
  assert.equal(f.feature.store.getState().recap.attemptsUsed, 3);
  assert.equal(f.feature.store.getState().recap.progression.reward.receipt, "gotus:1");
  f.dispose(); await done;
});

test("recap keeps the six-second outro and releases its timer on navigation", async () => {
  const f = fixture();
  f.feature.capture(42, { started: true, phase: "lost", attemptsUsed: 6, solution: "JARDIN" });
  f.feature.capture(42, { started: true, phase: "revealing", attemptsUsed: 6 });
  assert.equal(f.feature.store.getState().summary.phase, "lost");
  const done = f.feature.showRecap(42);
  assert.equal(f.feature.showRecap(42), done);
  assert.equal(f.pending.values().next().value.ms, 6000);
  f.feature.configure({ key: "", roundId: null });
  await done;
  assert.equal(f.pending.size, 0);
  assert.equal(f.feature.store.getState().recap, null);
  f.dispose();
});
