import test from "node:test";
import assert from "node:assert/strict";
import { createInfortuneFinaleSession } from "../../../../shared/createInfortuneFinaleSession.js";
import { createFinaleController, FINALE_FLIP_MS, FINALE_REVEAL_MS } from "./createFinaleController.js";

function harness(clue = "É E È") {
  let now = 0, id = 0;
  const jobs = new Map();
  const session = createInfortuneFinaleSession({ puzzle: { id: "p1", clue, answer: "boussole" }, bank: 500 });
  const controller = createFinaleController(session, { timers: {
    setTimeout(fn, delay) { jobs.set(++id, { at: now + delay, fn }); return id; },
    clearTimeout(key) { jobs.delete(key); },
  } });
  function advance(ms) {
    const end = now + ms;
    while (true) {
      const next = [...jobs].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; jobs.delete(next[0]); next[1].fn();
    }
    now = end;
  }
  return { controller, state: controller.store.getState, session, jobs, advance };
}

test("purchased letters share a staggered timeline in reading order, locked through the final flip", () => {
  const h = harness();
  h.controller.buyLetter("E");
  assert.deepEqual(h.state().reveal.indices, [0, 2, 4]);
  assert.equal(h.state().feedback.kind, 'reveal');
  assert.equal(h.state().feedback.count, 3);
  assert.equal(h.state().tiles[4].character, "È");
  assert.equal(h.state().reveal.stepMs * 2 + h.state().reveal.flipMs, FINALE_REVEAL_MS);
  assert.equal(h.controller.buyLetter("A"), false);
  assert.equal(h.controller.submitAnswer("boussole"), false);
  h.advance(FINALE_REVEAL_MS - 1);
  assert.equal(h.state().busy, true);
  h.advance(1);
  assert.equal(h.state().busy, false);
  assert.equal(h.state().reveal, null);
  assert.equal(h.jobs.size, 0);
  assert.equal(h.controller.submitAnswer("boussole"), true);
});

test("two, ten or forty letters all finish in 1.5 seconds without per-letter timers or rerenders", () => {
  for (const count of [2, 10, 40]) {
    const h = harness(`${"E ".repeat(count)}Z`);
    let updates = 0;
    h.controller.store.subscribe(() => { updates++; });
    h.controller.buyLetter("E");
    assert.equal(h.state().reveal.indices.length, count);
    assert.equal((count - 1) * h.state().reveal.stepMs + h.state().reveal.flipMs, FINALE_REVEAL_MS);
    assert.equal(h.jobs.size, 1);
    assert.equal(h.state().tiles.at(-1).character, null, "unbought letters remain private");
    h.advance(FINALE_REVEAL_MS - 1);
    assert.equal(h.state().busy, true);
    assert.equal(updates, 1);
    h.advance(1);
    assert.equal(h.state().busy, false);
    assert.equal(updates, 2);
    assert.equal(h.jobs.size, 0);
  }
});

test("a single occurrence only waits for its own flip", () => {
  const h = harness("LE CHAT");
  h.controller.buyLetter("E");
  h.advance(FINALE_FLIP_MS - 1);
  assert.equal(h.state().busy, true);
  h.advance(1);
  assert.equal(h.state().busy, false);
});

test("an absent letter does not lock controls or create an animation timer", () => {
  const h = harness();
  h.controller.buyLetter("Z");
  assert.equal(h.state().bank, 450);
  assert.equal(h.state().feedback.kind, 'absent');
  assert.equal(h.state().busy, false);
  assert.equal(h.jobs.size, 0);
});

test('restoring an already paid purchase does not emit an audio cue', () => {
  const h = harness(); h.session.buyLetter('E'); h.controller.hydrate(h.session.snapshot());
  assert.equal(h.state().feedback, null); assert.equal(h.state().bank, 350);
});

test("backgrounding or reduced motion completes a purchased reveal without another charge", () => {
  const h = harness();
  h.controller.buyLetter("E");
  h.controller.finishReveal();
  assert.equal(h.jobs.size, 0);
  assert.equal(h.state().busy, false);
  assert.equal(h.state().tiles[4].character, "È");
  assert.equal(h.state().bank, 350);
  h.advance(10000);
  assert.equal(h.state().bank, 350);
});

test("leaving the screen cancels timers and ignores commands, including already queued callbacks", () => {
  const h = harness();
  h.controller.buyLetter("E");
  const queued = [...h.jobs.values()][0].fn;
  h.controller.dispose();
  const snapshot = h.state();
  assert.equal(h.jobs.size, 0);
  assert.equal(h.controller.submitAnswer("boussole"), false);
  queued();
  assert.equal(h.state(), snapshot);
  // React StrictMode can re-run setup on the same instance.
  h.controller.resume();
  assert.equal(h.controller.submitAnswer("boussole"), true);
});
