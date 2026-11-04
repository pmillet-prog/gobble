import test from "node:test";
import assert from "node:assert/strict";
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { createWheelRimGeometries } from "./wheelRimGeometry.js";
import { createDeskTopGeometry, DESK_OUTER_TRIM } from "./stageDeskGeometry.js";

test("the blue peg track and gold rim each have one top surface with no hidden overlapping caps", () => {
  const geometries = createWheelRimGeometries(), material = new MeshBasicMaterial();
  const meshes = Object.entries(geometries).map(([finish, geometry]) => {
    const mesh = new Mesh(geometry, material); mesh.name = finish; return mesh;
  });
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
  for (const [radius, finish] of [[240, "dark"], [255, "brass"], [270, "dark"], [283, "brass"], [292, "brass"]]) {
    for (const angle of [0.137, 1.413, 3.281, 5.719]) {
      ray.ray.origin.set(radius * Math.sin(angle), 40, radius * Math.cos(angle));
      const hits = ray.intersectObjects(meshes);
      assert.equal(hits.length, 1, `Multiple surfaces under the ${finish} band at r=${radius}`);
      assert.equal(hits[0].object.name, finish);
      assert.ok(Math.abs(hits[0].point.y) < 1e-6);
    }
  }
  for (const geometry of Object.values(geometries)) geometry.dispose();
  material.dispose();
});

test("the desk bevel stays entirely inside the gold outer trim without intersecting it", () => {
  const geometry = createDeskTopGeometry(), vertices = geometry.getAttribute("position");
  const innerTrimRadius = DESK_OUTER_TRIM.radius - DESK_OUTER_TRIM.tube;
  for (let i = 0; i < vertices.count; i++) {
    const radius = Math.hypot(vertices.getX(i), vertices.getZ(i));
    assert.ok(radius < innerTrimRadius, "The blue tabletop must not pass through the gold moulding");
  }
  geometry.dispose();
});
