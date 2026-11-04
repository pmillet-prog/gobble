import test from "node:test";
import assert from "node:assert/strict";
import { createWheelState, launchWheel, stepWheel } from "../../src/features/infortune/wheelPhysics.js";
import { dragWheelTo } from "../../src/features/infortune/wheelPawl.js";
import { FIXED_STEP, PEG_PITCH } from "../../src/features/infortune/wheelConfig.js";
import { CLASSIC_PAWL, NEEDLE_PAWL, pawlHalfWidth } from "../../src/features/infortune/wheelPawlModels.js";
import { WHEEL_GEOMETRY, pawlPoint } from "../../src/features/infortune/wheelGeometry.js";
import { createBladeGeometry, updateBladeGeometry } from "./pawlMesh.js";
import { PEG_RADIUS } from "./wheelDimensions.js";

// Independent polyline sampling of the rendered arc and its actual width.
function assertClear(state) {
  const nearest = -Math.round(state.angle / PEG_PITCH), model = state.pawlModel;
  for (let peg = nearest - 2; peg <= nearest + 2; peg++) {
    const angle = state.angle + peg * PEG_PITCH;
    const x = 270 * Math.sin(angle), y = 310 - 270 * Math.cos(angle);
    let previousX = 0, previousY = 0, clearance = Infinity;
    for (let segment = 1; segment <= 96; segment++) {
      const fraction = segment / 96, bend = state.pawl;
      const nextX = Math.abs(bend) < 1e-8 ? 0 : model.length / bend * (Math.cos(bend * fraction) - 1);
      const nextY = Math.abs(bend) < 1e-8 ? model.length * fraction : model.length / bend * Math.sin(bend * fraction);
      const dx = nextX - previousX, dy = nextY - previousY;
      const t = Math.max(0, Math.min(1, ((x - previousX) * dx + (y - previousY) * dy) / (dx * dx + dy * dy)));
      const radius = pawlHalfWidth((segment - 1 + t) / 96, model);
      clearance = Math.min(clearance, Math.hypot(x - previousX - t * dx, y - previousY - t * dy) - PEG_RADIUS - radius);
      previousX = nextX; previousY = nextY;
    }
    assert.ok(clearance > -0.006, `Visible needle overlaps peg: ${clearance}`);
  }
}

test("needle dimensions and contact stay aligned through fast spins and reversals", () => {
  for (const speed of [6.5, -6.5, 18, -18]) {
    const state = createWheelState(undefined, 0, Math.sign(speed), PEG_RADIUS, NEEDLE_PAWL);
    launchWheel(state, speed);
    for (let i = 0; i < 240 * 25 && !state.settled; i++) {
      stepWheel(state, FIXED_STEP); assertClear(state);
    }
    assert.ok(state.settled); assert.equal(state.velocity, 0);
  }
  const state = createWheelState(undefined, 0, 1, PEG_RADIUS, NEEDLE_PAWL);
  for (const angle of [0.3, -1.7, 2.1, -0.02, 0.1]) { dragWheelTo(state, angle); assertClear(state); }
});

test("switching needle geometry preserves buffers and restores the classic blade exactly", () => {
  const geometry = createBladeGeometry(), positions = geometry.getAttribute("position"), initial = positions.array.slice();
  const buffer = positions.array;
  updateBladeGeometry(geometry, 1.5, NEEDLE_PAWL);
  assert.equal(positions.array, buffer);
  const tip = pawlPoint(1.5, 1, NEEDLE_PAWL);
  let tipX = 0, tipZ = 0;
  for (let j = 0; j < 8; j++) { tipX += positions.getX(48 * 8 + j); tipZ += positions.getZ(48 * 8 + j); }
  assert.ok(Math.abs(tipX / 8 - tip.x) < 1e-5);
  assert.ok(Math.abs(tipZ / 8 - (tip.y - 310)) < 2e-5);
  assert.ok(NEEDLE_PAWL.length * 0.38 + NEEDLE_PAWL.rootRadius < 310 - WHEEL_GEOMETRY.pegOrbit - PEG_RADIUS,
    "The wider base must remain outside every peg's reach");
  updateBladeGeometry(geometry, 0, CLASSIC_PAWL); assert.deepEqual(positions.array, initial);
  geometry.dispose();
});

test("nearby low-energy needle arrivals linger then pass or roll back through elastic contact", () => {
  function approach(speed, direction) {
    const state = createWheelState(-direction * 0.025, 0, direction, PEG_RADIUS, NEEDLE_PAWL);
    state.velocity = speed * direction; state.settled = false;
    let linger = 0, reversed = false, furthest = 0;
    for (let i = 0; i < 240 * 10; i++) {
      const contact = state.contact; stepWheel(state, FIXED_STEP);
      furthest = Math.max(furthest, state.angle * direction);
      if (Math.abs(state.pawl) > 1.4 && Math.abs(state.velocity) < 0.35) linger += FIXED_STEP;
      reversed ||= state.velocity * direction < -0.02;
      if (contact?.peg === 0 && state.contact?.peg !== 0 && state.angle * direction > 0.12) return { outcome: "pass", linger, furthest };
      if (reversed && state.angle * direction < -0.022) return { outcome: "rollback", linger, furthest };
    }
    assert.fail("The physical hesitation must resolve");
  }
  for (const direction of [-1, 1]) {
    const short = approach(0.54, direction), enough = approach(0.542, direction);
    assert.equal(short.outcome, "rollback"); assert.equal(enough.outcome, "pass");
    assert.ok(short.linger > 1 && enough.linger > 1);
    assert.ok(short.furthest > PEG_PITCH, "A failed pass must produce a visible rollback");
  }
});
