import { pawlTip, pawlPivotDistance } from "./wheelGeometry.js";
import { CLASSIC_PAWL } from "./wheelPawlModels.js";
import { WHEEL_SECTORS } from "../../../shared/infortuneWheel.js";
export { WHEEL_SECTORS } from "../../../shared/infortuneWheel.js";

export const TAU = Math.PI * 2;
export const SLOTS_PER_SECTOR = 3;

// Prototype denominations, freely inspired by the euro wheel. Order and rewards
// are data: neither the physics nor the renderer chooses a winning sector.
// Passe faces Banqueroute; Bonus faces 1000. The three 100s are 120° apart,
// with one 100 and one 150 around 1000. There are 24 wedges / 72 pegs.

export const PEG_COUNT = WHEEL_SECTORS.length * SLOTS_PER_SECTOR;
export const PEG_PITCH = TAU / PEG_COUNT;
export const FIXED_STEP = 1 / 240;
export const MIN_LAUNCH_SPEED = 6.5;
export const MAX_LAUNCH_SPEED = 18;
export const DEFAULT_PHYSICS = Object.freeze({
  friction: 0.95,
  drag: 0.14,
  pegBarrier: 0.026,
  pegLoss: 0.008,
});

export function normalizeAngle(angle) {
  return ((angle % TAU) + TAU) % TAU;
}

export function sectorAtPointer(angle, pawlAngle = 0, pawlModel = CLASSIC_PAWL, sectors = WHEEL_SECTORS) {
  // A resting pawl may still lean against a peg: read beneath its actual tip.
  const tip = pawlTip(pawlAngle, pawlModel);
  const pointerAngle = Math.atan2(tip.x, pawlPivotDistance(pawlModel) - tip.y);
  const slot = Math.floor(normalizeAngle(pointerAngle - angle) / PEG_PITCH) % PEG_COUNT;
  const index = Math.floor(slot / SLOTS_PER_SECTOR);
  return { ...sectors[index], index, slot: slot % SLOTS_PER_SECTOR };
}

