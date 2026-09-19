import {
  CHALKBOARD_TILE_SIZE, CHALKBOARD_WORLD, boundsIntersect,
  getElementBounds, getTextHandles, getTextHeight, localToWorld,
} from "./chalkboardModel.js";
import { drawChalkElement } from "./chalkboardPaint.js";
import { ChalkboardErasurePreview } from "./chalkboardErasurePreview.js";
import { ChalkboardSpongeLayer } from "./chalkboardSpongeLayer.js";
import { getChalkboardCanvasWindow } from "./chalkboardCanvasWindow.js";
import { ChalkboardAsyncRaster } from "./chalkboardAsyncRaster.js";
import {
  ChalkboardTileCache, ChalkboardTileLayer, createChalkboardTile, TILE_RASTER_RATIO,
} from "./chalkboardTileLayer.js";

// Only rendering data matters when reusing a draft confirmed by the server.
// Pressure and client IDs do not affect the existing chalk texture.
function visualSignature(elements) {
  return JSON.stringify(elements.map(element => element.type === "erase"
    ? [element.type, element.size, element.points.map(point => [point.x, point.y])]
    : element.type === "stroke"
    ? [element.type, element.seed, element.color.toLowerCase(), element.size,
      element.points.map(point => [point.x, point.y])]
    : [element.type, element.seed, element.text, element.cx, element.cy,
      element.width, element.fontSize, element.scale, element.angle, element.font, element.lineBreaks]));
}

function prepareCanvas(canvas, width, height) {
  const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const pixelWidth = Math.max(1, Math.round(width * ratio));
  const pixelHeight = Math.max(1, Math.round(height * ratio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  return context;
}

function drawSelection(context, element, viewX, scale) {
  if (!element || element.type !== "text") return;
  const halfWidth = element.width / 2;
  const halfHeight = getTextHeight(element) / 2;
  const corners = [
    localToWorld(element, -halfWidth, -halfHeight),
    localToWorld(element, halfWidth, -halfHeight),
    localToWorld(element, halfWidth, halfHeight),
    localToWorld(element, -halfWidth, halfHeight),
  ];
  const handles = getTextHandles(element);
  const toScreen = (point) => ({ x: (point.x - viewX) * scale, y: point.y * scale });
  const screenCorners = corners.map(toScreen);
  const rotate = toScreen(handles.rotate);
  const rotateAnchor = toScreen(handles.rotateAnchor);
  const scaleHandle = toScreen(handles.scale);
  const handleRadius = Math.max(8, Math.min(13, 10 * scale));

  context.save();
  context.strokeStyle = "rgba(255, 223, 106, 0.95)";
  context.fillStyle = "rgba(13, 43, 38, 0.92)";
  context.lineWidth = 2;
  context.setLineDash([7, 5]);
  context.beginPath();
  screenCorners.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
  context.stroke();
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(rotateAnchor.x, rotateAnchor.y);
  context.lineTo(rotate.x, rotate.y);
  context.stroke();
  for (const point of [rotate, scaleHandle]) {
    context.beginPath();
    context.arc(point.x, point.y, handleRadius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  context.fillStyle = "#ffe36e";
  context.font = `700 ${Math.max(12, handleRadius * 1.45)}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("↻", rotate.x, rotate.y + 0.5);
  context.fillText("↘", scaleHandle.x, scaleHandle.y + 0.5);
  context.restore();
}

export class ChalkboardRenderer {
  constructor(canvas, { worker, onChange = () => {} } = {}) {
    this.canvas = canvas;
    this.interventions = [];
    this.revision = null;
    this.scope = "";
    this.records = new Map();
    this.promotions = new Map();
    this.tileCache = new ChalkboardTileCache();
    // Published worker tiles use screen resolution and retain only the current
    // canvas window. Draft undo tiles must not evict an in-flight publication.
    this.asyncRaster = worker ? new ChalkboardAsyncRaster(new ChalkboardTileCache(96), worker, onChange) : null;
    this.loading = false;
    this.published = new ChalkboardTileLayer(this.tileCache, "published",
      (context, group, bounds) => this.paintPublished(context, group, bounds), false);
    this.draftBefore = new ChalkboardTileLayer(this.tileCache, "draft-before");
    this.draftSelected = new ChalkboardTileLayer(this.tileCache, "draft-selected");
    this.draftAfter = new ChalkboardTileLayer(this.tileCache, "draft-after");
    this.draftLayers = [this.draftBefore, this.draftSelected, this.draftAfter];
    this.draftSplitId = "";
    this.lastView = null;
    this.erasurePreview = new ChalkboardErasurePreview();
    this.baseInterventions = [];
    this.erasureTile = null;
    this.sponge = new ChalkboardSpongeLayer(this.tileCache, (context, group, bounds) => this.paintPublished(context, group, bounds));
    this.spongeMode = false;
    this.canvasWindow = null;
  }

  paintPublished(context, group, bounds) {
    const key = `${bounds.minX / CHALKBOARD_TILE_SIZE}:${bounds.minY / CHALKBOARD_TILE_SIZE}`;
    const raster = this.promotions.get(group.id)?.tiles.get(key);
    if (raster) {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(raster, 0, 0);
      context.restore();
      return;
    }
    const hasErasures = group.items.some(item => item.element.type === "erase");
    // Erase on an isolated contribution tile, never on the shared board tile:
    // marks underneath and above, by other authors, stay exactly as they were.
    let paintContext = context;
    if (hasErasures) {
      this.erasureTile ||= createChalkboardTile();
      paintContext = this.erasureTile.getContext("2d");
      paintContext.setTransform(1, 0, 0, 1, 0, 0);
      paintContext.clearRect(0, 0, this.erasureTile.width, this.erasureTile.height);
      paintContext.setTransform(TILE_RASTER_RATIO, 0, 0, TILE_RASTER_RATIO, 0, 0);
    }
    for (const item of group.items) {
      if (boundsIntersect(item.bounds, bounds)) {
        drawChalkElement(paintContext, item.element, bounds.minX, bounds.minY, bounds);
      }
    }
    if (hasErasures) {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(this.erasureTile, 0, 0);
      context.restore();
    }
  }

  setInterventions(interventions, revision, scope = "") {
    // A worker completion redraws the same snapshot. Do not replace a stable
    // erasure preview with its base and invalidate the job that just finished.
    if (interventions === this.baseInterventions && revision === this.revision && scope === this.scope) return;
    this.baseInterventions = interventions;
    this.updateInterventions(interventions, revision, scope);
  }

  updateInterventions(interventions, revision, scope = "") {
    if (scope === this.scope && revision === this.revision && interventions === this.interventions) return;
    if (scope !== this.scope) {
      this.asyncRaster?.clear();
      this.sponge.clear();
      this.published.clear();
      this.records.clear();
      this.promotions.clear();
    }
    this.scope = scope;
    this.interventions = Array.isArray(interventions) ? interventions : [];
    this.revision = revision;
    const records = new Map();
    const groups = [];
    for (const source of this.interventions) {
      const previous = this.records.get(source.id);
      let record = previous;
      if (previous?.source !== source) {
        // Poll responses deserialize new objects, including unchanged drawings.
        // Keep their canonical references so their existing tiles remain valid.
        const signature = JSON.stringify([source.bounds, source.elements, source.canErase]);
        const group = previous?.signature === signature ? previous.group : {
          ...source,
          type: "group",
          items: (source.elements || []).map(element => ({ element, bounds: getElementBounds(element) })),
        };
        record = { source, signature, group };
      }
      records.set(source.id, record);
      groups.push(record.group);
    }
    this.records = records;
    this.published.setElements(groups);
    // Consume the confirmed draft bitmaps now, before the editor clears them.
    // Only tiles actually captured in the visible draft are eagerly composed.
    for (const [id, promotion] of this.promotions) {
      const record = records.get(id);
      if (!record || visualSignature(record.source.elements) !== promotion.signature) {
        this.promotions.delete(id);
      }
    }
    for (const promotion of this.promotions.values()) {
      for (const key of promotion.tiles.keys()) {
        const [x, y] = key.split(":").map(Number);
        this.published.getTile(x, y);
      }
    }
    this.promotions.clear();
  }

  setDraftElements(elements, selectedTextId) {
    // A mask affects every earlier draft element, including a selected text.
    // Compose them together so it cannot erase the published layer underneath.
    if (elements.some(element => element.type === "erase")) selectedTextId = this.draftSplitId = "";
    if (selectedTextId) this.draftSplitId = selectedTextId;
    const selectedIndex = elements.findIndex(element => element.id === this.draftSplitId && element.type === "text");
    if (selectedIndex < 0) {
      this.draftSplitId = "";
      this.draftBefore.setElements(elements);
      this.draftSelected.setElements([]);
      this.draftAfter.setElements([]);
      return;
    }
    // Keep the text's original stacking order while moving it. Retain the
    // split after deselection, so picking up the chalk again needs no rebuild.
    this.draftBefore.setElements(elements.slice(0, selectedIndex));
    this.draftSelected.setElements([elements[selectedIndex]]);
    this.draftAfter.setElements(elements.slice(selectedIndex + 1));
  }

  visibleTiles({ width, scale, scrollLeft }) {
    const firstX = Math.max(0, Math.floor(scrollLeft / scale / CHALKBOARD_TILE_SIZE));
    const lastX = Math.min(
      Math.floor(CHALKBOARD_WORLD.width / CHALKBOARD_TILE_SIZE),
      Math.floor((scrollLeft + width) / scale / CHALKBOARD_TILE_SIZE)
    );
    const tiles = [];
    for (let y = 0; y <= Math.floor(CHALKBOARD_WORLD.height / CHALKBOARD_TILE_SIZE); y++) {
      for (let x = firstX; x <= lastX; x++) tiles.push([x, y]);
    }
    return tiles;
  }

  captureDraft(elements, selectedTextId = "") {
    if (!this.lastView || !elements.length) return null;
    this.setDraftElements(elements, selectedTextId);
    const tiles = new Map();
    for (const [x, y] of this.visibleTiles(this.lastView)) {
      const key = `${x}:${y}`;
      if (!this.draftLayers.some(layer => layer.index.has(key))) continue;
      const copy = createChalkboardTile();
      const context = copy.getContext("2d");
      for (const layer of this.draftLayers) {
        const tile = layer.getTile(x, y);
        if (tile) context.drawImage(tile, 0, 0);
      }
      tiles.set(key, copy);
      // Bound temporary memory while an HTTP publication is in flight.
      if (tiles.size >= 16) break;
    }
    return { scope: this.scope, signature: visualSignature(elements), tiles };
  }

  reuseDraftForIntervention(intervention, draft) {
    if (this.asyncRaster && !this.asyncRaster.failed) return false;
    if (!draft || !intervention?.id || draft.scope !== this.scope ||
      visualSignature(intervention.elements) !== draft.signature) return false;
    this.promotions.set(intervention.id, draft);
    return true;
  }

  invalidateText() {
    this.asyncRaster?.clear();
    this.sponge.clear();
    for (const [key, tile] of this.tileCache.entries) {
      if (tile.entries.some(({ element }) => element.type === "text" ||
        element.items?.some(item => item.element.type === "text"))) this.tileCache.delete(key);
    }
  }

  render({ width, height, scale, scrollLeft, draftElements = [], selectedTextId = "", onlyOwn = false }) {
    if (!this.canvas || width <= 0 || height <= 0 || scale <= 0) return;
    const context = prepareCanvas(this.canvas, width, height);
    const viewX = scrollLeft / scale;
    this.lastView = { width, height, scale, scrollLeft };
    if (onlyOwn) this.sponge.update(this.baseInterventions, draftElements);
    else {
      if (this.spongeMode) this.sponge.clear();
      this.updateInterventions(this.erasurePreview.apply(this.baseInterventions, draftElements), this.revision, this.scope);
    }
    this.spongeMode = onlyOwn;
    this.setDraftElements(draftElements, selectedTextId);
    context.imageSmoothingEnabled = true;
    const tiles = this.visibleTiles(this.lastView);
    const asynchronous = this.asyncRaster && !this.asyncRaster.failed;
    this.sponge.baseRaster = asynchronous ? this.asyncRaster : null;
    if (asynchronous) this.asyncRaster.update(onlyOwn ? this.sponge.base.index : this.published.index, tiles, scale * Math.min(2, window.devicePixelRatio || 1));
    for (const [tileX, tileY] of tiles) {
      for (const layer of [onlyOwn ? this.sponge : asynchronous ? this.asyncRaster : this.published, ...this.draftLayers]) {
        const tile = layer.getTile(tileX, tileY);
        if (!tile) continue;
        context.drawImage(
          tile,
          (tileX * CHALKBOARD_TILE_SIZE - viewX) * scale,
          tileY * CHALKBOARD_TILE_SIZE * scale,
          CHALKBOARD_TILE_SIZE * scale,
          CHALKBOARD_TILE_SIZE * scale
        );
      }
    }
    const selected = draftElements.find(element => element.id === selectedTextId);
    this.loading = !!asynchronous && this.asyncRaster.pending;
    drawSelection(context, selected, viewX, scale);
  }

  renderWorldView(view) {
    const window = getChalkboardCanvasWindow(view, this.canvasWindow);
    this.render({ ...view, width: window.width, scrollLeft: window.left });
    // The pixels and their world anchor are changed together in this frame.
    // No CSS translation attempts to catch up with the native scroll offset.
    this.canvas.style.left = `${window.left}px`;
    this.canvasWindow = window;
  }

  destroy() {
    this.asyncRaster?.destroy();
    this.tileCache.clear();
    this.published.clear();
    for (const layer of this.draftLayers) layer.clear();
    this.records.clear();
    this.promotions.clear();
    this.interventions = [];
    this.baseInterventions = [];
    this.erasurePreview.clear();
    this.sponge.clear();
    if (this.erasureTile) this.erasureTile.width = this.erasureTile.height = 0;
    this.erasureTile = null;
    this.lastView = null;
    this.canvasWindow = null;
    this.canvas = null;
  }
}
