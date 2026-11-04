import { CylinderGeometry, ExtrudeGeometry, Shape, Vector3 } from "three";

export const AUDIENCE_ROW_HEIGHT = 440;
export const AUDIENCE_ROWS = Object.freeze([
  Object.freeze({ id: "front", angle: 0, baseY: -30, radius: 580, brightness: 0.08,
    url: new URL("./assets/audience-row-front-v1.png", import.meta.url).href }),
  Object.freeze({ id: "middle", angle: 0.1, baseY: 85, radius: 690, brightness: 0.055,
    url: new URL("./assets/audience-row-middle-v1.png", import.meta.url).href }),
  Object.freeze({ id: "back", angle: 0, baseY: 200, radius: 800, brightness: 0.035,
    url: new URL("./assets/audience-row-back-v1.png", import.meta.url).href }),
]);

export function audienceRowGeometry(aspect, row) {
  const arc = AUDIENCE_ROW_HEIGHT * aspect / row.radius;
  const geometry = new CylinderGeometry(row.radius, row.radius, AUDIENCE_ROW_HEIGHT, 96, 1, true, -arc / 2, arc);
  // Preserve left/right in the source photograph when viewed from inside the arc.
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  return geometry;
}

export function placeAudienceRow(mesh, row) {
  mesh.position.set(0, row.baseY + AUDIENCE_ROW_HEIGHT / 2, 0);
  mesh.rotation.y = row.angle;
  mesh.updateMatrixWorld(true);
}

export function audienceRowPoint(row, aspect, u, v) {
  const angle = row.angle + (0.5 - u) * AUDIENCE_ROW_HEIGHT * aspect / row.radius;
  return new Vector3(Math.sin(angle) * row.radius, row.baseY + v * AUDIENCE_ROW_HEIGHT, Math.cos(angle) * row.radius);
}

export function audienceTierGeometry(row, aspect, height) {
  const halfArc = AUDIENCE_ROW_HEIGHT * aspect / row.radius / 2 + 0.015;
  const shape = new Shape(), start = -halfArc - Math.PI / 2, end = halfArc - Math.PI / 2;
  shape.absarc(0, 0, row.radius + 150, start, end, false);
  shape.absarc(0, 0, row.radius - 24, end, start, true);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1, curveSegments: 48 });
  geometry.rotateX(-Math.PI / 2); return geometry;
}
