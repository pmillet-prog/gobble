import { CHALKBOARD_WORLD } from "./chalkboardModel.js";

// The canvas is attached to world coordinates, just like the background.
// Native scrolling moves both even before JavaScript receives a scroll event.
// A bounded margin supplies pixels ahead of touch inertia without allocating
// a bitmap for the whole 24,000-unit board.
export function getChalkboardCanvasWindow(view, previous = null) {
  const { width, height, scale } = view;
  const worldWidth = Math.max(width, CHALKBOARD_WORLD.width * scale);
  const left = Math.max(0, Math.min(worldWidth - width, view.scrollLeft));
  const bufferWidth = Math.min(worldWidth, width * 3);
  const margin = width * .5;
  if (previous && previous.viewportWidth === width && previous.height === height && previous.scale === scale &&
    left >= previous.left + (previous.left > 0 ? margin : 0) &&
    left + width <= previous.left + previous.width - (previous.left + previous.width < worldWidth ? margin : 0)) return previous;
  const step = Math.max(1, Math.floor(width / 2));
  const origin = Math.min(worldWidth - bufferWidth, Math.max(0, Math.floor((left - width) / step) * step));
  return { left: origin, width: bufferWidth, height, scale, viewportWidth: width };
}

export function getChalkboardPointer(event, rect, scrollLeft, scale) {
  if (!rect || scale <= 0) return null;
  const screenX = event.clientX - rect.left;
  const screenY = event.clientY - rect.top;
  return { screenX, screenY,
    worldX: Math.max(0, Math.min(CHALKBOARD_WORLD.width, (screenX + scrollLeft) / scale)),
    worldY: Math.max(0, Math.min(CHALKBOARD_WORLD.height, screenY / scale)),
  };
}
