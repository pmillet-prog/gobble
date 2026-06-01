const EMPTY_TRACE = {
  currentTiles: [],
  highlightPath: [],
};

let snapshot = EMPTY_TRACE;
const listeners = new Set();

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
  listeners.forEach((listener) => listener());
}

export function subscribeTraceState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTraceStateSnapshot() {
  return snapshot;
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
