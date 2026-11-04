import test from "node:test";
import assert from "node:assert/strict";
import { FIXED_STEP, MAX_LAUNCH_SPEED, PEG_PITCH } from "./wheelConfig.js";
import { pawlPoint, WHEEL_GEOMETRY as geometry } from "./wheelGeometry.js";
import { createWheelState, launchWheel, stepWheel } from "./wheelPhysics.js";
import { dragWheelTo, stepPawl } from "./wheelPawl.js";
import { PAWL_MODELS } from "./wheelPawlModels.js";

test("a slow hand loading and unloading a peg produces no passage clicks", () => {
  for (const model of Object.values(PAWL_MODELS)) for (const direction of [-1, 1]) {
    const state = createWheelState(-direction * 0.025, 0, direction, 1.3, model);
    let clicks = 0;
    // Alternate input samples and spring steps, as a real 60 Hz drag does.
    for (let i = 1; i <= 240; i++) {
      const travel = i <= 120 ? i / 120 : (240 - i) / 120;
      clicks += dragWheelTo(state, direction * (-0.025 + travel * 0.05));
      for (let substep = 0; substep < 4; substep++) clicks += stepPawl(state, FIXED_STEP);
    }
    assert.equal(clicks, 0, `${model.id}: the peg never passed the tip`);
  }
});

test("a slow real passage emits one click, even with spring bounces between hand samples", () => {
  for (const model of Object.values(PAWL_MODELS)) for (const direction of [-1, 1]) {
    const state = createWheelState(-direction * 0.025, 0, direction, 1.3, model);
    let clicks = 0;
    for (let i = 1; i <= 240; i++) {
      clicks += dragWheelTo(state, direction * (-0.025 + i / 240 * 0.15));
      for (let substep = 0; substep < 4; substep++) clicks += stepPawl(state, FIXED_STEP);
    }
    assert.equal(clicks, 1, model.id);
  }
});

// Independently sample the visible arc into short segments, without using the
// solver's exclusion intervals or its analytic nearest-point calculation.
function clearance(state, peg) {
  const angle = state.angle + peg * PEG_PITCH;
  const x = geometry.pegOrbit * Math.sin(angle);
  const y = geometry.centerY - geometry.pivotY - geometry.pegOrbit * Math.cos(angle);
  let lastX = 0, lastY = 0, nearest = Infinity;
  for (let i = 1; i <= 80; i++) {
    const bend = state.pawl, fraction = i / 80;
    const nextX = Math.abs(bend) < 1e-8 ? 0 : geometry.pawlLength / bend * (Math.cos(bend * fraction) - 1);
    const nextY = Math.abs(bend) < 1e-8 ? geometry.pawlLength * fraction : geometry.pawlLength / bend * Math.sin(bend * fraction);
    const dx = nextX - lastX, dy = nextY - lastY;
    const along = Math.max(0, Math.min(1, ((x - lastX) * dx + (y - lastY) * dy) / (dx * dx + dy * dy)));
    nearest = Math.min(nearest, Math.hypot(x - lastX - along * dx, y - lastY - along * dy));
    lastX = nextX; lastY = nextY;
  }
  return nearest - geometry.pegRadius - geometry.pawlRadius;
}

function assertClear(state) {
  const nearest = -Math.round(state.angle / PEG_PITCH);
  for (let i = nearest - 2; i <= nearest + 2; i++) {
    assert.ok(clearance(state, i) >= -0.004, `Peg ${i} overlaps the visible pawl: ${JSON.stringify(state)}`);
  }
}

test("pawl starts moving at the actual surface contact, follows the peg and releases beyond the tip", () => {
  for (const direction of [-1, 1]) {
    const state = createWheelState(-direction * 0.04);
    dragWheelTo(state, -direction * 0.025);
    assert.equal(state.pawl, 0, "No anticipatory movement before contact");
    assert.equal(state.contact, null);
    assert.ok(clearance(state, 0) > 0);
    assert.equal(dragWheelTo(state, 0), 0, "Passing the vertical axis is not the release click");
    assert.equal(state.contact.peg, 0);
    assert.equal(Math.sign(state.pawl), -direction);
    assert.ok(Math.abs(clearance(state, 0)) < 0.004);
    const firstDeflection = Math.abs(state.pawl);
    assert.equal(dragWheelTo(state, direction * 0.04), 0);
    assert.ok(Math.abs(state.pawl) > firstDeflection, "The passing peg must keep pushing the pawl");
    assert.ok(Math.abs(clearance(state, 0)) < 0.004);
    assert.equal(dragWheelTo(state, direction * 0.14), 1, "Click occurs when the peg frees the tip");
    assert.equal(state.contact, null);
    assert.ok(clearance(state, 0) > 0);
    const released = Math.abs(state.pawl);
    stepPawl(state, FIXED_STEP);
    assert.ok(Math.abs(state.pawl) < released, "The free spring must return the pawl");
    for (let i = 0; i < 240; i++) { stepPawl(state, FIXED_STEP); assertClear(state); }
    assert.ok(state.pawlResting, "A held wheel may catch the returning blade on the next peg");
  }
});

test("every rendered position remains outside metal pegs, including maximum-speed spins and reversals", () => {
  for (const speed of [6.5, -6.5, MAX_LAUNCH_SPEED, -MAX_LAUNCH_SPEED]) {
    const state = createWheelState();
    launchWheel(state, speed);
    for (let i = 0; i < 6000 && !state.settled; i++) {
      stepWheel(state, FIXED_STEP);
      assertClear(state);
    }
    assert.ok(state.settled);
  }
});

test("coarse pointer moves and direction changes resolve the pawl before displaying the wheel", () => {
  const state = createWheelState();
  for (const angle of [0, 0.3, 1.8, 3.1, -0.5, -2.6, 0.025, -0.025, 0.065]) {
    dragWheelTo(state, angle);
    assertClear(state);
    for (let i = 0; i < 10; i++) { stepPawl(state, FIXED_STEP); assertClear(state); }
  }
});

test("a stopped pawl stays in contact without lag, oscillation or repeated clicks", () => {
  const state = createWheelState(-0.04);
  dragWheelTo(state, 0.025);
  const held = state.pawl;
  for (let i = 0; i < 240; i++) {
    assert.equal(stepPawl(state, FIXED_STEP), 0);
    assert.equal(state.pawl, held);
    assert.ok(Math.abs(clearance(state, 0)) < 0.004);
  }
  assert.ok(state.pawlResting);
});

test("the blade curves strongly while its root stays vertical instead of rotating as a rigid pointer", () => {
  const state = createWheelState(-0.04);
  dragWheelTo(state, 0.1);
  const root = pawlPoint(state.pawl, 0.01), middle = pawlPoint(state.pawl, 0.5), tip = pawlPoint(state.pawl);
  assert.ok(Math.abs(state.pawl) > 1.4, "More than 80 degrees of flexion near the last barrier");
  assert.ok(tip.x > 30, "Visible lateral travel should exceed the previous short pivot");
  assert.ok(Math.abs(root.x / root.y) < 0.02, "The fixed root should remain vertical");
  const distanceFromStraightChord = Math.abs(middle.x * tip.y - middle.y * tip.x) / Math.hypot(tip.x, tip.y);
  assert.ok(distanceFromStraightChord > 8, "The bent blade must be visibly curved");
  assertClear(state);
});

test("almost identical low-energy arrivals can linger then pass or roll back without a scripted outcome", () => {
  function approach(speed, direction) {
    const state = createWheelState(-direction * 0.025);
    state.velocity = direction * speed;
    state.settled = false;
    let suspense = 0, furthest = 0, largestBend = 0, reversed = false;
    for (let i = 0; i < 240 * 8; i++) {
      stepWheel(state, FIXED_STEP);
      furthest = Math.max(furthest, state.angle * direction);
      largestBend = Math.max(largestBend, Math.abs(state.pawl));
      if (Math.abs(state.pawl) > 1.35 && Math.abs(state.velocity) < 0.35) suspense += FIXED_STEP;
      reversed ||= state.velocity * direction < -0.02;
      if (state.angle * direction > 0.14) return { outcome: "pass", suspense, largestBend, furthest };
      if (reversed && state.angle * direction < -0.022) return { outcome: "rollback", suspense, largestBend, furthest };
    }
    assert.fail("An almost-passing arrival must resolve physically");
  }
  for (const direction of [-1, 1]) {
    const short = approach(0.641, direction), enough = approach(0.648, direction);
    assert.equal(short.outcome, "rollback");
    assert.equal(enough.outcome, "pass");
    for (const result of [short, enough]) {
      assert.ok(result.suspense > 0.6, "The low-speed struggle must be perceptible");
      assert.ok(result.largestBend > 1.45);
    }
    assert.ok(short.furthest + 0.022 > PEG_PITCH, "The failed pass should visibly return more than one peg interval");
  }
});
