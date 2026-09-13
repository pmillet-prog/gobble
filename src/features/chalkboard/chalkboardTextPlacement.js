import { CHALKBOARD_WORLD, boundsIntersect, getElementBounds } from "./chalkboardModel.js";

// Direct writing starts in the visible part of the board. Search nearby clear
// space first, then continue horizontally instead of piling messages together.
export function findChalkboardTextPlacement(element, occupied = [], limits = {}) {
  const initial = getElementBounds(element);
  const halfWidth = (initial.maxX - initial.minX) / 2 + 16;
  const halfHeight = (initial.maxY - initial.minY) / 2 + 16;
  const minX = Math.max(halfWidth, limits.minX || 0);
  const minY = Math.max(halfHeight, limits.minY || 0);
  const maxX = Math.min(CHALKBOARD_WORLD.width - halfWidth, limits.maxX ?? CHALKBOARD_WORLD.width);
  const maxY = Math.min(CHALKBOARD_WORLD.height - halfHeight, limits.maxY ?? CHALKBOARD_WORLD.height);
  if (maxX < minX || maxY < minY) return null;
  const centerX = Math.max(minX, Math.min(maxX, element.cx));
  const centerY = Math.max(minY, Math.min(maxY, element.cy));
  const rows = [centerY];
  for (let offset = halfHeight * 2; offset < CHALKBOARD_WORLD.height; offset += halfHeight * 2) {
    if (centerY + offset <= maxY) rows.push(centerY + offset);
    if (centerY - offset >= minY) rows.push(centerY - offset);
  }
  for (let offset = 0; offset < CHALKBOARD_WORLD.width; offset += halfWidth * 2) {
    const columns = offset ? [centerX + offset, centerX - offset] : [centerX];
    for (const cx of columns) {
      if (cx < minX || cx > maxX) continue;
      for (const cy of rows) {
        const bounds = { minX: cx - halfWidth, maxX: cx + halfWidth, minY: cy - halfHeight, maxY: cy + halfHeight };
        if (!occupied.some(other => boundsIntersect(bounds, other))) return { cx, cy };
      }
    }
  }
  return null;
}
