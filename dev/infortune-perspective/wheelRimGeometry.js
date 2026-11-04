import { LatheGeometry, Vector2 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// One closed cross-section, from the bottom axis around the rim to the top
// axis. Each surface belongs to exactly one finish: no full blue cap below
// the gold inlays, and no hidden gold disc below the blue peg track.
const PROFILE = [
  [0, -22], [293, -22], [293, -20.25], [295, -20.25],
  [295, -17.75], [293, -17.75], [293, -3.5], [295, -3.5],
  [295, -0.5], [293, -0.5], [293, 0], [279, 0],
  [261, 0], [251, 0], [0, 0],
];
const FINISHES = [
  "dark", "dark", "brass", "brass", "brass", "dark", "brass",
  "brass", "brass", "dark", "brass", "dark", "brass", "dark",
];

export function createWheelRimGeometries() {
  const parts = { dark: [], brass: [] };
  for (let i = 0; i < PROFILE.length - 1; i++) {
    // Separate profile edges retain crisp normals at each machined corner.
    const geometry = new LatheGeometry(PROFILE.slice(i, i + 2).map(([r, y]) => new Vector2(r, y)), 144);
    geometry.normalizeNormals();
    parts[FINISHES[i]].push(geometry);
  }
  return Object.fromEntries(Object.entries(parts).map(([finish, geometries]) => {
    const merged = mergeGeometries(geometries);
    geometries.forEach(geometry => geometry.dispose());
    return [finish, merged];
  }));
}
