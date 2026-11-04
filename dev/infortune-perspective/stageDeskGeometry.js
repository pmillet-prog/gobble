import { CylinderGeometry, LatheGeometry, TorusGeometry, Vector2 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { DESK, DESK_TRIM_Y, DESK_WALL_CENTER_Y, DESK_WALL_HEIGHT, deskTopBaseAt } from "./stageDeskDimensions.js";

export const DESK_OUTER_TRIM = Object.freeze({ radius: 435, tube: 2.4, height: DESK_TRIM_Y });
const SEGMENTS = 192;
const TOP_SECTIONS = {
  rear: [[-Math.PI / 2, Math.PI]],
  front: [[2 * Math.PI / 3, 2 * Math.PI / 3]],
  shoulders: [[Math.PI / 2, Math.PI / 6], [4 * Math.PI / 3, Math.PI / 6]],
};

export function createDeskTopGeometry(section = "all") {
  const inner = DESK.openingRadius, outer = DESK.topRadius, bevel = DESK.bevel, depth = DESK.topDepth;
  // Closed annular cross-section. Its outer bevel stays inside the gold trim,
  // and neighboring height sections share edges without hidden overlapping caps.
  const profile = [
    [inner, -bevel], [outer, -bevel], [outer + bevel, 0], [outer + bevel, depth],
    [outer, depth + bevel], [inner, depth + bevel], [inner - bevel, depth],
    [inner - bevel, 0], [inner, -bevel],
  ];
  const ranges = section === "all" ? Object.values(TOP_SECTIONS).flat() : TOP_SECTIONS[section];
  const parts = [];
  for (const [start, length] of ranges) for (let edge = 0; edge < profile.length - 1; edge++) {
    const points = profile.slice(edge, edge + 2).map(([radius, y]) => new Vector2(radius, y));
    const geometry = new LatheGeometry(points, Math.round(SEGMENTS * length / (Math.PI * 2)), start, length);
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const angle = Math.atan2(positions.getX(i), positions.getZ(i));
      positions.setY(i, positions.getY(i) + deskTopBaseAt(angle) - DESK.topBaseY);
    }
    geometry.computeVertexNormals(); parts.push(geometry);
  }
  const merged = mergeGeometries(parts); parts.forEach(geometry => geometry.dispose());
  return merged;
}

export function createDeskWallGeometry(face, { thetaStart = 0 } = {}) {
  const inner = face === "inner";
  const geometry = new CylinderGeometry(
    inner ? DESK.innerTopRadius : DESK.outerTopRadius,
    inner ? DESK.innerBottomRadius : DESK.outerBottomRadius,
    DESK_WALL_HEIGHT, SEGMENTS, 1, true, thetaStart,
  );
  geometry.translate(0, DESK_WALL_CENTER_Y, 0);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const angle = Math.atan2(positions.getX(i), positions.getZ(i));
    const fraction = (positions.getY(i) - DESK.bottomY) / DESK_WALL_HEIGHT;
    positions.setY(i, DESK.bottomY + fraction * (deskTopBaseAt(angle) - DESK.bottomY));
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createDeskTrimGeometry(radius, tube) {
  const geometry = new TorusGeometry(radius, tube, 8, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const angle = Math.atan2(positions.getX(i), positions.getZ(i));
    positions.setY(i, positions.getY(i) + deskTopBaseAt(angle) + DESK.topDepth);
  }
  geometry.computeVertexNormals();
  return geometry;
}
