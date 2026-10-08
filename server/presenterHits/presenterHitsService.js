import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { getPresenterHitsWeekStartTs, isPresenterHitId, PRESENTER_HIT_IDENTITIES } from "../../shared/presenterHits.js";

const DEFAULT_DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const REPLAY_RETENTION_MS = 60 * 60 * 1000;

export function createPresenterHitsFileStore(dataDir = process.env.GOBBLE_DATA_DIR || DEFAULT_DATA_DIR) {
  const file = path.join(dataDir, "presenter-hits.json");
  return {
    async load() {
      try { return JSON.parse(await fs.readFile(file, "utf8")); }
      catch (error) { if (error.code === "ENOENT") return null; throw error; }
    },
    async save(snapshot) {
      await fs.mkdir(dataDir, { recursive: true });
      const temporary = `${file}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(snapshot), "utf8");
      await fs.rename(temporary, file);
    },
  };
}

export function createPresenterHitsService({ storage = createPresenterHitsFileStore(), now = Date.now,
  saveDelayMs = 5000, schedule = setTimeout, cancel = clearTimeout, logger = console } = {}) {
  const weeks = new Map();
  const clients = new Map();
  let trackingStartTs = 0;
  let loaded = false;
  let disposed = false;
  let timer = null;
  let dirty = false;
  let inFlight = null;
  let lastSweepAt = 0;
  let cachedWeek = null;
  let cachedDay = null;
  function weekAt(time) {
    // Paris's offset is at most two hours; refresh once each UTC hour, so the
    // local Monday boundary is exact without formatting on every tap.
    const hour = Math.floor(time / 3600000);
    if (hour !== cachedDay) { cachedDay = hour; cachedWeek = getPresenterHitsWeekStartTs(time); }
    return cachedWeek;
  }
  function planSave() {
    if (timer !== null || disposed) return;
    timer = schedule(() => { timer = null; flush().catch(error => logger.error?.("[presenter-hits] save failed", error)); }, saveDelayMs);
    timer?.unref?.();
  }
  function markDirty() { dirty = true; planSave(); }
  const ready = Promise.resolve().then(() => storage.load()).then(snapshot => {
    trackingStartTs = Number(snapshot?.trackingStartTs) || now();
    for (const [key, values] of Object.entries(snapshot?.weeks || {})) {
      const start = Number(key);
      if (!Number.isSafeInteger(start) || start <= 0) continue;
      const counts = {};
      for (const { presenterId } of PRESENTER_HIT_IDENTITIES) {
        const value = Number(values?.[presenterId]);
        if (Number.isSafeInteger(value) && value > 0) counts[presenterId] = value;
      }
      weeks.set(start, counts);
    }
    loaded = true;
    if (!snapshot?.trackingStartTs) markDirty();
  });

  async function flush() {
    await ready;
    if (timer !== null) { cancel(timer); timer = null; }
    if (inFlight) { await inFlight; if (dirty) return flush(); return; }
    if (!dirty) return;
    dirty = false;
    const snapshot = { version: 1, trackingStartTs,
      weeks: Object.fromEntries([...weeks].map(([week, counts]) => [week, { ...counts }])) };
    inFlight = Promise.resolve().then(() => storage.save(snapshot));
    try { await inFlight; }
    catch (error) { dirty = true; throw error; }
    finally { inFlight = null; if (dirty) planSave(); }
  }

  function recordHit({ playerKey, scope, presenterId, streamId, sequence }) {
    if (!loaded || disposed) return false;
    if (typeof playerKey !== "string" || !playerKey || !scope || !isPresenterHitId(presenterId) ||
        typeof streamId !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(streamId) ||
        !Number.isSafeInteger(sequence) || sequence < 1) return false;
    const time = now();
    if (time - lastSweepAt > 60000) {
      lastSweepAt = time;
      for (const [key, client] of clients) if (time - client.at > REPLAY_RETENTION_MS) clients.delete(key);
    }
    let client = clients.get(playerKey);
    if (!client) {
      client = { at: time, tokens: 12, streams: new Map() };
      clients.set(playerKey, client);
    }
    const streamKey = streamId;
    for (const [key, stream] of client.streams) if (time - stream.at > REPLAY_RETENTION_MS) client.streams.delete(key);
    const previous = client.streams.get(streamKey);
    if ((previous && sequence <= previous.sequence) || (!previous && client.streams.size >= 32)) return false;
    client.tokens = Math.min(12, client.tokens + Math.max(0, time - client.at) * 15 / 1000);
    client.at = time;
    // Remember rejected high-rate sequence numbers too: they cannot be replayed
    // later once the rate bucket has refilled.
    client.streams.set(streamKey, { sequence, at: time });
    if (client.tokens < 1) return false;
    client.tokens -= 1;
    const week = weekAt(time);
    const counts = weeks.get(week) || {};
    counts[presenterId] = (counts[presenterId] || 0) + 1;
    weeks.set(week, counts);
    markDirty();
    return true;
  }

  function getWeeklyBoard(weekStartTs = weekAt(now())) {
    if (!loaded || Number(weekStartTs) < weekAt(trackingStartTs)) return [];
    const counts = weeks.get(Number(weekStartTs)) || {};
    return PRESENTER_HIT_IDENTITIES.map(entry => ({ ...entry, hits: counts[entry.presenterId] || 0 }))
      .sort((a, b) => b.hits - a.hits || a.nick.localeCompare(b.nick, "fr"));
  }

  return Object.freeze({ ready, recordHit, getWeeklyBoard, getTrackingStartTs: () => trackingStartTs, flush,
    async dispose() { disposed = true; if (timer !== null) { cancel(timer); timer = null; } await flush(); clients.clear(); },
  });
}
