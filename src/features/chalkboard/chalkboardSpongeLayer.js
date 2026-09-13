import { CHALKBOARD_WORLD, CHALKBOARD_TILE_SIZE, getElementBounds } from "./chalkboardModel.js";
import { ChalkboardTileLayer } from "./chalkboardTileLayer.js";
import { drawChalkElement } from "./chalkboardPaint.js";
import { ChalkboardErasurePreview } from "./chalkboardErasurePreview.js";

// Bake the author's visible ink once, then erase directly in these tile
// bitmaps. Pointer frames never replay chalk particles or serialize drawings.
export class ChalkboardSpongeLayer {
  constructor(cache, paintPublished) {
    this.base = new ChalkboardTileLayer(cache, "sponge-base", paintPublished, false);
    this.layer = new ChalkboardTileLayer(cache, "sponge-live", (context, element, bounds, start) => {
      if (element.id === "sponge-base") {
        const tile = this.base.getTile(bounds.minX / CHALKBOARD_TILE_SIZE, bounds.minY / CHALKBOARD_TILE_SIZE);
        if (tile) {
          context.save();
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.drawImage(tile, 0, 0);
          context.restore();
        }
      } else drawChalkElement(context, element, bounds.minX, bounds.minY, bounds, start);
    });
    this.source = null;
    this.seen = [];
    this.deltas = [];
    this.anchor = null;
  }

  update(interventions, elements) {
    const masks = elements.filter(element => element.type === "erase");
    const reset = this.source !== interventions || this.seen.length > masks.length ||
      this.seen.some((record, index) => masks[index] !== record.mask || masks[index].points.length < record.count);
    if (reset) {
      this.clear();
      this.source = interventions;
      // Freeze the baseline, including existing draft erasures. New strokes
      // can then be appended, and undo rebuilds this baseline exactly once.
      const frozenMasks = masks.map(mask => ({ ...mask, points: mask.points.slice(), targetIds: [...mask.targetIds] }));
      const preview = new ChalkboardErasurePreview().apply(interventions, frozenMasks);
      this.base.setElements(preview.filter(source => source.canErase).map(source => ({
        ...source, type: "group", items: source.elements.map(element => ({ element, bounds: getElementBounds(element) })),
      })));
      this.anchor = { id: "sponge-base", type: "group", bounds: { minX: 0, minY: 0, maxX: CHALKBOARD_WORLD.width, maxY: CHALKBOARD_WORLD.height } };
      this.seen = masks.map(mask => ({ mask, count: mask.points.length, baseline: mask.points.length, delta: null }));
    } else {
      for (let index = 0; index < masks.length; index++) {
        const mask = masks[index];
        let record = this.seen[index];
        if (!record) {
          record = { mask, count: 0, baseline: 0, delta: mask };
          this.seen.push(record);
          this.deltas.push(mask);
        } else if (record.baseline && mask.points.length > record.count) {
          if (!record.delta) {
            record.delta = { ...mask, points: mask.points.slice(record.baseline - 1) };
            this.deltas.push(record.delta);
          } else record.delta.points.push(...mask.points.slice(record.count));
        }
        record.count = mask.points.length;
      }
    }
    this.layer.setElements([this.anchor, ...this.deltas]);
  }

  getTile(x, y) { return this.layer.getTile(x, y); }

  clear() {
    this.base.clear();
    this.layer.clear();
    this.source = null;
    this.seen = [];
    this.deltas = [];
    this.anchor = null;
  }
}
