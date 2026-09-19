import { getTileBounds } from "./chalkboardTileLayer.js";
import { boundsIntersect } from "./chalkboardModel.js";

const sameEntries = (a, b) => a?.length === b?.length && a.every((entry, index) => entry === b[index]);

// Send one visible tile at a time. Scrolling replaces the waiting queue, and
// stale replies are closed instead of retaining bitmaps from old views.
export class ChalkboardAsyncRaster {
  constructor(cache, worker, onChange) {
    this.cache = cache;
    this.worker = worker;
    this.onChange = onChange;
    this.wanted = new Map();
    this.active = null;
    this.sequence = 0;
    this.fonts = [];
    this.ratio = 1.35;
    this.generation = 0;
    this.failed = false;
    worker.onmessage = ({ data }) => this.receive(data);
    worker.onerror = () => this.fail();
  }

  setFonts(fonts) {
    if (this.fonts === fonts) return;
    this.fonts = fonts;
    this.clear();
  }

  update(index, tiles, ratio = 1.35) {
    this.ratio = Math.min(1.35, Math.max(.25, ratio));
    this.wanted = new Map(tiles.map(([x, y]) => [`${x}:${y}`, { x, y, entries: index.get(`${x}:${y}`) }])
      .filter(([, tile]) => tile.entries?.length));
    for (const key of this.cache.entries.keys()) {
      if (key.startsWith("worker|") && !this.wanted.has(key.slice(7))) this.cache.delete(key);
    }
    this.pump();
  }

  current(tile) {
    const cached = this.cache.get(`worker|${tile.x}:${tile.y}`);
    return cached?.ratio === this.ratio && cached.generation === this.generation && sameEntries(cached?.entries, tile.entries) ? cached : null;
  }

  getTile(x, y) {
    const tile = this.wanted.get(`${x}:${y}`);
    return tile ? this.current(tile)?.canvas : null;
  }

  get pending() { return !this.failed && [...this.wanted.values()].some(tile => !this.current(tile)); }

  pump() {
    if (this.active || this.failed) return;
    const tile = [...this.wanted.values()].find(tile => !this.current(tile));
    if (!tile) return;
    this.active = { ...tile, id: ++this.sequence, ratio: this.ratio, generation: this.generation };
    const bounds = getTileBounds(tile.x, tile.y);
    try {
      this.worker.postMessage({ id: this.active.id, groups: tile.entries.map(({ element }) => ({
        id: element.id, items: element.items.filter(item => boundsIntersect(item.bounds, bounds)),
      })), bounds, fonts: this.fonts, ratio: this.ratio });
    } catch (_) { this.fail(); }
  }

  receive({ id, bitmap, error }) {
    if (!this.active || id !== this.active.id) { bitmap?.close(); return; }
    const tile = this.active;
    this.active = null;
    if (error) { bitmap?.close(); this.fail(); return; }
    const wanted = this.wanted.get(`${tile.x}:${tile.y}`);
    if (tile.ratio === this.ratio && tile.generation === this.generation && sameEntries(wanted?.entries, tile.entries)) {
      const key = `worker|${tile.x}:${tile.y}`;
      this.cache.delete(key);
      this.cache.set(key, { canvas: bitmap, entries: tile.entries, ratio: tile.ratio, generation: tile.generation });
    } else bitmap.close();
    this.onChange();
    this.pump();
  }

  clear() {
    this.generation++;
    this.wanted.clear();
    // In-flight responses cannot match these retired entry objects.
    for (const key of this.cache.entries.keys()) if (key.startsWith("worker|")) this.cache.delete(key);
  }

  fail() {
    if (this.failed) return;
    this.failed = true;
    this.worker.terminate();
    this.active = null;
    this.clear();
    this.onChange();
  }

  destroy() {
    this.failed = true;
    this.worker.terminate();
    this.worker.onmessage = this.worker.onerror = null;
    this.active = null;
    this.clear();
  }
}
