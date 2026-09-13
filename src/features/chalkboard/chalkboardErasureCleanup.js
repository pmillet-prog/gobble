import { CHALKBOARD_TILE_SIZE, CHALKBOARD_WORLD, boundsIntersect, getElementBounds } from "./chalkboardModel.js";
import { createChalkboardTile, getTileBounds, TILE_RASTER_RATIO } from "./chalkboardTileLayer.js";
import { drawChalkElement } from "./chalkboardPaint.js";
import { ChalkboardErasurePreview } from "./chalkboardErasurePreview.js";

// Count actual ink, including font glyphs and chalk grain, not vector bounding
// boxes. Keep at most 32 world pixels and 0.5% of the original ink as dust.
const MAX_DUST_AREA = 32;
export function isChalkboardDust(remaining, original) {
  return original > 0 && remaining <= Math.min(MAX_DUST_AREA, original * .005);
}

export function chalkboardInkArea(data) {
  let alpha = 0;
  for (let index = 3; index < data.length; index += 4) alpha += data[index];
  return alpha / (255 * TILE_RASTER_RATIO ** 2);
}

async function nearlyEmpty(elements, canvas) {
  const items = elements.map(element => ({ element, bounds: getElementBounds(element) }));
  const ink = items.filter(item => item.element.type !== "erase");
  if (!ink.length) return true;
  const bounds = ink.reduce((all, item) => ({ minX: Math.min(all.minX, item.bounds.minX), minY: Math.min(all.minY, item.bounds.minY), maxX: Math.max(all.maxX, item.bounds.maxX), maxY: Math.max(all.maxY, item.bounds.maxY) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const firstX = Math.max(0, Math.floor(bounds.minX / CHALKBOARD_TILE_SIZE));
  const lastX = Math.min(Math.floor(CHALKBOARD_WORLD.width / CHALKBOARD_TILE_SIZE), Math.floor(bounds.maxX / CHALKBOARD_TILE_SIZE));
  const firstY = Math.max(0, Math.floor(bounds.minY / CHALKBOARD_TILE_SIZE));
  const lastY = Math.min(Math.floor(CHALKBOARD_WORLD.height / CHALKBOARD_TILE_SIZE), Math.floor(bounds.maxY / CHALKBOARD_TILE_SIZE));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  let remaining = 0, original = 0;
  const measure = (entries, tileBounds) => {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(TILE_RASTER_RATIO, 0, 0, TILE_RASTER_RATIO, 0, 0);
    context.save();
    context.beginPath();
    context.rect(0, 0, Math.min(CHALKBOARD_TILE_SIZE, CHALKBOARD_WORLD.width - tileBounds.minX), Math.min(CHALKBOARD_TILE_SIZE, CHALKBOARD_WORLD.height - tileBounds.minY));
    context.clip();
    for (const item of entries) if (boundsIntersect(item.bounds, tileBounds)) drawChalkElement(context, item.element, tileBounds.minX, tileBounds.minY, tileBounds);
    context.restore();
    return chalkboardInkArea(context.getImageData(0, 0, canvas.width, canvas.height).data);
  };
  for (let y = firstY; y <= lastY; y++) {
    for (let x = firstX; x <= lastX; x++) {
      const tileBounds = getTileBounds(x, y);
      if (!ink.some(item => boundsIntersect(item.bounds, tileBounds))) continue;
      // Let input and the saving indicator paint between bounded tile jobs.
      await new Promise(resolve => requestAnimationFrame(resolve));
      remaining += measure(items, tileBounds);
      if (remaining > MAX_DUST_AREA) return false;
      original += measure(ink, tileBounds);
    }
  }
  return isChalkboardDust(remaining, original);
}

export async function collectChalkboardErasureCleanup(interventions, draftElements, { loadedFonts = [] } = {}) {
  const canvas = createChalkboardTile();
  const preview = new ChalkboardErasurePreview().apply(interventions, draftElements);
  const removeIds = [];
  // Unloaded fonts cannot supply trustworthy pixel coverage. Preserve those
  // texts rather than making a destructive decision from a fallback face.
  const fontIds = new Set(loadedFonts.map(font => font.id));
  const canMeasure = elements => elements.every(element => element.type !== "text" || fontIds.has(element.font));
  try {
    for (let index = 0; index < preview.length; index++) {
      const source = preview[index];
      if (source === interventions[index] || !canMeasure(source.elements)) continue;
      if (await nearlyEmpty(source.elements, canvas)) removeIds.push(source.id);
    }
    const draftEmpty = canMeasure(draftElements) && await nearlyEmpty(draftElements, canvas);
    return { removeIds, draftEmpty };
  } finally {
    canvas.width = canvas.height = 0;
  }
}
