const EMPTY_TRACE = {
  currentTiles: [],
  highlightPath: [],
};

let snapshot = EMPTY_TRACE;
const listeners = new Set();
const traceTileElements = new Map();
let highlightedTiles = new Set();
let highlightedTileOrder = new Map();
const TRACE_GRADIENT_MAX_ORDER = 15;

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function emit(next) {
  if (
    arraysEqual(snapshot.currentTiles, next.currentTiles) &&
    arraysEqual(snapshot.highlightPath, next.highlightPath)
  ) {
    return;
  }
  snapshot = next;
  applyTraceTileClasses(next.highlightPath);
  listeners.forEach((listener) => listener());
}

function getHighlightSet(highlightPath) {
  if (!Array.isArray(highlightPath) || !highlightPath.length) return new Set();
  return new Set(highlightPath);
}

function getHighlightOrderMap(highlightPath) {
  const orderMap = new Map();
  if (!Array.isArray(highlightPath) || !highlightPath.length) return orderMap;
  highlightPath.forEach((boardIndex, order) => {
    if (!Number.isFinite(boardIndex) || orderMap.has(boardIndex)) return;
    orderMap.set(boardIndex, {
      order,
      progress: Math.min(1, order / TRACE_GRADIENT_MAX_ORDER),
    });
  });
  return orderMap;
}

function getTraceTileElements(boardIndex) {
  let elements = traceTileElements.get(boardIndex);
  if (!elements) {
    elements = new Set();
    traceTileElements.set(boardIndex, elements);
  }
  return elements;
}

function applyTraceTileStyle(element, traceInfo) {
  const used = Boolean(traceInfo);
  element?.classList?.toggle("tile-used", used);
  if (!element?.style) return;
  if (!used) {
    element.style.removeProperty("--trace-order");
    element.style.removeProperty("--trace-progress");
    element.style.removeProperty("--trace-hue");
    element.style.removeProperty("--trace-bg-top");
    element.style.removeProperty("--trace-bg-mid");
    element.style.removeProperty("--trace-bg-bottom");
    element.style.removeProperty("--trace-glow");
    element.style.removeProperty("--trace-ring");
    return;
  }
  const progress = Number.isFinite(traceInfo.progress) ? traceInfo.progress : 0;
  const hue = 215 + progress * 55;
  element.style.setProperty("--trace-order", String(traceInfo.order ?? 0));
  element.style.setProperty("--trace-progress", progress.toFixed(3));
  element.style.setProperty("--trace-hue", hue.toFixed(1));
  element.style.setProperty("--trace-bg-top", `hsl(${hue.toFixed(1)} 78% 38%)`);
  element.style.setProperty("--trace-bg-mid", `hsl(${(hue + 8).toFixed(1)} 84% 48%)`);
  element.style.setProperty("--trace-bg-bottom", `hsl(${(hue + 16).toFixed(1)} 90% 68%)`);
  element.style.setProperty("--trace-glow", `hsla(${hue.toFixed(1)}, 78%, 42%, 0.34)`);
  element.style.setProperty("--trace-ring", `hsla(${hue.toFixed(1)}, 86%, 58%, 0.5)`);
}

function applyTraceTileClasses(highlightPath) {
  highlightedTiles = getHighlightSet(highlightPath);
  highlightedTileOrder = getHighlightOrderMap(highlightPath);
  traceTileElements.forEach((elements, boardIndex) => {
    const traceInfo = highlightedTileOrder.get(boardIndex) || null;
    elements.forEach((element) => {
      applyTraceTileStyle(element, traceInfo);
    });
  });
}

export function subscribeTraceState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTraceStateSnapshot() {
  return snapshot;
}

export function isTraceTileHighlighted(boardIndex) {
  return highlightedTiles.has(boardIndex);
}

export function syncTraceTileClasses() {
  applyTraceTileClasses(snapshot.highlightPath);
}

export function syncTraceTilesInContainer(container, highlightPath = snapshot.highlightPath) {
  if (!container || typeof container.querySelectorAll !== "function") return;
  const orderMap = getHighlightOrderMap(highlightPath);
  container.querySelectorAll("[data-board-index]").forEach((element) => {
    const boardIndex = Number(element?.getAttribute?.("data-board-index"));
    const traceInfo = Number.isFinite(boardIndex) ? orderMap.get(boardIndex) || null : null;
    applyTraceTileStyle(element, traceInfo);
  });
}

export function setTraceState(next) {
  emit({
    currentTiles: normalizeArray(next?.currentTiles),
    highlightPath: normalizeArray(next?.highlightPath),
  });
}

export function clearTraceState() {
  emit(EMPTY_TRACE);
}

export function registerTraceTile(boardIndex, element) {
  if (!Number.isFinite(boardIndex) || !element) return () => {};
  const elements = getTraceTileElements(boardIndex);
  elements.add(element);
  applyTraceTileStyle(element, highlightedTileOrder.get(boardIndex) || null);
  return () => {
    const currentElements = traceTileElements.get(boardIndex);
    if (!currentElements) return;
    applyTraceTileStyle(element, null);
    currentElements.delete(element);
    if (!currentElements.size) traceTileElements.delete(boardIndex);
  };
}
