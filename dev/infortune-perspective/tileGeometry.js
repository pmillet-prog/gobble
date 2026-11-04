import { Path, Shape } from "three";
import { TAU, WHEEL_SECTORS } from "../../src/features/infortune/wheelConfig.js";

export const SECTOR_ANGLE = TAU / WHEEL_SECTORS.length;
export const TILE_BASE = 1.3;
export const TILE_BEVEL = 0.08;
export function tileExtrusion(index, golden = false) {
  return { depth: (golden ? 1.2 : 0.85) + (index % 4 - 1.5) * 0.025,
    steps: 1, bevelEnabled: true, bevelThickness: TILE_BEVEL, bevelSize: 0.12, bevelSegments: 1, curveSegments: 10 };
}
export const TILE_FIXINGS = [-1, 1].map(side => ({
  x: Math.sin(side * SECTOR_ANGLE * 0.31) * 235,
  y: Math.cos(side * SECTOR_ANGLE * 0.31) * 235,
}));

// Canonical wedge points toward +Y; rotating its mesh -90° around X lays it
// on the wheel, with the outer edge toward the player (-Z).
export function createTileShape() {
  const shape = new Shape(), half = SECTOR_ANGLE / 2 - 0.003;
  for (let step = 0; step <= 24; step++) {
    const angle = -half + step / 24 * half * 2;
    const x = Math.sin(angle) * 249, y = Math.cos(angle) * 249;
    if (step === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  for (let step = 24; step >= 0; step--) {
    const angle = -half + step / 24 * half * 2;
    shape.lineTo(Math.sin(angle) * 75, Math.cos(angle) * 75);
  }
  shape.closePath();
  for (const fixing of TILE_FIXINGS) {
    const hole = new Path(); hole.absarc(fixing.x, fixing.y, 2.7, 0, TAU, false);
    shape.holes.push(hole);
  }
  return shape;
}
