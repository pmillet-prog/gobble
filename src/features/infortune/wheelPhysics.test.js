import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PHYSICS, FIXED_STEP, MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED, PEG_COUNT, PEG_PITCH, SLOTS_PER_SECTOR, TAU, WHEEL_SECTORS, sectorAtPointer } from "./wheelConfig.js";
import { angularDelta, createWheelState, gestureVelocity, launchWheel, stepWheel } from "./wheelPhysics.js";

function simulate(speed, physics = DEFAULT_PHYSICS, angle = PEG_PITCH / 2) {
  const state = createWheelState(angle);
  assert.equal(launchWheel(state, speed), true);
  let time = 0, ticks = 0, reversed = false;
  while (!state.settled && time < 25) {
    ticks += stepWheel(state, FIXED_STEP, physics);
    reversed ||= Math.sign(state.velocity) === -Math.sign(speed);
    time += FIXED_STEP;
    assert.ok(Number.isFinite(state.angle) && Number.isFinite(state.pawl));
  }
  assert.ok(state.settled, `Wheel did not settle: ${JSON.stringify({ speed, physics, state })}`);
  return { state, time, ticks, reversed, turns: Math.abs(state.angle - angle) / TAU };
}

test("all three slots of every sector map to the visible sector under the fixed pointer", () => {
  assert.equal(PEG_COUNT, 72);
  for (let index = 0; index < WHEEL_SECTORS.length; index++) {
    for (let slot = 0; slot < SLOTS_PER_SECTOR; slot++) {
      const angle = -(index * SLOTS_PER_SECTOR + slot + 0.5) * PEG_PITCH;
      for (const turns of [-20, 0, 20]) {
        const result = sectorAtPointer(angle + turns * TAU);
        assert.equal(result.id, WHEEL_SECTORS[index].id);
        assert.equal(result.slot, slot);
      }
    }
  }
});

test("Passe yields zero across its three slots while preserving the wheel layout", () => {
  const passes = WHEEL_SECTORS.filter(sector => sector.kind === "pass");
  assert.equal(passes.length, 1); assert.equal(passes[0].amount, 0); assert.equal(passes[0].label, "Passe");
  assert.equal(WHEEL_SECTORS.length, 24);
  const index = WHEEL_SECTORS.indexOf(passes[0]);
  for (let slot = 0; slot < 3; slot++) {
    const result = sectorAtPointer(-(index * 3 + slot + 0.5) * PEG_PITCH);
    assert.equal(result.kind, "pass"); assert.equal(result.amount, 0);
  }
  const bonus = WHEEL_SECTORS.findIndex(sector => sector.kind === "bonus");
  const thousand = WHEEL_SECTORS.findIndex(sector => sector.amount === 1000);
  assert.equal((bonus + 12) % 24, thousand);
  const bankrupt = WHEEL_SECTORS.findIndex(sector => sector.kind === "bankrupt");
  assert.equal(bankrupt, 12, "Banqueroute stays in place");
  assert.equal((index + 12) % 24, bankrupt, "Passe faces Banqueroute");
  assert.deepEqual([-1, 1].map(offset => WHEEL_SECTORS[bankrupt + offset].amount), [400, 500]);
  assert.deepEqual([-1, 1].map(offset => WHEEL_SECTORS[thousand + offset].amount).sort((a, b) => a - b), [100, 150]);
  assert.equal(WHEEL_SECTORS.filter(sector => sector.amount === 500).length, 3);
});

test("weak/nonfinite impulses are rejected; strong impulses are bounded in both directions", () => {
  for (const speed of [0, MIN_LAUNCH_SPEED - 0.01, -MIN_LAUNCH_SPEED + 0.01, Infinity, NaN]) {
    const state = createWheelState();
    assert.equal(launchWheel(state, speed), false);
    assert.equal(state.velocity, 0);
  }
  for (const direction of [-1, 1]) {
    const state = createWheelState();
    assert.ok(launchWheel(state, 100 * direction));
    assert.equal(state.velocity, MAX_LAUNCH_SPEED * direction);
  }
});

test("a tilted pawl reads the sector beneath its actual tip, including across a sector boundary", () => {
  const wheelAngle = -0.015;
  assert.equal(sectorAtPointer(wheelAngle).index, 0);
  assert.equal(sectorAtPointer(wheelAngle, 0.19).index, WHEEL_SECTORS.length - 1);
  assert.equal(sectorAtPointer(-wheelAngle, -0.19).index, 0);
});

test("wheel settles naturally, reproducibly and in bounded time at all slider extremes", () => {
  for (const physics of [DEFAULT_PHYSICS, { ...DEFAULT_PHYSICS, friction: 0.6, pegBarrier: 0.06 }, { ...DEFAULT_PHYSICS, friction: 1.5, pegBarrier: 0.01 }]) {
    for (const speed of [MIN_LAUNCH_SPEED, 11, MAX_LAUNCH_SPEED, -MIN_LAUNCH_SPEED, -MAX_LAUNCH_SPEED]) {
      const result = simulate(speed, physics);
      assert.ok(result.time > 1 && result.time < 20);
      assert.ok(result.ticks > 72, "A valid fling must pass at least one full revolution of pegs");
      assert.ok(result.state.velocity === 0);
      assert.deepEqual(simulate(speed, physics), result);
    }
  }
});

test("stronger throws travel further; a peg can turn back a wheel without selecting an outcome", () => {
  const weak = simulate(MIN_LAUNCH_SPEED), strong = simulate(MAX_LAUNCH_SPEED);
  assert.ok(strong.turns > weak.turns * 2);
  let rollback = false;
  for (let speed = 6.5; speed <= 8 && !rollback; speed += 0.1) rollback = simulate(speed).reversed;
  assert.ok(rollback, "Low-energy contact should allow a natural rollback");
});

test("gesture velocity handles wraparound and discards stale or held-still movement", () => {
  assert.ok(Math.abs(angularDelta(Math.PI - 0.1, -Math.PI + 0.1) - 0.2) < 1e-10);
  assert.ok(Math.abs(angularDelta(-Math.PI + 0.1, Math.PI - 0.1) + 0.2) < 1e-10);
  assert.equal(gestureVelocity([{ time: 0, angle: 0 }, { time: 50, angle: 0.5 }], 50), 10);
  assert.equal(gestureVelocity([{ time: 0, angle: 0 }, { time: 50, angle: 0.5 }], 180), 0);
  assert.equal(gestureVelocity([{ time: 0, angle: 0 }, { time: 50, angle: 0.5 }, { time: 180, angle: 0.5 }], 180), 0);
});
