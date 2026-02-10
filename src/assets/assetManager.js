const DEV_MODE = typeof import.meta !== "undefined" && !!import.meta.env?.DEV;
const DEV_LOG_SFX = DEV_MODE && false;
const DEV_LOG_SFX_MISSES = DEV_MODE && false;
const SFX_SCHEDULE_LEAD_SEC = 0.008;
const SFX_MIN_GAP_SEC = 0.006;

const DEFAULT_IMAGE_EXTS = ["webp", "png"];
const DEFAULT_SFX_EXTS = ["m4a", "wav", "mp3"];
const DEFAULT_PRIORITY_ORDER = {
  critical: 0,
  high: 1,
  low: 2,
};

const state = {
  manifest: new Map(),
  images: new Map(),
  sfxBuffers: new Map(),
  pendingSfx: new Map(),
  decodingSfx: new Map(),
  pendingPlaysByKey: new Map(),
  playQueue: [],
  flushScheduled: false,
  pendingDecode: false,
  files: new Map(),
  fileUrls: new Map(),
  resolvedUrls: new Map(),
  objectUrls: new Set(),
  ctx: null,
  masterGain: null,
  eqBuses: new Map(),
  nextStartTime: new Map(),
  audioSystemProvider: null,
  ownsContext: false,
  muted: false,
  masterVolume: 1,
  audioUnlocked: false,
  lastPlayed: new Map(),
  registrationCounter: 0,
  sfxDrops: {
    cooldown: 0,
    noContext: 0,
    suspended: 0,
    pending: 0,
    noBuffer: 0,
    noBus: 0,
  },
  sfxMisses: new Map(),
  sfxMissesByReason: new Map(),
  lastMissLogAt: 0,
  devGuard: {
    enabled: DEV_MODE,
    strict: DEV_MODE,
    readyAll: false,
    fetchWrapped: false,
    originalFetch: null,
    manifestUrls: new Set(),
    manifestPaths: new Set(),
  },
  devLog: {
    imageFailures: new Set(),
    sfxFailures: new Set(),
    fileFailures: new Set(),
    sfxPlayMisses: new Set(),
  },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clamp01 = (value) => clamp(value, 0, 1);

function recordSfxDrop(reason) {
  if (!reason) return;
  const key = String(reason);
  state.sfxDrops[key] = (state.sfxDrops[key] || 0) + 1;
}

function recordSfxMiss(key, reason) {
  if (!key || !reason) return;
  const now = Date.now();
  const prev = state.sfxMisses.get(key) || { total: 0, reasons: {} };
  prev.total += 1;
  prev.reasons[reason] = (prev.reasons[reason] || 0) + 1;
  state.sfxMisses.set(key, prev);
  state.sfxMissesByReason.set(
    reason,
    (state.sfxMissesByReason.get(reason) || 0) + 1
  );
  if (!DEV_LOG_SFX_MISSES) return;
  if (now - state.lastMissLogAt > 200) {
    state.lastMissLogAt = now;
    console.debug(`[asset] sfx miss ${reason}: ${key}`);
  }
  if (prev.total % 20 === 0) {
    const top = Array.from(state.sfxMisses.entries())
      .sort((a, b) => (b[1]?.total || 0) - (a[1]?.total || 0))
      .slice(0, 5)
      .map(([k, v]) => `${k}(${v.total})`)
      .join(", ");
    console.debug(`[asset] sfx miss top: ${top}`);
  }
}

const normalizeExt = (value) => String(value || "").trim().replace(/^\./, "").toLowerCase();

function toAbsoluteUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (typeof window === "undefined") return url;
  try {
    return new URL(url, window.location.origin).toString();
  } catch (_) {
    return url;
  }
}

function toPathname(url) {
  if (!url || typeof url !== "string") return "";
  if (typeof window === "undefined") return url;
  try {
    return new URL(url, window.location.origin).pathname || url;
  } catch (_) {
    return url;
  }
}

function mimeFromUrl(url) {
  const match = String(url || "")
    .toLowerCase()
    .match(/\.([a-z0-9]+)(?:$|[?#])/);
  const ext = match ? match[1] : "";
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
    case "mp4":
      return "audio/mp4";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "webm":
      return "audio/webm";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "svg":
      return "image/svg+xml";
    case "json":
      return "application/json";
    case "txt":
      return "text/plain";
    default:
      return "";
  }
}

function getContentType(res) {
  try {
    return String(res?.headers?.get("content-type") || "").toLowerCase();
  } catch (_) {
    return "";
  }
}

function isLikelyAudioContentType(contentType) {
  if (!contentType) return true;
  if (contentType.includes("audio/")) return true;
  if (contentType.includes("video/mp4")) return true;
  if (contentType.includes("application/octet-stream")) return true;
  if (contentType.includes("binary/octet-stream")) return true;
  return false;
}

function isLikelyImageContentType(contentType) {
  if (!contentType) return true;
  if (contentType.includes("image/")) return true;
  if (contentType.includes("application/octet-stream")) return true;
  if (contentType.includes("binary/octet-stream")) return true;
  return false;
}

function uniqueList(list) {
  const seen = new Set();
  const out = [];
  list.forEach((item) => {
    if (!item || seen.has(item)) return;
    seen.add(item);
    out.push(item);
  });
  return out;
}

function normalizePriority(priority) {
  if (priority === "critical" || priority === "high" || priority === "low") return priority;
  return "low";
}

function priorityRank(priority) {
  return DEFAULT_PRIORITY_ORDER[normalizePriority(priority)];
}

function selectByPriority(entries, priority) {
  const maxRank =
    priority === "critical"
      ? DEFAULT_PRIORITY_ORDER.critical
      : priority === "high"
      ? DEFAULT_PRIORITY_ORDER.high
      : DEFAULT_PRIORITY_ORDER.low;
  return entries.filter((entry) => priorityRank(entry.priority) <= maxRank);
}

function applyMasterGain() {
  if (!state.masterGain) return;
  state.masterGain.gain.value = state.muted ? 0 : clamp01(state.masterVolume);
}

function disconnectNode(node) {
  if (!node) return;
  try {
    node.disconnect();
  } catch (_) {}
}

function resetAudioForNewContext() {
  state.sfxBuffers.clear();
  state.resolvedUrls.forEach((value, key) => {
    if (state.manifest.get(key)?.type === "sfx") {
      state.resolvedUrls.delete(key);
    }
  });
  state.eqBuses.forEach((bus) => disconnectNode(bus?.input));
  state.eqBuses.clear();
  state.nextStartTime.clear();
  state.decodingSfx.clear();
  state.pendingPlaysByKey.clear();
}

function syncAudioSystem(system, { force = false } = {}) {
  if (!system?.ctx) return null;
  const ctx = system.ctx;
  const changed = state.ctx && state.ctx !== ctx;
  if (changed) resetAudioForNewContext();
  state.ctx = ctx;
  state.ownsContext = false;
  if (!state.masterGain || state.masterGain.context !== ctx) {
    disconnectNode(state.masterGain);
    state.masterGain = ctx.createGain();
  }
  applyMasterGain();
  disconnectNode(state.masterGain);
  const target = system.busIn || system.masterGain || ctx.destination;
  if (target) state.masterGain.connect(target);
  return ctx;
}

function ensureAudioContext({ force = false } = {}) {
  if (typeof state.audioSystemProvider === "function") {
    const system = state.audioSystemProvider({ force });
    const ctx = syncAudioSystem(system, { force });
    return ctx || null;
  }
  if (!force && !state.audioUnlocked) return null;
  if (state.ctx && state.ctx.state !== "closed") return state.ctx;
  const AudioCtx = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
  if (!AudioCtx) return null;
  let ctx = null;
  try {
    ctx = new AudioCtx();
  } catch (_) {
    return null;
  }
  state.ctx = ctx;
  state.ownsContext = true;
  if (!state.masterGain || state.masterGain.context !== ctx) {
    disconnectNode(state.masterGain);
    state.masterGain = ctx.createGain();
  }
  applyMasterGain();
  disconnectNode(state.masterGain);
  state.masterGain.connect(ctx.destination);
  return ctx;
}

function getEqBus(eqKey) {
  const key = eqKey || "default";
  const existing = state.eqBuses.get(key);
  if (existing && existing.ctx === state.ctx) return existing;
  if (!state.ctx || !state.masterGain) return null;
  const input = state.ctx.createGain();
  input.connect(state.masterGain);
  const bus = { input, ctx: state.ctx };
  state.eqBuses.set(key, bus);
  return bus;
}

function decodeAudioData(ctx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finalize = (buffer, err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(buffer);
    };
    try {
      const result = ctx.decodeAudioData(
        arrayBuffer,
        (buffer) => finalize(buffer, null),
        (err) => finalize(null, err || new Error("decode-error"))
      );
      if (result && typeof result.then === "function") {
        result.then((buffer) => finalize(buffer, null)).catch((err) => finalize(null, err));
      }
    } catch (err) {
      finalize(null, err);
    }
  });
}

function getPendingKeysSorted() {
  const pendingKeys = Array.from(state.pendingSfx.keys());
  pendingKeys.sort((a, b) => {
    const entryA = state.manifest.get(a);
    const entryB = state.manifest.get(b);
    const pa = priorityRank(entryA?.priority);
    const pb = priorityRank(entryB?.priority);
    if (pa !== pb) return pa - pb;
    const ia =
      typeof entryA?.registrationIndex === "number" ? entryA.registrationIndex : 0;
    const ib =
      typeof entryB?.registrationIndex === "number" ? entryB.registrationIndex : 0;
    return ia - ib;
  });
  return pendingKeys;
}

async function decodeOnePendingKey(ctx, key) {
  if (!key) return false;
  if (!state.pendingSfx.has(key)) return false;
  const inflight = state.decodingSfx.get(key);
  if (inflight) return inflight;
  const job = (async () => {
    try {
      const buf = state.pendingSfx.get(key);
      if (!buf) return false;
      const decoded = await decodeAudioData(ctx, buf);
      if (decoded) state.sfxBuffers.set(key, decoded);
      return !!decoded;
    } catch (err) {
      if (DEV_MODE && !state.devLog.sfxFailures.has(key)) {
        state.devLog.sfxFailures.add(key);
        console.error(`[asset] decode sfx failed: ${key}`, err || "");
      }
      return false;
    } finally {
      state.pendingSfx.delete(key);
      state.decodingSfx.delete(key);
    }
  })();
  state.decodingSfx.set(key, job);
  return job;
}

async function decodePendingSfx(ctx, { chunkSize = 5 } = {}) {
  if (!ctx) return;
  if (state.pendingDecode) return;
  state.pendingDecode = true;
  const keys = getPendingKeysSorted();
  if (!keys.length) {
    state.pendingDecode = false;
    return;
  }
  let processed = 0;
  for (const key of keys) {
    await decodeOnePendingKey(ctx, key);
    if (state.pendingPlaysByKey.has(key)) {
      flushPendingPlaysForKey(key);
    }
    processed += 1;
    if (chunkSize > 0 && processed % chunkSize === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  state.pendingDecode = false;
}

function withCacheBust(url) {
  if (!url || typeof url !== "string") return url;
  const sep = url.includes("?") ? "&" : "?";
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return `${url}${sep}asset_bust=${stamp}`;
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const attempt = async (cache, targetUrl) => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timerId =
      controller && Number.isFinite(timeoutMs) && timeoutMs > 0
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;
    try {
      const res = await fetch(targetUrl, {
        cache,
        signal: controller ? controller.signal : undefined,
        headers: cache === "no-store" ? { "Cache-Control": "no-cache" } : undefined,
      });
      if (res.status === 304) return null;
      if (!res.ok) throw new Error(`bad-response:${res.status}`);
      return res;
    } finally {
      if (timerId) clearTimeout(timerId);
    }
  };

  const attempts = [
    { cache: "force-cache", url },
    { cache: "no-store", url },
    { cache: "no-store", url: withCacheBust(url) },
  ];
  let lastError = null;
  for (const entry of attempts) {
    try {
      const res = await attempt(entry.cache, entry.url);
      if (res) return res;
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) throw lastError;
  throw new Error("no-response");
}

async function tryCandidates(candidates, handler) {
  let lastError = null;
  let lastUrl = "";
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const result = await handler(candidate);
      if (result) return { ok: true, url: candidate, result };
    } catch (err) {
      lastError = err;
      lastUrl = candidate;
    }
  }
  return { ok: false, error: lastError, url: lastUrl, candidates };
}

async function preloadImage(entry) {
  const candidates = uniqueList(entry.candidates || []);
  const attempt = async (url) => {
    const res = await fetchWithTimeout(url, 8000);
    if (!res) throw new Error("image-fetch-null");
    const contentType = getContentType(res);
    if (contentType && !isLikelyImageContentType(contentType)) {
      throw new Error(`image-content-type:${contentType}`);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    let bitmap = null;
    let width = null;
    let height = null;
    if (typeof createImageBitmap === "function") {
      try {
        bitmap = await createImageBitmap(blob);
        width = bitmap.width;
        height = bitmap.height;
      } catch (_) {
        bitmap = null;
      }
    }
    if (!bitmap) {
      const img = new Image();
      img.decoding = "async";
      let resolveDecoded = null;
      let rejectDecoded = null;
      const decoded = new Promise((resolve, reject) => {
        resolveDecoded = resolve;
        rejectDecoded = reject;
      });
      const safeResolve = () => {
        if (!resolveDecoded) return;
        resolveDecoded(true);
        resolveDecoded = null;
        rejectDecoded = null;
      };
      const safeReject = (err) => {
        if (!rejectDecoded) return;
        rejectDecoded(err);
        resolveDecoded = null;
        rejectDecoded = null;
      };
      img.onload = () => safeResolve();
      img.onerror = () => safeReject(new Error("image-error"));
      // Avoid unhandled rejection if decode succeeds but onerror fires later.
      decoded.catch(() => {});
      img.src = objectUrl;
      try {
        if (img.decode) {
          try {
            await img.decode();
          } catch (_) {
            await decoded;
          }
        } else {
          await decoded;
        }
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        throw err;
      }
      width = img.naturalWidth;
      height = img.naturalHeight;
    }
    return { bitmap, url: objectUrl, width, height };
  };
  const loaded = await tryCandidates(candidates, attempt);
  if (!loaded.ok) {
    if (DEV_MODE && !state.devLog.imageFailures.has(entry.key)) {
      state.devLog.imageFailures.add(entry.key);
      console.error(
        `[asset] preload image failed: ${entry.key}`,
        loaded.error || "",
        loaded.candidates || candidates
      );
    }
    return false;
  }
  const { result, url } = loaded;
  state.images.set(entry.key, result);
  state.resolvedUrls.set(entry.key, url);
  if (result?.url) state.objectUrls.add(result.url);
  return true;
}

async function preloadSfx(entry) {
  const candidates = uniqueList(entry.candidates || []);
  const attempt = async (url) => {
    const res = await fetchWithTimeout(url, 8000);
    if (!res) throw new Error("sfx-fetch-null");
    const contentType = getContentType(res);
    if (contentType && !isLikelyAudioContentType(contentType)) {
      throw new Error(`sfx-content-type:${contentType}`);
    }
    const buf = await res.arrayBuffer();
    const ctx = state.audioUnlocked ? ensureAudioContext({ force: false }) : null;
    if (!ctx) return { pending: buf };
    try {
      const decoded = await decodeAudioData(ctx, buf);
      return { buffer: decoded };
    } catch (_) {
      throw new Error("sfx-decode-failed");
    }
  };
  const loaded = await tryCandidates(candidates, attempt);
  if (!loaded.ok) {
    if (DEV_MODE && !state.devLog.sfxFailures.has(entry.key)) {
      state.devLog.sfxFailures.add(entry.key);
      console.error(
        `[asset] preload sfx failed: ${entry.key}`,
        loaded.error || "",
        loaded.candidates || candidates
      );
    }
    return false;
  }
  if (loaded.result?.buffer) {
    state.sfxBuffers.set(entry.key, loaded.result.buffer);
  } else if (loaded.result?.pending) {
    state.pendingSfx.set(entry.key, loaded.result.pending);
  }
  state.resolvedUrls.set(entry.key, loaded.url);
  return true;
}

function queuePlay(key, options) {
  if (!key) return;
  const maxQueue = 48;
  state.playQueue.push({ key, options, at: Date.now() });
  if (state.playQueue.length > maxQueue) {
    state.playQueue.splice(0, state.playQueue.length - maxQueue);
  }
}

function queuePendingPlay(key, options) {
  if (!key) return;
  const list = state.pendingPlaysByKey.get(key) || [];
  const maxQueue = 24;
  list.push({ key, options, at: Date.now() });
  if (list.length > maxQueue) {
    list.splice(0, list.length - maxQueue);
  }
  state.pendingPlaysByKey.set(key, list);
}

function flushPendingPlaysForKey(key) {
  const list = state.pendingPlaysByKey.get(key);
  if (!list || !list.length) return;
  state.pendingPlaysByKey.delete(key);
  list.forEach((item) => {
    playSfx(item.key, { ...(item.options || {}), __fromQueue: true });
  });
}

function flushPlayQueue() {
  if (state.flushScheduled) return;
  state.flushScheduled = true;
  Promise.resolve().then(() => {
    state.flushScheduled = false;
    if (!state.playQueue.length) return;
    const pending = state.playQueue.slice();
    state.playQueue = [];
    pending.forEach((item) => {
      playSfx(item.key, { ...(item.options || {}), __fromQueue: true });
    });
  });
}

async function preloadFile(entry) {
  const candidates = uniqueList(entry.candidates || []);
  const attempt = async (url) => {
    const res = await fetchWithTimeout(url, 8000);
    return await res.arrayBuffer();
  };
  const loaded = await tryCandidates(candidates, attempt);
  if (!loaded.ok) {
    if (DEV_MODE && !state.devLog.fileFailures.has(entry.key)) {
      state.devLog.fileFailures.add(entry.key);
      console.error(
        `[asset] preload file failed: ${entry.key}`,
        loaded.error || "",
        loaded.candidates || candidates
      );
    }
    return false;
  }
  state.files.set(entry.key, loaded.result);
  state.resolvedUrls.set(entry.key, loaded.url);
  return true;
}

function isLoaded(entry) {
  if (entry.type === "image") return state.images.has(entry.key);
  if (entry.type === "sfx") return state.sfxBuffers.has(entry.key);
  if (entry.type === "file") return state.files.has(entry.key);
  return false;
}

function ensureDevFetchGuard() {
  if (!state.devGuard.enabled || state.devGuard.fetchWrapped) return;
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  state.devGuard.originalFetch = fetch;
  state.devGuard.fetchWrapped = true;
  const guard = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url;
    if (state.devGuard.readyAll && url) {
      const abs = toAbsoluteUrl(url);
      const path = toPathname(url);
      if (state.devGuard.manifestUrls.has(abs) || state.devGuard.manifestPaths.has(path)) {
        const message = `[asset] forbidden fetch after preload(all): ${url}`;
        console.error(message);
        if (state.devGuard.strict) {
          throw new Error(message);
        }
      }
    }
    const target = typeof window !== "undefined" ? window : undefined;
    if (target && state.devGuard.originalFetch) {
      return state.devGuard.originalFetch.call(target, input, init);
    }
    return state.devGuard.originalFetch(input, init);
  };
  window.fetch = guard;
}

function registerDevGuardCandidates(entry) {
  const candidates = uniqueList(entry.candidates || []);
  candidates.forEach((candidate) => {
    const abs = toAbsoluteUrl(candidate);
    const path = toPathname(candidate);
    if (abs) state.devGuard.manifestUrls.add(abs);
    if (path) state.devGuard.manifestPaths.add(path);
  });
}

export function setAudioSystemProvider(provider) {
  state.audioSystemProvider = typeof provider === "function" ? provider : null;
}

export function registerManifest(manifest) {
  const list = Array.isArray(manifest) ? manifest : [];
  list.forEach((raw) => {
    if (!raw || !raw.key || !raw.type) return;
    const existing = state.manifest.get(raw.key);
    const registrationIndex =
      typeof existing?.registrationIndex === "number"
        ? existing.registrationIndex
        : state.registrationCounter++;
    const entry = {
      key: String(raw.key),
      type: raw.type,
      candidates: uniqueList(raw.candidates || []),
      priority: normalizePriority(raw.priority),
      meta: raw.meta || {},
      registrationIndex,
    };
    state.manifest.set(entry.key, entry);
    if (state.devGuard.enabled) registerDevGuardCandidates(entry);
  });
  ensureDevFetchGuard();
}

export async function preload({
  priority = "all",
  onProgress,
  concurrency = 4,
} = {}) {
  const entries = Array.from(state.manifest.values());
  const filtered = selectByPriority(entries, priority === "all" ? "low" : priority);
  const queue = filtered.filter((entry) => !isLoaded(entry));
  const total = queue.length;
  let loaded = 0;
  const notify = (payload) => {
    if (typeof onProgress === "function") {
      onProgress({ loaded, total, ...payload });
    }
  };
  if (!queue.length) {
    if (priority === "all") state.devGuard.readyAll = true;
    return;
  }
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      if (!entry) continue;
      let ok = false;
      let stage = "skip";
      try {
        if (entry.type === "image") {
          stage = "image";
          ok = await preloadImage(entry);
        } else if (entry.type === "sfx") {
          stage = "sfx";
          ok = await preloadSfx(entry);
        } else if (entry.type === "file") {
          stage = "file";
          ok = await preloadFile(entry);
        }
      } catch (_) {
        ok = false;
      }
      loaded += 1;
      notify({ key: entry.key, type: entry.type, stage, ok });
    }
  });
  await Promise.all(workers);
  if (priority === "all") state.devGuard.readyAll = true;
}

export function isReady(key) {
  if (!key) return false;
  const entry = state.manifest.get(key);
  if (!entry) return false;
  return isLoaded(entry);
}

export function assertReady(key) {
  if (isReady(key)) return true;
  const entry = state.manifest.get(key);
  const type = entry?.type || "unknown";
  throw new Error(`[asset] not ready: ${key} (${type})`);
}

export function getImage(key) {
  if (!key) return {};
  const entry = state.images.get(key);
  if (!entry) return {};
  return {
    bitmap: entry.bitmap || null,
    url: entry.url || null,
    width: entry.width || null,
    height: entry.height || null,
  };
}

export function getSfxBuffer(key) {
  if (!key) return null;
  return state.sfxBuffers.get(key) || null;
}

export function getFileUrl(key) {
  if (!key) return "";
  if (state.fileUrls.has(key)) return state.fileUrls.get(key) || "";
  const buffer = state.files.get(key);
  if (!buffer) return "";
  const resolved = state.resolvedUrls.get(key) || "";
  const mime = mimeFromUrl(resolved);
  try {
    const blob = new Blob([buffer], { type: mime || undefined });
    const objectUrl = URL.createObjectURL(blob);
    state.fileUrls.set(key, objectUrl);
    state.objectUrls.add(objectUrl);
    return objectUrl;
  } catch (_) {
    return "";
  }
}

export function getFileBuffer(key) {
  if (!key) return null;
  return state.files.get(key) || null;
}

export async function unlockAudio() {
  state.audioUnlocked = true;
  const ctx = ensureAudioContext({ force: true });
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch (_) {}
  }
  if (DEV_MODE) {
    console.debug(
      `[asset] audio unlock ctx=${ctx.state} pending=${state.pendingSfx.size} decoded=${state.sfxBuffers.size}`
    );
  }
  await decodePendingSfx(ctx, { chunkSize: 5 });
  flushPlayQueue();
  if (DEV_MODE) {
    console.debug(
      `[asset] audio decoded ctx=${ctx.state} pending=${state.pendingSfx.size} decoded=${state.sfxBuffers.size}`
    );
  }
  return ctx;
}

export function playSfx(
  key,
  { eqKey, gain = 1, rate = 1, cooldownKey, cooldownMs, __fromQueue = false } = {}
) {
  if (!key) return null;
  if (state.muted) {
    recordSfxMiss(key, "muted");
    return null;
  }
  const entry = state.manifest.get(key);
  const targetEq = eqKey || entry?.meta?.eqKey || key;
  const isVocabTick = String(targetEq || "").startsWith("vocab");

  if (Number.isFinite(cooldownMs) && cooldownMs >= 0) {
    const cdKey = cooldownKey || key;
    const now =
      typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const last = state.lastPlayed.get(cdKey) || 0;
    if (now - last < cooldownMs) {
      recordSfxDrop("cooldown");
      recordSfxMiss(key, "cooldown");
      if (DEV_LOG_SFX && isVocabTick) {
        console.debug(`[asset] sfx drop cooldown ${key} (${cdKey})`);
      }
      return null;
    }
    state.lastPlayed.set(cdKey, now);
  }

  const ctx = ensureAudioContext({ force: false });
  if (!ctx || ctx.state === "closed") {
    recordSfxDrop("noContext");
    recordSfxMiss(key, state.audioUnlocked ? "noContext" : "notUnlocked");
    if (DEV_MODE && !state.devLog.sfxPlayMisses.has(`${key}:ctx`)) {
      state.devLog.sfxPlayMisses.add(`${key}:ctx`);
      console.warn(`[asset] sfx blocked (no ctx): ${key}`);
    }
    if (!__fromQueue) queuePlay(key, { eqKey, gain, rate, cooldownKey, cooldownMs });
    return null;
  }
  if (ctx.state === "suspended") {
    recordSfxDrop("suspended");
    recordSfxMiss(key, "suspended");
    if (state.audioUnlocked) ctx.resume().catch(() => {});
    if (DEV_MODE && !state.devLog.sfxPlayMisses.has(`${key}:suspended`)) {
      state.devLog.sfxPlayMisses.add(`${key}:suspended`);
      console.warn(`[asset] sfx blocked (suspended): ${key}`);
    }
    if (!__fromQueue) queuePlay(key, { eqKey, gain, rate, cooldownKey, cooldownMs });
    return null;
  }
  let buffer = state.sfxBuffers.get(key);
  if (!buffer && state.pendingSfx.has(key)) {
    recordSfxDrop("pending");
    recordSfxMiss(key, "pendingNotDecoded");
    if (DEV_MODE && !state.devLog.sfxPlayMisses.has(`${key}:pending`)) {
      state.devLog.sfxPlayMisses.add(`${key}:pending`);
      console.warn(`[asset] sfx pending decode: ${key}`);
    }
    if (!__fromQueue) {
      queuePendingPlay(key, { eqKey, gain, rate, cooldownKey, cooldownMs });
      decodeOnePendingKey(ctx, key)
        .then(() => flushPendingPlaysForKey(key))
        .catch(() => {});
    }
    return null;
  }
  if (!buffer) {
    recordSfxDrop("noBuffer");
    recordSfxMiss(key, "bufferMissing");
    if (DEV_MODE && !state.devLog.sfxPlayMisses.has(`${key}:missing`)) {
      state.devLog.sfxPlayMisses.add(`${key}:missing`);
      console.warn(`[asset] sfx missing buffer: ${key}`);
    }
    return null;
  }
  const bus = getEqBus(targetEq);
  if (!bus) {
    recordSfxDrop("noBus");
    recordSfxMiss(key, "noEqBus");
    if (DEV_LOG_SFX && isVocabTick) {
      console.debug(`[asset] sfx drop noBus ${key} (${targetEq})`);
    }
    return null;
  }

  const source = ctx.createBufferSource();
  const gainNode = ctx.createGain();
  source.buffer = buffer;
  source.playbackRate.value = clamp(Number.isFinite(rate) ? rate : 1, 0.25, 4);
  gainNode.gain.value = clamp01(Number.isFinite(gain) ? gain : 1);
  source.connect(gainNode);
  gainNode.connect(bus.input);
  const scheduleKey = targetEq || "default";
  const now = ctx.currentTime;
  const next = state.nextStartTime.get(scheduleKey) || 0;
  const startAt = Math.max(now + SFX_SCHEDULE_LEAD_SEC, next);
  state.nextStartTime.set(scheduleKey, startAt + SFX_MIN_GAP_SEC);
  const handle = {
    ctx,
    source,
    gainNode,
    stop: (when = 0) => {
      try {
        source.stop(when);
      } catch (_) {}
    },
    fadeOut: (durationMs = 200) => {
      if (!ctx || !gainNode) return;
      const now = ctx.currentTime;
      const duration = Math.max(0.01, durationMs / 1000);
      const current = Math.max(0.0001, gainNode.gain.value || 0.0001);
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(current, now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      try {
        source.stop(now + duration + 0.02);
      } catch (_) {}
    },
  };
  source.onended = () => {
    disconnectNode(source);
    disconnectNode(gainNode);
  };
  try {
    source.start(startAt);
    if (DEV_LOG_SFX && isVocabTick) {
      const delayMs = Math.max(0, (startAt - now) * 1000);
      console.debug(`[asset] sfx start ${key} eq=${targetEq} +${delayMs.toFixed(2)}ms`);
    }
  } catch (_) {
    recordSfxMiss(key, "startError");
    disconnectNode(source);
    disconnectNode(gainNode);
    return null;
  }
  return handle;
}

export function setMuted(muted) {
  state.muted = !!muted;
  applyMasterGain();
}

export function setMasterVolume(volume) {
  state.masterVolume = clamp01(volume ?? 1);
  applyMasterGain();
}

export function dispose() {
  state.images.forEach((entry) => {
    if (entry?.url) URL.revokeObjectURL(entry.url);
  });
  state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.objectUrls.clear();
  state.images.clear();
  state.sfxBuffers.clear();
  state.pendingSfx.clear();
  state.decodingSfx.clear();
  state.pendingPlaysByKey.clear();
  state.files.clear();
  state.fileUrls.clear();
  state.resolvedUrls.clear();
  state.eqBuses.forEach((bus) => disconnectNode(bus?.input));
  state.eqBuses.clear();
  if (state.ownsContext && state.ctx) {
    try {
      state.ctx.close();
    } catch (_) {}
  }
  state.ctx = null;
  state.masterGain = null;
  state.ownsContext = false;
  state.audioUnlocked = false;
  state.lastPlayed.clear();
  state.sfxMisses.clear();
  state.sfxMissesByReason.clear();
  state.lastMissLogAt = 0;
}

const AssetManager = {
  registerManifest,
  preload,
  isReady,
  assertReady,
  getImage,
  getSfxBuffer,
  getFileUrl,
  getFileBuffer,
  unlockAudio,
  playSfx,
  setMuted,
  setMasterVolume,
  setAudioSystemProvider,
  dispose,
};

export default AssetManager;
