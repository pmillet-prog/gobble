import { ExtrudeGeometry, Mesh, MeshPhysicalMaterial, Shape } from "three";
import { pivotPawlOutline } from "../../src/features/infortune/pivotPawlGeometry.js";
import { PIVOT_PAWL } from "../../src/features/infortune/wheelPawlModels.js";

export function createPivotPawlGeometry(model = PIVOT_PAWL) {
  const shape = new Shape(), points = pivotPawlOutline(model);
  // Extrusion rotated onto the wheel plane: drawing +Y becomes world +Z.
  shape.moveTo(points[0].x, -points[0].y);
  for (const point of points.slice(1)) shape.lineTo(point.x, -point.y);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: model.thickness, bevelEnabled: false, steps: 1 });
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, -model.thickness / 2, 0);
  return geometry;
}

export function createPivotPawlMesh() {
  const face = new MeshPhysicalMaterial({ color: "#de3028", metalness: 0.3, roughness: 0.3, clearcoat: 0.65, clearcoatRoughness: 0.2 });
  const edge = new MeshPhysicalMaterial({ color: "#303139", metalness: 0.65, roughness: 0.32 });
  const mesh = new Mesh(createPivotPawlGeometry(), [face, edge]);
  mesh.name = "rigid-pivot-pawl"; mesh.visible = false;
  return mesh;
}
