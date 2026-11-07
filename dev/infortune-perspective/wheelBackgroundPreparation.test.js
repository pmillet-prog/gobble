import test from "node:test";
import assert from "node:assert/strict";
import { createWheelBackgroundPreparation } from "./wheelBackgroundPreparation.js";
import { finishWheelPrograms } from "./finishWheelPrograms.js";

function fixture() {
  let foreground = false, serial = 0;
  const timers = new Map(), checks = [];
  const gate = createWheelBackgroundPreparation({ canBlock: () => foreground,
    schedule(fn) { timers.set(++serial, fn); return serial; }, cancel(id) { timers.delete(id); } });
  const renderer = { info: { programs: [{ program: 1 }] }, getContext: () => ({ LINK_STATUS: 1,
    getProgramParameter(program) { checks.push(program); return true; } }) };
  return { gate, renderer, checks, timers, open() { foreground = true; },
    tick() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } } };
}

test("hidden preload never performs blocking link validation, and opening resumes that same preparation", async () => {
  const h = fixture(); let complete = false;
  const pending = finishWheelPrograms(h.renderer, { allowCheck: h.gate.wait, yieldControl: async () => {} })
    .then(value => { complete = true; return value; });
  await Promise.resolve(); await Promise.resolve();
  for (let i = 0; i < 10; i++) h.tick();
  assert.deepEqual(h.checks, []); assert.equal(complete, false); assert.equal(h.timers.size, 1);
  h.open(); h.tick(); assert.equal(await pending, true);
  assert.deepEqual(h.checks, [1]); assert.equal(h.timers.size, 0);
});

test("leaving the results while validation waits releases the scene without a query or timer leak", async () => {
  const h = fixture();
  const pending = finishWheelPrograms(h.renderer, { allowCheck: h.gate.wait, yieldControl: async () => {} });
  await Promise.resolve(); await Promise.resolve(); h.gate.dispose(); h.gate.dispose();
  assert.equal(await pending, false); assert.deepEqual(h.checks, []); assert.equal(h.timers.size, 0);
  assert.equal(await h.gate.wait(), false);
});

test("visible scenes need no timer and a completed retained program needs no new foreground wait", async () => {
  const h = fixture(); h.open();
  assert.equal(await finishWheelPrograms(h.renderer, { allowCheck: h.gate.wait, yieldControl: async () => {} }), true);
  assert.equal(h.timers.size, 0);
  assert.equal(await finishWheelPrograms(h.renderer, { allowCheck: () => assert.fail("already validated"), yieldControl: async () => {} }), true);
});
