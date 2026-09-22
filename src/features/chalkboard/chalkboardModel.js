import { getChalkboardTextHeight as getTextHeight } from "../../../shared/chalkboardText.js";
import { getErasureBounds } from "../../../shared/chalkboardErasure.js";
export { getTextHeight };

export const CHALKBOARD_WORLD = Object.freeze({ width: 24000, height: 1000 });
export const CHALKBOARD_TILE_SIZE = 512;

export const CHALKBOARD_PALETTE = Object.freeze([
  "#f4f0df",
  "#f7d154",
  "#f28b82",
  "#81d4fa",
  "#a5d6a7",
  "#ce93d8",
]);

export function createElementId(prefix = "element") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createRandomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0];
  }
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export function cloneElements(elements) {
  return (Array.isArray(elements) ? elements : []).map((element) =>
    element.type === "stroke" || element.type === "erase"
      ? { ...element, points: element.points.map((point) => ({ ...point })) }
      : { ...element }
  );
}

function rotatePoint(x, y, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

export function localToWorld(element, x, y) {
  const rotated = rotatePoint(x * element.scale, y * element.scale, element.angle);
  return { x: element.cx + rotated.x, y: element.cy + rotated.y };
}

export function worldToTextLocal(element, x, y) {
  const dx = x - element.cx;
  const dy = y - element.cy;
  const rotated = rotatePoint(dx, dy, -element.angle);
  return { x: rotated.x / element.scale, y: rotated.y / element.scale };
}

export function getTextHandles(element) {
  const halfWidth = element.width / 2;
  const halfHeight = getTextHeight(element) / 2;
  return {
    scale: localToWorld(element, halfWidth + 14, halfHeight + 14),
    width: localToWorld(element, halfWidth + 14, 0),
    rotate: localToWorld(element, 0, -halfHeight - 46),
    rotateAnchor: localToWorld(element, 0, -halfHeight),
  };
}

export function hitTestTextHandle(element, point, radius) {
  const handles = getTextHandles(element);
  // Touch targets overlap at small zoom levels. Pick the nearest handle,
  // otherwise the scale target can swallow the horizontal-width handle.
  const nearest = ["rotate", "scale", "width"].map(kind => ({ kind, distance: distance(handles[kind], point) }))
    .sort((a, b) => a.distance - b.distance)[0];
  return nearest.distance <= radius ? nearest.kind : null;
}

export function hitTestText(element, x, y, padding = 10) {
  if (!element || element.type !== "text") return false;
  const local = worldToTextLocal(element, x, y);
  return (
    Math.abs(local.x) <= element.width / 2 + padding &&
    Math.abs(local.y) <= getTextHeight(element) / 2 + padding
  );
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function getElementBounds(element) {
  if (element?.type === "erase") return getErasureBounds(element);
  if (element?.type === "stroke") {
    const points = Array.isArray(element.points) ? element.points : [];
    const radius = Number(element.size || 10) * 1.7;
    let minX = CHALKBOARD_WORLD.width;
    let minY = CHALKBOARD_WORLD.height;
    let maxX = 0;
    let maxY = 0;
    for (const point of points) {
      minX = Math.min(minX, point.x - radius);
      minY = Math.min(minY, point.y - radius);
      maxX = Math.max(maxX, point.x + radius);
      maxY = Math.max(maxY, point.y + radius);
    }
    return { minX, minY, maxX, maxY };
  }
  const halfWidth = (element.width * element.scale) / 2;
  const halfHeight = (getTextHeight(element) * element.scale) / 2;
  const cos = Math.abs(Math.cos(element.angle));
  const sin = Math.abs(Math.sin(element.angle));
  return {
    minX: element.cx - halfWidth * cos - halfHeight * sin - 12,
    minY: element.cy - halfWidth * sin - halfHeight * cos - 12,
    maxX: element.cx + halfWidth * cos + halfHeight * sin + 12,
    maxY: element.cy + halfWidth * sin + halfHeight * cos + 12,
  };
}

export function boundsIntersect(a, b) {
  return !!a && !!b && a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function hitTestIntervention(intervention, x, y) {
  const bounds = intervention?.bounds;
  if (!bounds || x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) {
    return false;
  }
  const elements = Array.isArray(intervention.elements) ? intervention.elements : [];
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (element.type === "text" && hitTestText(element, x, y, 16)) return true;
    if (element.type === "stroke") {
      const points = element.points || [];
      const radius = Math.max(12, Number(element.size || 10) * 1.5);
      for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
        const a = points[pointIndex - 1];
        const b = points[pointIndex];
        const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / lengthSquared));
        if (Math.hypot(x - (a.x + (b.x - a.x) * t), y - (a.y + (b.y - a.y) * t)) <= radius) {
          return true;
        }
      }
    }
  }
  return false;
}
