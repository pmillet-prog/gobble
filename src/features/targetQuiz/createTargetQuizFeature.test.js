import test from "node:test";
import assert from "node:assert/strict";
import { createTargetQuizFeature } from "./createTargetQuizFeature.js";

const context = { key: "7:live:42", roundId: 42, selfUserId: 7, selfNick: "Paul" };
function fixture(storage = new Map()) {
  let cleanup;
  const pending = new Map();
  let timerId = 0;
  const feature = createTargetQuizFeature({ scope: { add: fn => { cleanup = fn; } } }, {
    storage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    timers: { setTimeout: (fn, ms) => { const id = ++timerId; pending.set(id, { fn, ms }); return id; }, clearTimeout: id => pending.delete(id) },
  });
  feature.start();
  feature.configure(context);
  return { feature, pending, storage, dispose: () => cleanup() };
}

test("entry needs more than five seconds; an entered session survives the last five seconds", () => {
  for (const left of [0, 4999, 5000, 5001]) {
    const { feature } = fixture();
    assert.equal(feature.enter({ endsAt: 10000, now: 10000 - left }), left > 5000);
    assert.equal(feature.hasPlayed(42), false, "loading alone must not replace the outro");
    if (left > 5000) assert.equal(feature.enter({ endsAt: 10000, now: 9999 }), true);
  }
});

test("dismissal survives remount/reload and preserves the recap, but is scoped to identity/room/round", () => {
  const f = fixture();
  f.feature.enter({ endsAt: 10000, now: 0 });
  f.feature.capture(42, { started: true, score: -75, wrongCount: 1 });
  f.feature.capture(42, { started: true, score: 0, wrongCount: 1, cancelled: true });
  f.feature.capture(42, { started: true, score: 100, correctCount: 2 });
  f.feature.dismiss();
  const restored = fixture(f.storage).feature;
  assert.equal(restored.enter({ endsAt: 10000, now: 1 }), false);
  assert.equal(restored.hasPlayed(42), true);
  assert.equal(restored.store.getState().summary.score, 0);
  assert.equal(restored.store.getState().summary.cancelled, true);
  restored.configure({ ...context, key: "7:other:42" });
  assert.equal(restored.hasPlayed(42), false);
  assert.equal(restored.store.getState().dismissed, false);
});

test("network delivery delay does not turn a qualifying discovery into a late one", () => {
  const { feature } = fixture();
  feature.noteDiscovery(42, 4999);
  assert.equal(feature.enter({ endsAt: 10000, now: 5200 }), true);
  const late = fixture().feature;
  late.noteDiscovery(42, 5000);
  assert.equal(late.enter({ endsAt: 10000, now: 5200 }), false);
});

test("late UI reports cannot undo private progression; final public results keep the earned reward", async () => {
  const f = fixture();
  const progression = { before: { total: 9950, points: 9950, cycles: 0 }, after: { total: 10050, points: 50, cycles: 1 },
    steps: [100], rewards: [{ amount: 50, balance: 1000, receipt: "once" }], settled: true };
  f.feature.capture(42, { started: true, score: 100, correctCount: 1, progression });
  f.feature.capture(42, { started: true, score: 0, correctCount: 0 });
  f.feature.capture(42, { started: true, score: 100, correctCount: 1, progression: { ...progression, settled: false, rewards: [] } });
  assert.equal(f.feature.store.getState().summary.progression, progression);
  const done = f.feature.showRecap(42, { roundId: 42, results: [{ userId: 7, targetQuiz: { score: 100, correctCount: 1, bestStreak: 1 } }] });
  assert.equal(f.feature.store.getState().recap.progression, progression);
  assert.equal(f.feature.store.getState().recap.bestStreak, 1);
  f.dispose(); await done;
});

test("recap lasts six seconds, accepts late server answers and releases its timer on navigation", async () => {
  const f = fixture();
  f.feature.capture(42, { started: true, score: 100, correctCount: 1, bestStreak: 1 });
  const completion = f.feature.showRecap(42);
  assert.equal(f.pending.values().next().value.ms, 6000);
  assert.equal(f.feature.showRecap(42), completion);
  f.feature.reconcile({ roundId: 42, results: [
    { userId: 8, targetQuiz: { score: 500 } },
    { userId: 7, nick: "Renamed", targetQuiz: { score: 25, correctCount: 1, wrongCount: 1, bestStreak: 1 } },
  ] });
  assert.equal(f.feature.store.getState().recap.score, 25);
  f.feature.capture(42, { started: true, score: 100, correctCount: 1 });
  assert.equal(f.feature.store.getState().recap.score, 25, "a late client render cannot overwrite the authoritative result");
  f.feature.configure({ key: "", roundId: null });
  await completion;
  assert.equal(f.pending.size, 0);
  assert.equal(f.feature.store.getState().recap, null);
  f.dispose();
});
