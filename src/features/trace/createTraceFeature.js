const EMPTY_LIST = Object.freeze([]);
const EMPTY_TRACE = Object.freeze({
  currentTiles: EMPTY_LIST,
  highlightPath: EMPTY_LIST,
});
const TRACE_GRADIENT_MAX_ORDER = 15;

function normalizeArray(value) {
  return Array.isArray(value) ? value : EMPTY_LIST;
}

function arraysEqual(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function getHighlightOrderMap(highlightPath) {
  const orderMap = new Map();
  if (!Array.isArray(highlightPath) || highlightPath.length === 0) return orderMap;
  highlightPath.forEach((boardIndex, order) => {
    if (!Number.isFinite(boardIndex) || orderMap.has(boardIndex)) return;
    orderMap.set(boardIndex, {
      order,
      progress: Math.min(1, order / TRACE_GRADIENT_MAX_ORDER),
    });
  });
  return orderMap;
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

function traceInfoEqual(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.order === right.order && left.progress === right.progress;
}

export function createTraceFeature({ scope }) {
  let highlightedTileOrder = new Map();
  let highlightedTiles = new Set();
  let snapshot = EMPTY_TRACE;
  let stopped = false;
  const listeners = new Set();
  const traceTileElements = new Map();

  function applyTraceTileClasses(highlightPath) {
    const previousOrder = highlightedTileOrder;
    const nextOrder = getHighlightOrderMap(highlightPath);
    const changedIndices = new Set([...previousOrder.keys(), ...nextOrder.keys()]);
    highlightedTiles = new Set(nextOrder.keys());
    highlightedTileOrder = nextOrder;
    changedIndices.forEach((boardIndex) => {
      const previousTraceInfo = previousOrder.get(boardIndex) || null;
      const nextTraceInfo = nextOrder.get(boardIndex) || null;
      if (traceInfoEqual(previousTraceInfo, nextTraceInfo)) return;
      traceTileElements.get(boardIndex)?.forEach((element) => {
        applyTraceTileStyle(element, nextTraceInfo);
      });
    });
  }

  function emit(next) {
    if (stopped) return false;
    if (
      arraysEqual(snapshot.currentTiles, next.currentTiles) &&
      arraysEqual(snapshot.highlightPath, next.highlightPath)
    ) {
      return false;
    }
    snapshot = next;
    applyTraceTileClasses(next.highlightPath);
    for (const listener of [...listeners]) listener();
    return true;
  }

  function setTraceState(next) {
    return emit({
      currentTiles: normalizeArray(next?.currentTiles),
      highlightPath: normalizeArray(next?.highlightPath),
    });
  }

  function clearTraceState() {
    return emit(EMPTY_TRACE);
  }

  function getSnapshot() {
    return snapshot;
  }

  function isTraceTileHighlighted(boardIndex) {
    return highlightedTiles.has(boardIndex);
  }

  function registerTraceTile(boardIndex, element) {
    if (stopped || !Number.isFinite(boardIndex) || !element) return () => {};
    let elements = traceTileElements.get(boardIndex);
    if (!elements) {
      elements = new Set();
      traceTileElements.set(boardIndex, elements);
    }
    elements.add(element);
    applyTraceTileStyle(element, highlightedTileOrder.get(boardIndex) || null);
    return () => {
      const currentElements = traceTileElements.get(boardIndex);
      if (!currentElements) return;
      applyTraceTileStyle(element, null);
      currentElements.delete(element);
      if (currentElements.size === 0) traceTileElements.delete(boardIndex);
    };
  }

  function subscribe(listener) {
    if (stopped || typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function start() {
    stopped = false;
    scope.add(() => {
      applyTraceTileClasses(EMPTY_LIST);
      for (const elements of traceTileElements.values()) {
        for (const element of elements) applyTraceTileStyle(element, null);
      }
      stopped = true;
      snapshot = EMPTY_TRACE;
      listeners.clear();
      traceTileElements.clear();
      highlightedTiles = new Set();
      highlightedTileOrder = new Map();
    });
  }

  return Object.freeze({
    clearTraceState,
    getSnapshot,
    isTraceTileHighlighted,
    registerTraceTile,
    setTraceState,
    start,
    subscribe,
  });
}
