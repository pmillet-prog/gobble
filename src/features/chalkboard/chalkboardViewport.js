import { CHALKBOARD_WORLD } from "./chalkboardModel.js";

export const CHALKBOARD_ZOOM = Object.freeze({ min: .5, max: 2, step: .1 });
export const chalkboardScale = view => view.height / CHALKBOARD_WORLD.height * view.zoom;
const clamp = (value, max) => Math.max(0, Math.min(max, value));

// Keep the world point at the center of the visible board while zooming or
// resizing. Below 100%, the whole board height remains visible.
export function resizeChalkboardViewport(current, changes) {
  const next = { ...current, ...changes };
  next.zoom = Math.max(CHALKBOARD_ZOOM.min, Math.min(CHALKBOARD_ZOOM.max, Number(next.zoom) || 1));
  const scale = chalkboardScale(next);
  const previousScale = chalkboardScale(current);
  const centerX = current.height > 1 ? (current.scrollLeft + current.width / 2) / previousScale : next.width / 2 / scale;
  const centerY = current.height > 1
    ? (current.scrollTop + Math.min(current.height, CHALKBOARD_WORLD.height * previousScale) / 2) / previousScale
    : CHALKBOARD_WORLD.height / 2;
  next.scrollLeft = clamp(centerX * scale - next.width / 2, CHALKBOARD_WORLD.width * scale - next.width);
  next.scrollTop = clamp(centerY * scale - Math.min(next.height, CHALKBOARD_WORLD.height * scale) / 2,
    CHALKBOARD_WORLD.height * scale - next.height);
  return next;
}
