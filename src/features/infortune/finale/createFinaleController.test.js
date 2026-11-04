import test from "node:test";
import assert from "node:assert/strict";
import { createInfortuneFinaleSession } from "../../../../shared/createInfortuneFinaleSession.js";
import { createFinaleController, FINALE_FLIP_MS, FINALE_REVEAL_STEP_MS } from "./createFinaleController.js";

function harness() {
  let now = 0, id = 0;
  const jobs = new Map();
  const session = createInfortuneFinaleSession({ puzzle: { id: "p1", clue: "É E È", answer: "boussole" }, bank: 500 });
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

test("purchased letters flip sequentially in reading order, commands stay locked until the final flip", () => {
  const h = harness();
  h.controller.buyLetter("E");
  assert.equal(h.state().flippingIndex, 0);
  assert.equal(h.state().tiles[2].character, null);
  assert.equal(h.controller.buyLetter("A"), false);
  assert.equal(h.controller.submitAnswer("boussole"), false);
  h.advance(FINALE_REVEAL_STEP_MS - 1);
  assert.equal(h.state().tiles[2].character, null);
  h.advance(1);
  assert.equal(h.state().flippingIndex, 2);
  assert.equal(h.state().tiles[2].character, "E");
  h.advance(FINALE_REVEAL_STEP_MS);
  assert.equal(h.state().flippingIndex, 4);
  assert.equal(h.state().tiles[4].character, "È");
  assert.equal(h.state().busy, true);
  h.advance(FINALE_FLIP_MS);
  assert.equal(h.state().busy, false);
  assert.equal(h.jobs.size, 0);
  assert.equal(h.controller.submitAnswer("boussole"), true);
});

test("an absent letter does not lock controls or create an animation timer", () => {
  const h = harness();
  h.controller.buyLetter("Z");
  assert.equal(h.state().bank, 450);
  assert.equal(h.state().busy, false);
  assert.equal(h.jobs.size, 0);
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
