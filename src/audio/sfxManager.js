const DEV_MODE = typeof import.meta !== "undefined" && !!import.meta.env?.DEV;
const DEFAULT_EXT_ORDER = ["m4a", "wav"];
const SFX_FETCH_TIMEOUT_MS = 8000;
const SFX_DECODE_TIMEOUT_MS = 8000;

const state = {
  ctx: null,
  masterGain: null,
  outputNode: null,
  reverbIn: null,
  muted: false,
  masterVolume: 1,
  buffers: new Map(),
  manifest: new Map(),
  resolvedUrls: new Map(),
  eqBuses: new Map(),
  getAudioSystem: null,
  sampleRate: 44100,
};

let initPromise = null;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clamp01 = (value) => clamp(value, 0, 1);

const normalizeExt = (value) => String(value || "").trim().replace(/^\./, "").toLowerCase();

function parseExtList(value) {
  if (!value) return [];
  return String(value)
    .split(/[,\s|/]+/)
    .map(normalizeExt)
    .filter(Boolean);
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

export function resolveCandidates(pathBase) {
  if (!pathBase) return [];
  const raw = String(pathBase).trim();
  if (!raw) return [];
  if (/\.[a-z0-9]{2,5}$/i.test(raw)) return [raw];
  const envOrder = parseExtList(import.meta?.env?.VITE_SFX_EXT);
  const order = uniqueList(envOrder.length ? [...envOrder, ...DEFAULT_EXT_ORDER] : DEFAULT_EXT_ORDER);
  return order.map((ext) => `${raw}.${ext}`);
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

function resetForNewContext() {
  state.buffers.clear();
  state.manifest.clear();
  state.resolvedUrls.clear();
  state.eqBuses.forEach((bus) => {
    disconnectNode(bus?.input);
  });
  state.eqBuses.clear();
}

function syncWithContext(ctx, { outputNode, reverbIn } = {}) {
  if (!ctx) return;
  const changed = state.ctx && state.ctx !== ctx;
  if (changed) {
    resetForNewContext();
  }
  state.ctx = ctx;
  state.outputNode = outputNode || ctx.destination;
  state.reverbIn = reverbIn || null;

  if (!state.masterGain || state.masterGain.context !== ctx) {
    disconnectNode(state.masterGain);
    state.masterGain = ctx.createGain();
  }
  applyMasterGain();
  disconnectNode(state.masterGain);
  if (state.outputNode) {
    state.masterGain.connect(state.outputNode);
  }
}

function getSystem({ force = false } = {}) {
  if (typeof state.getAudioSystem === "function") {
    const system = state.getAudioSystem({ force });
    if (system?.ctx) {
      syncWithContext(system.ctx, {
        outputNode: system.busIn || system.masterGain || system.ctx.destination,
        reverbIn: system.reverbIn || null,
      });
      return system;
    }
  }
  return null;
}

function ensureFallbackContext() {
  if (state.ctx && state.ctx.state !== "closed") return state.ctx;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  let ctx = null;
  try {
    ctx = new AudioCtx({ sampleRate: state.sampleRate });
  } catch (_) {
    ctx = new AudioCtx();
  }
  syncWithContext(ctx, { outputNode: ctx.destination });
  if (DEV_MODE && state.sampleRate && ctx.sampleRate !== state.sampleRate) {
    console.debug(
      `[sfx] AudioContext sampleRate=${ctx.sampleRate} (requested ${state.sampleRate})`
    );
  }
  return ctx;
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

function withTimeout(promise, ms, label) {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(label || "timeout");
      err.code = "timeout";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

async function fetchArrayBuffer(url, timeoutMs) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timerId =
    controller && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;
  try {
    const res = await fetch(url, {
      cache: "force-cache",
      signal: controller ? controller.signal : undefined,
    });
    if (!res.ok) throw new Error(`bad-response:${res.status}`);
    return await res.arrayBuffer();
  } finally {
    if (timerId) clearTimeout(timerId);
  }
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

export async function init({
  muted = false,
  masterVolume = 1,
  sampleRate = 44100,
  getAudioSystem,
} = {}) {
  state.muted = !!muted;
  state.masterVolume = clamp01(masterVolume ?? 1);
  if (Number.isFinite(sampleRate) && sampleRate > 0) {
    state.sampleRate = sampleRate;
  }
  if (typeof getAudioSystem === "function") {
    state.getAudioSystem = getAudioSystem;
  }
  if (state.ctx && state.ctx.state !== "closed") {
    applyMasterGain();
    return;
  }
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const system = getSystem({ force: true });
    if (system?.ctx) return;
    ensureFallbackContext();
  })().finally(() => {
    initPromise = null;
  });
  return initPromise;
}

async function preloadEntry(ctx, entry) {
  const key = entry?.key;
  if (!key) return false;
  if (state.buffers.has(key)) return true;
  const candidates =
    Array.isArray(entry.urlCandidates) && entry.urlCandidates.length
      ? entry.urlCandidates
      : resolveCandidates(entry?.base);
  for (const url of candidates) {
    if (!url) continue;
    try {
      const buf = await fetchArrayBuffer(url, SFX_FETCH_TIMEOUT_MS);
      try {
        const decoded = await withTimeout(
          decodeAudioData(ctx, buf),
          SFX_DECODE_TIMEOUT_MS,
          "decode-timeout"
        );
        if (decoded) {
          state.buffers.set(key, decoded);
          state.resolvedUrls.set(key, url);
          return true;
        }
      } catch (err) {
        console.warn(`[sfx] decode failed for ${key} (${url})`, err);
      }
    } catch (err) {
      if (DEV_MODE) {
        console.debug(`[sfx] fetch failed for ${key} (${url})`, err);
      }
    }
  }
  return false;
}

function orderManifest(entries) {
  const hot = [];
  const rest = [];
  entries.forEach((entry) => {
    if (!entry) return;
    if (entry.category === "hot") hot.push(entry);
    else rest.push(entry);
  });
  return [...hot, ...rest];
}

export async function preload(manifest = [], onProgress) {
  const entries = Array.isArray(manifest) ? manifest.filter(Boolean) : [];
  entries.forEach((entry) => {
    if (entry?.key) {
      state.manifest.set(entry.key, entry);
    }
  });
  const ordered = orderManifest(entries);
  const total = ordered.length;
  let loaded = 0;
  const notify = (payload) => {
    if (typeof onProgress === "function") {
      onProgress({ loaded, total, ...payload });
    }
  };

  let ctx = state.ctx;
  if (!ctx) {
    const system = getSystem({ force: true });
    ctx = system?.ctx || ensureFallbackContext();
  }
  if (!ctx) {
    ordered.forEach((entry) => {
      loaded += 1;
      notify({ stage: "skip", key: entry?.key, ok: false });
    });
    return;
  }

  const queue = ordered.slice();
  const concurrency = 3;
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      if (!entry?.key) continue;
      const t0 =
        typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      const ok = await preloadEntry(ctx, entry);
      const t1 =
        typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      loaded += 1;
      if (DEV_MODE) {
        console.debug(
          `[sfx] preload ${entry.key} ${ok ? "ok" : "failed"} ${Math.round(t1 - t0)}ms`
        );
      }
      notify({ stage: ok ? "decoded" : "error", key: entry.key, ok });
    }
  });
  await Promise.all(workers);
}

export function play(key, { eqKey, gain = 1, rate = 1 } = {}) {
  if (!key) return { ok: false, reason: "missing" };
  if (state.muted) return { ok: false, reason: "muted" };

  let system = null;
  if (typeof state.getAudioSystem === "function") {
    system = getSystem();
    if (!system?.ctx) {
      return { ok: false, reason: "blocked" };
    }
  } else if (!state.ctx || state.ctx.state === "closed") {
    ensureFallbackContext();
  }

  const ctx = state.ctx;
  if (!ctx || !state.masterGain) return { ok: false, reason: "blocked" };
  if (ctx.state !== "running") {
    return { ok: false, reason: "blocked" };
  }

  const buffer = state.buffers.get(key);
  if (!buffer) return { ok: false, reason: "missing" };
  const bus = getEqBus(eqKey || key);
  if (!bus) return { ok: false, reason: "missing" };

  const source = ctx.createBufferSource();
  const gainNode = ctx.createGain();
  const playbackRate = Number.isFinite(rate) ? rate : 1;
  const volume = clamp01(Number.isFinite(gain) ? gain : 1);
  source.buffer = buffer;
  source.playbackRate.value = clamp(playbackRate, 0.25, 4);
  gainNode.gain.value = volume;
  source.connect(gainNode);
  gainNode.connect(bus.input);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    disconnectNode(source);
    disconnectNode(gainNode);
  };
  source.onended = cleanup;
  try {
    source.start();
  } catch (err) {
    cleanup();
    return { ok: false, reason: "error", error: err };
  }

  const duration = buffer.duration / Math.max(0.01, source.playbackRate.value);
  return { ok: true, duration };
}

export function setMuted(nextMuted) {
  state.muted = !!nextMuted;
  applyMasterGain();
}

export function setMasterVolume(volume) {
  state.masterVolume = clamp01(volume ?? 1);
  applyMasterGain();
}

export function getResolvedUrl(key) {
  return state.resolvedUrls.get(key) || null;
}

export async function dispose() {
  if (!state.getAudioSystem && state.ctx) {
    try {
      await state.ctx.close();
    } catch (_) {}
  }
  disconnectNode(state.masterGain);
  state.ctx = null;
  state.masterGain = null;
  state.outputNode = null;
  state.reverbIn = null;
  state.buffers.clear();
  state.manifest.clear();
  state.resolvedUrls.clear();
  state.eqBuses.clear();
}

const SfxManager = {
  init,
  preload,
  play,
  setMuted,
  setMasterVolume,
  resolveCandidates,
  getResolvedUrl,
  dispose,
};

export default SfxManager;
