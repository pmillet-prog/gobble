import { CHALKBOARD_ERASER, getErasureBounds } from "../../../shared/chalkboardErasure.js";
import { boundsIntersect, createElementId, CHALKBOARD_TILE_SIZE } from "./chalkboardModel.js";

function cells(bounds) {
  const keys = [];
  for (let y = Math.max(0, Math.floor(bounds.minY / CHALKBOARD_TILE_SIZE)); y <= Math.min(1, Math.floor(bounds.maxY / CHALKBOARD_TILE_SIZE)); y++) {
    for (let x = Math.max(0, Math.floor(bounds.minX / CHALKBOARD_TILE_SIZE)); x <= Math.min(46, Math.floor(bounds.maxX / CHALKBOARD_TILE_SIZE)); x++) keys.push(`${x}:${y}`);
  }
  return keys;
}

function addTargets(gesture, mask, points) {
  const bounds = getErasureBounds({ ...mask, points });
  for (const key of cells(bounds)) for (const entry of gesture.index.get(key) || []) {
    if (!gesture.targets.has(entry.id) && boundsIntersect(entry.bounds, bounds)) {
      gesture.targets.add(entry.id);
      mask.targetIds.push(entry.id);
    }
  }
}

export function createEraserGesture(x, y, size, interventions) {
  const mask = { type: "erase", id: createElementId("erase"), size, points: [{ x, y }], targetIds: [] };
  const index = new Map();
  for (const entry of interventions) {
    if (!entry.canErase) continue;
    for (const key of cells(entry.bounds)) {
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(entry);
    }
  }
  const gesture = { kind: "erase", masks: [mask], index, targets: new Set() };
  addTargets(gesture, mask, mask.points);
  return gesture;
}

export function appendEraserGesture(gesture, x, y) {
  let mask = gesture.masks[gesture.masks.length - 1];
  const previous = mask.points[mask.points.length - 1];
  if (Math.hypot(x - previous.x, y - previous.y) < 1.2) return;
  if (mask.points.length >= CHALKBOARD_ERASER.maxPoints) {
    mask = { ...mask, id: createElementId("erase"), points: [previous], targetIds: [] };
    gesture.masks.push(mask);
    gesture.targets.clear();
  }
  const point = { x, y };
  mask.points.push(point);
  addTargets(gesture, mask, [previous, point]);
}
