export const CHALKBOARD_ERASER = Object.freeze({ min: 12, max: 160, defaultSize: 60, maxPoints: 1400, maxTotalPoints: 30000, maxStrokes: 256 });

// Erasers are round, opaque masks in world coordinates, independent of pressure.
export function normalizeChalkboardErasure(raw) {
  if (!Array.isArray(raw?.points) || !raw.points.length || raw.points.length > CHALKBOARD_ERASER.maxPoints) return null;
  const size = Number(raw.size);
  if (!Number.isFinite(size) || size < CHALKBOARD_ERASER.min || size > CHALKBOARD_ERASER.max) return null;
  const points = [];
  for (const point of raw.points) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
    points.push({ x: Math.round(Math.max(0, Math.min(24000, point.x)) * 10) / 10, y: Math.round(Math.max(0, Math.min(1000, point.y)) * 10) / 10 });
  }
  return { type: "erase", id: String(raw.id || "erase").slice(0, 80), size: Math.round(size * 10) / 10, points };
}

export function getErasureBounds(element) {
  const radius = element.size / 2;
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const point of element.points) {
    bounds.minX = Math.min(bounds.minX, point.x - radius);
    bounds.minY = Math.min(bounds.minY, point.y - radius);
    bounds.maxX = Math.max(bounds.maxX, point.x + radius);
    bounds.maxY = Math.max(bounds.maxY, point.y + radius);
  }
  return bounds;
}

export function erasuresFitBudget(elements) {
  const masks = elements.filter(element => element?.type === "erase");
  return masks.length <= CHALKBOARD_ERASER.maxStrokes && masks.reduce((sum, mask) => sum + (mask.points?.length || 0), 0) <= CHALKBOARD_ERASER.maxTotalPoints;
}
