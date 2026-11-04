import test from "node:test";
import assert from "node:assert/strict";
import { ExtrudeGeometry, Line3, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { pawlPoint, WHEEL_GEOMETRY } from "../../src/features/infortune/wheelGeometry.js";
import { createBladeGeometry, updateBladeGeometry, BLADE_HEIGHT } from "./pawlMesh.js";
import { createTileShape, TILE_FIXINGS, tileExtrusion } from "./tileGeometry.js";
import { PEG_RADIUS } from "./wheelDimensions.js";
import { createWheelState, launchWheel, stepWheel } from "../../src/features/infortune/wheelPhysics.js";
import { dragWheelTo } from "../../src/features/infortune/wheelPawl.js";
import { FIXED_STEP, PEG_PITCH } from "../../src/features/infortune/wheelConfig.js";

test("the tile has real thickness and open alignment holes through both faces", () => {
  const options = tileExtrusion(0);
  const geometry = new ExtrudeGeometry(createTileShape(), options);
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  const ray = new Raycaster(new Vector3(0, 180, 20), new Vector3(0, 0, -1));
  const surface = ray.intersectObject(mesh);
  assert.ok(surface.length > 0 && Math.abs(surface[0].point.z - options.depth - options.bevelThickness) < 1e-5);
  for (const fixing of TILE_FIXINGS) {
    ray.ray.origin.set(fixing.x, fixing.y, 20);
    assert.equal(ray.intersectObject(mesh).length, 0, "The locating rod must pass through an actual hole");
  }
  geometry.computeBoundingBox();
  assert.ok(geometry.boundingBox.max.z - geometry.boundingBox.min.z > 0.8);
  assert.ok(geometry.boundingBox.max.z - geometry.boundingBox.min.z < 1.1, "The sector must read as thin sheet metal");
  geometry.dispose(); mesh.material.dispose();
  const gold = new ExtrudeGeometry(createTileShape(), tileExtrusion(6, true));
  gold.computeBoundingBox(); assert.ok(gold.boundingBox.max.z - gold.boundingBox.min.z < 1.5);
  gold.dispose();
});

test("the volumetric flexible blade follows the collision arc, including strong bends, without replacing its buffers", () => {
  const geometry = createBladeGeometry(), positions = geometry.getAttribute("position");
  const original = positions.array;
  for (const bend of [-1.9, -0.8, 0, 0.8, 1.9]) {
    updateBladeGeometry(geometry, bend);
    assert.equal(geometry.getAttribute("position").array, original);
    for (let ring = 0; ring <= 48; ring++) {
      const center = new Vector3();
      for (let j = 0; j < 8; j++) center.add(new Vector3().fromBufferAttribute(positions, ring * 8 + j));
      center.multiplyScalar(1 / 8);
      const point = pawlPoint(bend, ring / 48);
      assert.ok(Math.abs(center.x - point.x) < 2e-5);
      assert.ok(Math.abs(center.z - (WHEEL_GEOMETRY.pivotY - WHEEL_GEOMETRY.centerY + point.y)) < 2e-5);
      assert.equal(center.y, BLADE_HEIGHT);
    }
    assert.ok(geometry.getAttribute("normal").array.every(Number.isFinite));
  }
  geometry.computeBoundingBox();
  assert.equal(geometry.boundingBox.max.y - geometry.boundingBox.min.y, 6);
  geometry.dispose();
});

test("thin 3D rods contact the visible blade without the old thicker invisible collider", () => {
  const geometry = createBladeGeometry(), positions = geometry.getAttribute("position");
  const segment = new Line3(), closest = new Vector3(), center = new Vector3();
  for (const direction of [-1, 1]) {
    const state = createWheelState(-direction * 0.04, 0, direction, PEG_RADIUS);
    dragWheelTo(state, -direction * 0.018);
    assert.equal(state.contact, null); assert.equal(state.pawl, 0);
    for (const angle of [0, 0.04, 0.09]) {
      dragWheelTo(state, direction * angle);
      assert.ok(state.contact);
      updateBladeGeometry(geometry, state.pawl);
      const pegAngle = state.angle + state.contact.peg * PEG_PITCH;
      const peg = new Vector3(Math.sin(pegAngle) * WHEEL_GEOMETRY.pegOrbit, BLADE_HEIGHT, -Math.cos(pegAngle) * WHEEL_GEOMETRY.pegOrbit);
      let nearest = Infinity;
      for (let ring = 0; ring <= 48; ring++) {
        center.set(0, 0, 0);
        for (let j = 0; j < 8; j++) center.add(closest.fromBufferAttribute(positions, ring * 8 + j));
        center.multiplyScalar(1 / 8);
        if (ring) {
          segment.end.copy(center); segment.closestPointToPoint(peg, true, closest);
          nearest = Math.min(nearest, closest.distanceTo(peg));
        }
        segment.start.copy(center);
      }
      assert.ok(Math.abs(nearest - PEG_RADIUS - WHEEL_GEOMETRY.pawlRadius) < 0.015, "Contact must lie on the rendered rod, not in empty space");
    }
  }
  geometry.dispose();
});

test("slimmer rods still allow complete natural spins in both directions", () => {
  for (const speed of [6.5, -6.5, 18, -18]) {
    const state = createWheelState(undefined, 0, Math.sign(speed), PEG_RADIUS);
    launchWheel(state, speed);
    for (let frame = 0; frame < 240 * 25 && !state.settled; frame++) {
      stepWheel(state, FIXED_STEP);
      assert.ok(Number.isFinite(state.angle) && Number.isFinite(state.pawl));
    }
    assert.ok(state.settled); assert.equal(state.velocity, 0);
  }
});
