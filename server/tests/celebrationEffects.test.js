import assert from "node:assert/strict";
import test from "node:test";

import { createCelebrationEffects } from "../../src/effects/createCelebrationEffects.js";

function celebrationHarness(t, { confettiEnabled = true, gobbleEnabled = true, lite = false } = {}) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true, value: { innerWidth: 390, innerHeight: 844 },
  });
  t.after(() => previousWindow
    ? Object.defineProperty(globalThis, "window", previousWindow)
    : Reflect.deleteProperty(globalThis, "window"));
  const bursts = [], flashes = [], ref = current => ({ current });
  let now = 10_000;
  t.mock.method(Date, "now", () => now);
  t.mock.method(Math, "random", () => 0.5);
  const controller = createCelebrationEffects(
    { showCelebrationFlash: (...args) => flashes.push(args) },
    ref(false), ref(0), ref(null), ref(null), ref(null), ref(0),
    true, ref(true), ref(false), ref(0), ref("playing"), ref(0), ref(lite),
    ref(0), () => {}, () => {}, ref([]), ref(confettiEnabled), ref(gobbleEnabled),
    ref(true), ref(true), ref(true), ref(false),
    { fireConfetti: options => bursts.push(options) },
  );
  return { controller, bursts, flashes, advance: ms => { now += ms; } };
}

test("Gobble and Double Gobble each emit one 84-particle burst and keep their animation timing", t => {
  const { controller, bursts, flashes, advance } = celebrationHarness(t);
  for (const kind of ["gobble", "doubleGobble"]) {
    const start = bursts.length;
    controller.triggerPraiseFlash("GOBBLE !", { kind });
    const emitted = bursts.slice(start);
    assert.equal(emitted.length, 2, "one burst has two particle shapes");
    assert.equal(emitted.reduce((sum, entry) => sum + entry.particleCount, 0), 84);
    assert.ok(emitted.every(entry => entry.disableForReducedMotion));
    const [key, flash, timeout] = flashes.at(-1);
    assert.equal(key, "gobbleFlash");
    assert.equal(flash.kind, kind);
    assert.equal(flash.durationMs, 2400);
    assert.equal(timeout, 2400);
    controller.triggerPraiseFlash("GOBBLE !", { kind });
    assert.equal(bursts.length, start + 2, "rapid repeats stay throttled");
    advance(500);
  }
});

for (const [name, options, burstCount, flashCount, duration] of [
  ["confetti disabled", { confettiEnabled: false }, 0, 1, 2400],
  ["Gobble image disabled", { gobbleEnabled: false }, 2, 0, null],
  ["mobile lite", { lite: true }, 0, 1, 840],
]) {
  test(`Gobble respects ${name} independently of other effects`, t => {
    const { controller, bursts, flashes } = celebrationHarness(t, options);
    controller.triggerPraiseFlash("GOBBLE !", { kind: "gobble" });
    assert.equal(bursts.length, burstCount);
    assert.equal(flashes.length, flashCount);
    if (duration != null) assert.equal(flashes[0][1].durationMs, duration);
  });
}

test("background cleanup cancels pending celebration state", () => {
  const clearedFlashes = [];
  const gridShakeStates = [];
  const scoreFlightStates = [];
  const animationCancellations = [];
  const burstTokenRef = { current: 4 };
  const gridShakeAnimationRef = {
    current: { cancel: () => animationCancellations.push("cancelled") },
  };
  const gridShakeTimerRef = { current: null };
  const ref = (current = null) => ({ current });
  const controller = createCelebrationEffects(
    { clearAllCelebrationFlashes: () => clearedFlashes.push("cleared") },
    ref(false),
    burstTokenRef,
    ref(null),
    gridShakeAnimationRef,
    gridShakeTimerRef,
    ref(null),
    false,
    ref(false),
    ref(false),
    ref(0),
    ref("playing"),
    ref(null),
    ref(false),
    ref(0),
    (value) => gridShakeStates.push(value),
    (value) => scoreFlightStates.push(value),
    ref([]),
    ref(true),
    ref(true),
    ref(true),
    ref(true),
    ref(true),
    ref(true)
  );

  controller.clearCelebrationEffects();

  assert.equal(burstTokenRef.current, 5);
  assert.deepEqual(clearedFlashes, ["cleared"]);
  assert.deepEqual(animationCancellations, ["cancelled"]);
  assert.equal(gridShakeAnimationRef.current, null);
  assert.deepEqual(gridShakeStates, [false]);
  assert.deepEqual(scoreFlightStates, [[]]);
});
