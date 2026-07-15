const STALE_CHUNK_RELOAD_KEY = "gobble_stale_chunk_reload_v1";
const STALE_CHUNK_RELOAD_WINDOW_MS = 60 * 1000;

const STALE_CHUNK_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /loading chunk \d+ failed/i,
  /chunkloaderror/i,
  /failed to load module script/i,
  /importing a module script failed/i,
  /is not a valid javascript mime type/i,
];

export function isLikelyStaleChunkError(errorLike) {
  const parts = [];
  if (typeof errorLike === "string") {
    parts.push(errorLike);
  } else if (errorLike && typeof errorLike === "object") {
    parts.push(errorLike.message, errorLike.stack, errorLike.name);
    if (errorLike.reason) {
      parts.push(errorLike.reason?.message, errorLike.reason?.stack, String(errorLike.reason || ""));
    }
  }
  const text = parts.filter(Boolean).join("\n");
  return STALE_CHUNK_PATTERNS.some((pattern) => pattern.test(text));
}

function buildFreshReloadUrl() {
  const current = new URL(window.location.href);
  current.searchParams.set("gobbleRefresh", String(Date.now()));
  return current.toString();
}

export function maybeRecoverFromStaleChunk(errorLike) {
  if (typeof window === "undefined" || !isLikelyStaleChunkError(errorLike)) {
    return false;
  }
  let previousAt = 0;
  try {
    previousAt = Number(window.sessionStorage?.getItem(STALE_CHUNK_RELOAD_KEY)) || 0;
  } catch (_) {}
  const now = Date.now();
  if (previousAt && now - previousAt < STALE_CHUNK_RELOAD_WINDOW_MS) {
    return false;
  }
  try {
    window.sessionStorage?.setItem(STALE_CHUNK_RELOAD_KEY, String(now));
  } catch (_) {}
  window.location.replace(buildFreshReloadUrl());
  return true;
}
