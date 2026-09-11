import {
  CHALKBOARD_TILE_SIZE,
  boundsIntersect,
  getElementBounds,
  getTextHandles,
  getTextHeight,
  localToWorld,
} from "./chalkboardModel.js";

const TILE_RASTER_RATIO = 1.35;
const MAX_CACHED_TILES = 72;

function createRandom(seed) {
  let value = Number(seed) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const value = Number.parseInt(String(hex || "#f4f0df").slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function isSegmentVisible(start, end, size, clipBounds) {
  if (!clipBounds) return true;
  const margin = size * 2;
  return !(
    Math.max(start.x, end.x) + margin < clipBounds.minX ||
    Math.min(start.x, end.x) - margin > clipBounds.maxX ||
    Math.max(start.y, end.y) + margin < clipBounds.minY ||
    Math.min(start.y, end.y) - margin > clipBounds.maxY
  );
}

function drawChalkStroke(context, element, offsetX = 0, offsetY = 0, clipBounds = null) {
  const points = Array.isArray(element.points) ? element.points : [];
  if (points.length < 2) return;
  const rgb = hexToRgb(element.color);
  context.save();
  context.translate(-offsetX, -offsetY);
  context.lineCap = "round";
  context.lineJoin = "round";
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (!isSegmentVisible(start, end, element.size, clipBounds)) continue;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (!length) continue;
    const random = createRandom((element.seed + index * 2654435761) >>> 0);
    const normalX = -dy / length;
    const normalY = dx / length;
    const tangentX = dx / length;
    const tangentY = dy / length;

    context.globalAlpha = 1;
    context.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.30)`;
    context.lineWidth = element.size * 0.72;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();

    const steps = Math.max(1, Math.ceil(length / 1.8));
    const particles = Math.max(14, Math.round(element.size * 2.6));
    for (let step = 0; step < steps; step += 1) {
      const progress = step / steps;
      const x = start.x + dx * progress;
      const y = start.y + dy * progress;
      for (let particle = 0; particle < particles; particle += 1) {
        const spread = (random() - 0.5) * element.size * 1.85;
        const along = (random() - 0.5) * 3.2;
        const particleX = x + normalX * spread + tangentX * along;
        const particleY = y + normalY * spread + tangentY * along;
        const radius = random() * 1.25 + 0.18;
        const alpha = 0.06 + random() * 0.24;
        context.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
        context.beginPath();
        context.arc(particleX, particleY, radius, 0, Math.PI * 2);
        context.fill();
      }
    }

    const outerDust = Math.max(4, Math.round(length / 3.5));
    for (let dust = 0; dust < outerDust; dust += 1) {
      const progress = random();
      const x = start.x + dx * progress;
      const y = start.y + dy * progress;
      const side = random() < 0.5 ? -1 : 1;
      const dustOffset = side * (element.size * 0.45 + random() * element.size * 1.1);
      context.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${0.025 + random() * 0.09})`;
      context.beginPath();
      context.arc(
        x + normalX * dustOffset + (random() - 0.5) * 4,
        y + normalY * dustOffset + (random() - 0.5) * 4,
        random() * 0.9 + 0.12,
        0,
        Math.PI * 2
      );
      context.fill();
    }
  }
  context.restore();
}

// The published tiles keep the detailed particle renderer above. During an
// intervention, however, the visible canvas is refreshed for every pointer
// move: redrawing all particles from the beginning of every draft stroke made
// the cost grow continuously. This lightweight preview preserves the path and
// the chalk softness until publishing rasterizes the full texture once.
function drawDraftChalkStroke(context, element, offsetX = 0, offsetY = 0) {
  const points = Array.isArray(element.points) ? element.points : [];
  if (points.length < 2) return;
  const rgb = hexToRgb(element.color);
  context.save();
  context.translate(-offsetX, -offsetY);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.58)`;
  context.lineWidth = Math.max(1, element.size * 0.78);
  context.stroke();
  context.globalAlpha = 0.24;
  context.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.72)`;
  context.lineWidth = Math.max(0.7, element.size * 0.3);
  context.setLineDash([1.1, 2.3]);
  context.lineDashOffset = -(Number(element.seed) || 0) % 11;
  context.stroke();
  context.restore();
}

function drawChalkText(context, element, offsetX = 0, offsetY = 0) {
  const random = createRandom(element.seed);
  context.save();
  context.translate(element.cx - offsetX, element.cy - offsetY);
  context.rotate(element.angle);
  context.scale(element.scale, element.scale);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `700 ${element.fontSize}px "GobbleCaveat", "Segoe Print", cursive`;
  context.fillStyle = "#f5f2e8";
  context.globalAlpha = 0.76;
  context.fillText(element.text, 0, 0);
  for (let pass = 0; pass < 4; pass += 1) {
    context.globalAlpha = 0.07 + random() * 0.08;
    const jitterX = (random() - 0.5) * 2.8;
    const jitterY = (random() - 0.5) * 2.2;
    context.fillText(element.text, jitterX, jitterY);
  }
  context.restore();
}

function drawElement(context, element, offsetX = 0, offsetY = 0, clipBounds = null) {
  if (element?.type === "stroke") drawChalkStroke(context, element, offsetX, offsetY, clipBounds);
  if (element?.type === "text") drawChalkText(context, element, offsetX, offsetY);
}

function drawDraftElement(context, element, offsetX = 0, offsetY = 0) {
  if (element?.type === "stroke") drawDraftChalkStroke(context, element, offsetX, offsetY);
  if (element?.type === "text") drawChalkText(context, element, offsetX, offsetY);
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
  constructor(canvas) {
    this.canvas = canvas;
    this.interventions = [];
    this.revision = null;
    this.tileCache = new Map();
    this.tileIndex = new Map();
  }

  setInterventions(interventions, revision) {
    if (revision === this.revision && interventions === this.interventions) return;
    this.interventions = Array.isArray(interventions) ? interventions : [];
    this.revision = revision;
    this.tileCache.clear();
    this.tileIndex.clear();
    for (const intervention of this.interventions) {
      const bounds = intervention?.bounds;
      if (!bounds) continue;
      const firstX = Math.max(0, Math.floor(bounds.minX / CHALKBOARD_TILE_SIZE));
      const lastX = Math.max(firstX, Math.floor(bounds.maxX / CHALKBOARD_TILE_SIZE));
      const firstY = Math.max(0, Math.floor(bounds.minY / CHALKBOARD_TILE_SIZE));
      const lastY = Math.max(firstY, Math.floor(bounds.maxY / CHALKBOARD_TILE_SIZE));
      for (let tileY = firstY; tileY <= lastY; tileY += 1) {
        for (let tileX = firstX; tileX <= lastX; tileX += 1) {
          const key = `${tileX}:${tileY}`;
          const entries = this.tileIndex.get(key) || [];
          entries.push(intervention);
          this.tileIndex.set(key, entries);
        }
      }
    }
  }

  getTile(tileX, tileY) {
    const key = `${tileX}:${tileY}`;
    const cached = this.tileCache.get(key);
    if (cached) {
      this.tileCache.delete(key);
      this.tileCache.set(key, cached);
      return cached;
    }
    const tile = document.createElement("canvas");
    tile.width = Math.round(CHALKBOARD_TILE_SIZE * TILE_RASTER_RATIO);
    tile.height = Math.round(CHALKBOARD_TILE_SIZE * TILE_RASTER_RATIO);
    const context = tile.getContext("2d");
    context.setTransform(TILE_RASTER_RATIO, 0, 0, TILE_RASTER_RATIO, 0, 0);
    const tileBounds = {
      minX: tileX * CHALKBOARD_TILE_SIZE,
      minY: tileY * CHALKBOARD_TILE_SIZE,
      maxX: (tileX + 1) * CHALKBOARD_TILE_SIZE,
      maxY: (tileY + 1) * CHALKBOARD_TILE_SIZE,
    };
    context.save();
    context.beginPath();
    context.rect(0, 0, CHALKBOARD_TILE_SIZE, CHALKBOARD_TILE_SIZE);
    context.clip();
    for (const intervention of this.tileIndex.get(key) || []) {
      if (!boundsIntersect(intervention.bounds, tileBounds)) continue;
      for (const element of intervention.elements || []) {
        if (!boundsIntersect(getElementBounds(element), tileBounds)) continue;
        drawElement(context, element, tileBounds.minX, tileBounds.minY, tileBounds);
      }
    }
    context.restore();
    this.tileCache.set(key, tile);
    while (this.tileCache.size > MAX_CACHED_TILES) {
      this.tileCache.delete(this.tileCache.keys().next().value);
    }
    return tile;
  }

  render({ width, height, scale, scrollLeft, draftElements = [], selectedTextId = "" }) {
    if (!this.canvas || width <= 0 || height <= 0 || scale <= 0) return;
    const context = prepareCanvas(this.canvas, width, height);
    const viewX = scrollLeft / scale;
    const visibleWidth = width / scale;
    const firstTileX = Math.max(0, Math.floor(viewX / CHALKBOARD_TILE_SIZE));
    const lastTileX = Math.floor((viewX + visibleWidth) / CHALKBOARD_TILE_SIZE);
    const lastTileY = Math.floor(1000 / CHALKBOARD_TILE_SIZE);
    context.imageSmoothingEnabled = true;
    for (let tileY = 0; tileY <= lastTileY; tileY += 1) {
      for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
        const tile = this.getTile(tileX, tileY);
        context.drawImage(
          tile,
          (tileX * CHALKBOARD_TILE_SIZE - viewX) * scale,
          tileY * CHALKBOARD_TILE_SIZE * scale,
          CHALKBOARD_TILE_SIZE * scale,
          CHALKBOARD_TILE_SIZE * scale
        );
      }
    }
    context.save();
    context.scale(scale, scale);
    for (const element of draftElements) drawDraftElement(context, element, viewX, 0);
    context.restore();
    const selected = draftElements.find((element) => element.id === selectedTextId);
    drawSelection(context, selected, viewX, scale);
  }

  destroy() {
    this.tileCache.clear();
    this.tileIndex.clear();
    this.canvas = null;
  }
}
