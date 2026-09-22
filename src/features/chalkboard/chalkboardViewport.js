import { CHALKBOARD_WORLD } from "./chalkboardModel.js";

export const chalkboardScale = view => view.height / CHALKBOARD_WORLD.height;
const clamp = (value, max) => Math.max(0, Math.min(max, value));

// Always fill the available board height. Rotation and keyboard resizes retain
// the horizontal world point at the center, with no vertical zoom/panning.
export function resizeChalkboardViewport(current, changes) {
  const next = { ...current, ...changes };
  const scale = chalkboardScale(next);
  const previousScale = chalkboardScale(current);
  const centerX = current.height > 1 ? (current.scrollLeft + current.width / 2) / previousScale : next.width / 2 / scale;
  next.scrollLeft = clamp(centerX * scale - next.width / 2, CHALKBOARD_WORLD.width * scale - next.width);
  next.scrollTop = 0;
  return next;
}
