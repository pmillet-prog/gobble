import test from "node:test";
import assert from "node:assert/strict";
import { DoubleSide, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, Raycaster, Vector3 } from "three";
import { PIVOT_PAWL, CLASSIC_PAWL, NEEDLE_PAWL } from "../../src/features/infortune/wheelPawlModels.js";
import { pivotPawlOutline } from "../../src/features/infortune/pivotPawlGeometry.js";
import { createWheelState, launchWheel, stepWheel } from "../../src/features/infortune/wheelPhysics.js";
import { dragWheelTo, stepPawl } from "../../src/features/infortune/wheelPawl.js";
import { pawlTip, pegExclusion } from "../../src/features/infortune/wheelGeometry.js";
import { FIXED_STEP, PEG_PITCH, sectorAtPointer } from "../../src/features/infortune/wheelConfig.js";
import { createPawlMesh } from "./pawlMesh.js";
import { PEG_BASE, PEG_HEIGHT, PEG_RADIUS } from "./wheelDimensions.js";
import { createProjection, STAGE_CAMERA } from "./projection.js";
import { createDeskTopGeometry, createDeskTrimGeometry } from "./stageDeskGeometry.js";
import { DESK } from "./stageDeskDimensions.js";

const outline = pivotPawlOutline(PIVOT_PAWL);

test("the low front clears the pointer from the original low camera while still contacting the pegs", () => {
  assert.ok(PIVOT_PAWL.height - PIVOT_PAWL.thickness / 2 > PEG_BASE);
  assert.ok(PIVOT_PAWL.height + PIVOT_PAWL.thickness / 2 < PEG_BASE + PEG_HEIGHT,
    "The raised pointer must still meet the rods at their real height");
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const top = new Mesh(createDeskTopGeometry(), material); top.position.y = DESK.topBaseY;
  const rim = new Mesh(createDeskTrimGeometry(DESK.openingRadius, 2), material);
  const obstacles = [top, rim]; obstacles.forEach(mesh => mesh.updateMatrixWorld(true));
  const { camera } = createProjection(760, 584, STAGE_CAMERA);
  for (const bend of [-1, 0, 1]) for (const point of outline) {
    const target = new Vector3(point.x * Math.cos(bend) - point.y * Math.sin(bend), PIVOT_PAWL.height + PIVOT_PAWL.thickness / 2,
      -PIVOT_PAWL.pivotDistance + point.x * Math.sin(bend) + point.y * Math.cos(bend));
    const distance = target.distanceTo(camera.position);
    const ray = new Raycaster(camera.position, target.clone().sub(camera.position).normalize());
    assert.ok(ray.intersectObjects(obstacles).every(hit => hit.distance > distance - 0.01), "The desk must not hide the teardrop outline");
  }
  obstacles.forEach(mesh => mesh.geometry.dispose()); material.dispose();
});
// Independent point-to-polygon test against the drawn outline, without using
// the analytical collision interval or its flank/tip tangency equations.
function clearance(state, peg) {
  const angle = state.angle + peg * PEG_PITCH;
  const x = 270 * Math.sin(angle), y = PIVOT_PAWL.pivotDistance - 270 * Math.cos(angle);
  const px = x * Math.cos(state.pawl) + y * Math.sin(state.pawl);
  const py = -x * Math.sin(state.pawl) + y * Math.cos(state.pawl);
  let inside = false, distance = Infinity;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[j], b = outline[i], dx = b.x - a.x, dy = b.y - a.y;
    if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) inside = !inside;
    const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy)));
    distance = Math.min(distance, Math.hypot(px - a.x - t * dx, py - a.y - t * dy));
  }
  return (inside ? -distance : distance) - PEG_RADIUS;
}

function assertClear(state) {
  const nearest = -Math.round(state.angle / PEG_PITCH);
  for (let peg = nearest - 2; peg <= nearest + 2; peg++) {
    assert.ok(clearance(state, peg) > -0.001, `Rigid outline overlaps peg ${peg}: ${JSON.stringify(state)}`);
  }
}

test("rigid contact bounds match the visible flanks and sharp tip in both directions", () => {
  for (let i = -140; i <= 140; i++) {
    const angle = i / 1000, exclusion = pegExclusion(angle, PEG_RADIUS, PIVOT_PAWL);
    if (!exclusion) continue;
    for (const boundary of [exclusion.min, exclusion.max]) {
      assert.ok(Math.abs(clearance({ angle, pawl: boundary }, 0)) < 0.00001);
    }
    assert.ok(clearance({ angle, pawl: exclusion.center }, 0) < 0);
  }
});

test("the teardrop stays rigid around its circular base and both flexible versions can be restored", () => {
  const chrome = new MeshPhysicalMaterial(), brass = new MeshPhysicalMaterial();
  const pawl = createPawlMesh(chrome, brass);
  const rigid = pawl.group.getObjectByName("rigid-pivot-pawl"), flexible = pawl.group.getObjectByName("flexible-pawl");
  const positions = rigid.geometry.getAttribute("position").array, initial = positions.slice();
  const classic = flexible.geometry.getAttribute("position").array.slice();
  for (const rotation of [-0.7, -0.2, 0, 0.4, 0.7]) {
    pawl.update(rotation, PIVOT_PAWL); pawl.group.updateMatrixWorld(true);
    assert.equal(rigid.visible, true); assert.equal(flexible.visible, false);
    assert.equal(rigid.geometry.getAttribute("position").array, positions);
    assert.deepEqual(positions, initial, "A rigid pointer must never deform its mesh");
    assert.ok(rigid.localToWorld(new Vector3()).distanceTo(new Vector3(0, PIVOT_PAWL.height, -PIVOT_PAWL.pivotDistance)) < 1e-8);
    const tip = pawlTip(rotation, PIVOT_PAWL);
    assert.ok(rigid.localToWorld(new Vector3(0, 0, PIVOT_PAWL.length)).distanceTo(new Vector3(tip.x, PIVOT_PAWL.height, tip.y - PIVOT_PAWL.pivotDistance)) < 1e-8);
  }
  pawl.update(0.5, NEEDLE_PAWL); assert.equal(rigid.visible, false); assert.equal(flexible.visible, true);
  pawl.update(0, CLASSIC_PAWL); assert.deepEqual(flexible.geometry.getAttribute("position").array, classic);
  const geometries = new Set(), materials = new Set();
  pawl.group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
});

test("rigid pivot remains clear of pegs through fast spins, dragging, release and reversal", () => {
  for (const direction of [-1, 1]) {
    const held = createWheelState(-direction * 0.05, 0, direction, PEG_RADIUS, PIVOT_PAWL);
    dragWheelTo(held, 0); assert.ok(held.contact); assertClear(held);
    dragWheelTo(held, direction * 0.07); assert.ok(Math.abs(held.pawl) > 0.4); assertClear(held);
    dragWheelTo(held, direction * 0.14); const released = Math.abs(held.pawl);
    stepPawl(held, FIXED_STEP); assert.ok(Math.abs(held.pawl) < released); assertClear(held);
    for (const angle of [0.3, -1.7, 2.1, -0.02, 0.1]) { dragWheelTo(held, angle); assertClear(held); }
    for (const speed of [6.5, 18]) {
      const state = createWheelState(undefined, 0, direction, PEG_RADIUS, PIVOT_PAWL);
      launchWheel(state, direction * speed);
      for (let frame = 0; frame < 240 * 25 && !state.settled; frame++) { stepWheel(state, FIXED_STEP); assertClear(state); }
      assert.ok(state.settled); assert.equal(Math.abs(state.velocity), 0);
      const tip = pawlTip(state.pawl, PIVOT_PAWL), pointerAngle = Math.atan2(tip.x, PIVOT_PAWL.pivotDistance - tip.y);
      assert.equal(sectorAtPointer(state.angle, state.pawl, PIVOT_PAWL).index, sectorAtPointer(state.angle - pointerAngle).index);
    }
  }
});

test("the pivot spring can hold a near pass then release or roll back without bending the piece", () => {
  const releaseAngle = Math.acos((PIVOT_PAWL.pivotDistance ** 2 + 270 ** 2 - (PIVOT_PAWL.length + PEG_RADIUS) ** 2) / (2 * PIVOT_PAWL.pivotDistance * 270));
  function approach(speed, direction) {
    const state = createWheelState(-direction * 0.025, 0, direction, PEG_RADIUS, PIVOT_PAWL);
    state.velocity = direction * speed; state.settled = false;
    let linger = 0, furthest = 0, reversed = false;
    for (let i = 0; i < 240 * 10; i++) {
      const contact = state.contact; stepWheel(state, FIXED_STEP); assertClear(state);
      furthest = Math.max(furthest, state.angle * direction);
      if (Math.abs(state.pawl) > 0.55 && Math.abs(state.velocity) < 0.35) linger += FIXED_STEP;
      reversed ||= state.velocity * direction < -0.02;
      if (contact?.peg === 0 && state.contact?.peg !== 0 && state.angle * direction >= releaseAngle) return { outcome: "pass", linger, furthest };
      if (reversed && state.angle * direction < -0.022) return { outcome: "rollback", linger, furthest };
    }
    assert.fail("The torsion spring hesitation must resolve");
  }
  for (const direction of [-1, 1]) {
    const short = approach(0.5714, direction), enough = approach(0.5716, direction);
    assert.equal(short.outcome, "rollback"); assert.equal(enough.outcome, "pass");
    assert.ok(short.linger > 0.5 && enough.linger > 0.5);
    assert.ok(short.furthest > releaseAngle * 0.95);
  }
});
