import assert from "node:assert/strict";
import test from "node:test";
import {
  scheduleVocabResultsDecisionDeadline,
  VOCAB_RESULTS_DECISION_TIMEOUT_MS,
} from "./vocabResultsDecisionDeadline.js";

function createHarness() {
  const state = { vocabDecisionRoundId: null, vocabOverlayRequest: null, vocabOverlayOpen: false };
  const writes = [];
  const timers = new Map();
  let nextId = 0;
  const stats = {
    store: { getState: () => state },
    set(field, value) { writes.push([field, value]); state[field] = value; },
  };
  const clock = {
    setTimeoutFn(callback, delayMs) { const id = ++nextId; timers.set(id, { callback, delayMs }); return id; },
    clearTimeoutFn(id) { timers.delete(id); },
  };
  return { state, writes, timers, schedule: (overrides = {}) => scheduleVocabResultsDecisionDeadline(stats, {
    phase: "results", roundId: "round-1", accountSeenReady: false, ...overrides,
  }, clock) };
}

test("missing account markers end the round decision after the deadline", () => {
  const harness = createHarness();
  harness.schedule();
  const timer = [...harness.timers.values()][0];
  assert.equal(timer.delayMs, VOCAB_RESULTS_DECISION_TIMEOUT_MS);
  assert.deepEqual(harness.writes, []);
  timer.callback();
  assert.equal(harness.state.vocabDecisionRoundId, "round-1");
  // A later markers response must keep the terminal decision.
  harness.schedule({ accountSeenReady: true });
  assert.equal(harness.state.vocabDecisionRoundId, "round-1");
  assert.equal(harness.writes.length, 1);
});

test("a changed round or markers resolved before the deadline cancel its callback", () => {
  const harness = createHarness();
  const cancel = harness.schedule();
  const oldTimer = [...harness.timers.values()][0];
  cancel();
  assert.equal(harness.timers.size, 0);
  oldTimer.callback();
  assert.deepEqual(harness.writes, []);
  harness.schedule({ roundId: "round-2" });
  [...harness.timers.values()][0].callback();
  assert.equal(harness.state.vocabDecisionRoundId, "round-2");
});

for (const patch of [
  { vocabOverlayRequest: { id: 1 } },
  { vocabOverlayOpen: true },
  { vocabDecisionRoundId: "round-1" },
]) test(`the deadline respects a decision or animation that arrived meanwhile: ${Object.keys(patch)[0]}`, () => {
  const harness = createHarness();
  harness.schedule();
  Object.assign(harness.state, patch);
  [...harness.timers.values()][0].callback();
  assert.deepEqual(harness.writes, []);
});

test("no deadline runs outside eligible results or after markers are ready", () => {
  const harness = createHarness();
  for (const overrides of [{ phase: "playing" }, { accountSeenReady: true }, { noVocabAnimation: true }]) {
    assert.equal(harness.schedule(overrides), undefined);
  }
  assert.equal(harness.timers.size, 0);
});
