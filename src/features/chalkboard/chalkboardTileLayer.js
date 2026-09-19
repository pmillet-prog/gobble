import { CHALKBOARD_TILE_SIZE, CHALKBOARD_WORLD, getElementBounds } from "./chalkboardModel.js";
import { drawChalkElement } from "./chalkboardPaint.js";

export const TILE_RASTER_RATIO = 1.35;
const LAST_TILE_X = Math.floor(CHALKBOARD_WORLD.width / CHALKBOARD_TILE_SIZE);
const LAST_TILE_Y = Math.floor(CHALKBOARD_WORLD.height / CHALKBOARD_TILE_SIZE);

export function getTileBounds(tileX, tileY) {
  return {
    minX: tileX * CHALKBOARD_TILE_SIZE,
    minY: tileY * CHALKBOARD_TILE_SIZE,
    maxX: (tileX + 1) * CHALKBOARD_TILE_SIZE,
    maxY: (tileY + 1) * CHALKBOARD_TILE_SIZE,
  };
}

export function createChalkboardTile() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.round(CHALKBOARD_TILE_SIZE * TILE_RASTER_RATIO);
  return canvas;
}

// All layers share one LRU budget. A long editing session must not retain a
// separate full-size bitmap for every stroke, undo snapshot or visited area.
export class ChalkboardTileCache {
  constructor(limit = 72) {
    this.limit = limit;
    this.entries = new Map();
  }

  get(key) {
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
    }
    return cached;
  }

  set(key, value) {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.limit) this.delete(this.entries.keys().next().value);
  }

  delete(key) {
    const cached = this.entries.get(key);
    this.entries.delete(key);
    if (cached?.canvas.close) cached.canvas.close();
    else if (cached) cached.canvas.width = cached.canvas.height = 0;
  }

  clear() {
    for (const key of this.entries.keys()) this.delete(key);
  }
}

function paintElement(context, element, bounds, startPoint) {
  drawChalkElement(context, element, bounds.minX, bounds.minY, bounds, startPoint);
}

export class ChalkboardTileLayer {
  constructor(cache, name, paint = paintElement, remember = true) {
    this.cache = cache;
    this.prefix = `${name}|`;
    this.paint = paint;
    this.remember = remember;
    this.version = 0;
    this.index = new Map();
    this.metadata = new WeakMap();
  }

  describe(element) {
    const previous = this.metadata.get(element);
    const points = element.type === "stroke" || element.type === "erase" ? element.points : null;
    const pointCount = points?.length || 0;
    if (previous && previous.points === points && previous.pointCount === pointCount) return previous;
    let bounds;
    // Only the current, unpublished stroke is mutable, and only by appending
    // points. Completed elements and history snapshots are shared immutably.
    if (previous && points === previous.points && pointCount > previous.pointCount) {
      bounds = { ...previous.bounds };
      const radius = Number(element.size || 10) * (element.type === "erase" ? 0.5 : 1.7);
      for (let i = previous.pointCount; i < pointCount; i++) {
        bounds.minX = Math.min(bounds.minX, points[i].x - radius);
        bounds.minY = Math.min(bounds.minY, points[i].y - radius);
        bounds.maxX = Math.max(bounds.maxX, points[i].x + radius);
        bounds.maxY = Math.max(bounds.maxY, points[i].y + radius);
      }
    } else {
      bounds = element.type === "group" ? element.bounds : getElementBounds(element);
    }
    const description = { element, points, pointCount, bounds, version: ++this.version };
    this.metadata.set(element, description);
    return description;
  }

  setElements(elements) {
    const index = new Map();
    for (const element of elements) {
      const entry = this.describe(element);
      const { bounds } = entry;
      if (!bounds) continue;
      const firstX = Math.max(0, Math.floor(bounds.minX / CHALKBOARD_TILE_SIZE));
      const lastX = Math.min(LAST_TILE_X, Math.floor(bounds.maxX / CHALKBOARD_TILE_SIZE));
      const firstY = Math.max(0, Math.floor(bounds.minY / CHALKBOARD_TILE_SIZE));
      const lastY = Math.min(LAST_TILE_Y, Math.floor(bounds.maxY / CHALKBOARD_TILE_SIZE));
      for (let y = firstY; y <= lastY; y++) {
        for (let x = firstX; x <= lastX; x++) {
          const key = `${x}:${y}`;
          if (!index.has(key)) index.set(key, []);
          index.get(key).push(entry);
        }
      }
    }
    this.index = index;
    // Removed/offscreen elements cannot leave stale canvases pinned in cache.
    for (const key of this.cache.entries.keys()) {
      if (key.startsWith(this.prefix) && !index.has(key.slice(this.prefix.length).split("@")[0])) this.cache.delete(key);
    }
  }

  getTile(tileX, tileY) {
    const tileKey = `${tileX}:${tileY}`;
    const entries = this.index.get(tileKey);
    if (!entries?.length) return null;
    const cacheKey = this.prefix + tileKey;
    const cached = this.cache.get(cacheKey);
    let appendFrom = 0;
    let startPoint = 1;
    let canAppend = !!cached && cached.entries.length <= entries.length;
    if (canAppend) {
      for (; appendFrom < cached.entries.length; appendFrom++) {
        const before = cached.entries[appendFrom];
        const after = entries[appendFrom];
        if (before === after) continue;
        if (
          appendFrom === cached.entries.length - 1 &&
          before.element === after.element && before.points && before.points === after.points &&
          before.pointCount <= after.pointCount
        ) {
          startPoint = before.pointCount;
          break;
        }
        canAppend = false;
        break;
      }
    }
    if (canAppend && appendFrom === entries.length) return cached.canvas;
    const checkpointKey = (values) => `${cacheKey}@${values.map(entry => entry.version).join(",")}`;
    if (!canAppend && this.remember) {
      const key = checkpointKey(entries);
      const checkpoint = this.cache.get(key);
      if (checkpoint) {
        this.cache.entries.delete(key);
        this.cache.delete(cacheKey);
        this.cache.set(cacheKey, checkpoint);
        return checkpoint.canvas;
      }
    }

    const canvas = cached?.canvas || createChalkboardTile();
    const context = canvas.getContext("2d");
    if (!canAppend) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      appendFrom = 0;
      startPoint = 1;
    }
    context.setTransform(TILE_RASTER_RATIO, 0, 0, TILE_RASTER_RATIO, 0, 0);
    context.save();
    context.beginPath();
    context.rect(0, 0, CHALKBOARD_TILE_SIZE, CHALKBOARD_TILE_SIZE);
    context.clip();
    const bounds = getTileBounds(tileX, tileY);
    for (let i = appendFrom; i < entries.length; i++) {
      // Save the completed drawing once when a new stroke begins. This makes
      // undo cheap without creating a bitmap for every pointer sample. These
      // checkpoints use the same bounded LRU budget as the visible layers.
      if (this.remember && this.cache.limit > 1 && canAppend && i > 0 && i === cached.entries.length) {
        const previous = entries.slice(0, i);
        const copy = createChalkboardTile();
        copy.getContext("2d").drawImage(canvas, 0, 0);
        this.cache.set(checkpointKey(previous), { canvas: copy, entries: previous });
      }
      this.paint(context, entries[i].element, bounds, i === appendFrom ? startPoint : 1);
    }
    context.restore();
    this.cache.set(cacheKey, { canvas, entries });
    return canvas;
  }

  clear() {
    this.index.clear();
    this.metadata = new WeakMap();
    for (const key of this.cache.entries.keys()) {
      if (key.startsWith(this.prefix)) this.cache.delete(key);
    }
  }
}
