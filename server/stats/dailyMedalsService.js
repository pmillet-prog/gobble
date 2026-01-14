import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DATA_DIR = path.join(__dirname, "../data-runtime");
const DATA_DIR = process.env.GOBBLE_DATA_DIR
  ? path.resolve(process.env.GOBBLE_DATA_DIR)
  : DEFAULT_DATA_DIR;
const DATA_PATH = path.join(DATA_DIR, "daily-medals.json");

let state = { rooms: {} };
let saveTimer = null;

function reviveMap(obj = {}) {
  const map = new Map();
  for (const [key, value] of Object.entries(obj || {})) {
    map.set(key, value);
  }
  return map;
}

function serializeMap(map) {
  return Object.fromEntries((map || new Map()).entries());
}

async function saveToDisk() {
  saveTimer = null;
  const payload = {
    rooms: state.rooms || {},
  };
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_PATH, JSON.stringify(payload, null, 2), "utf8");
  } catch (_) {}
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(saveToDisk, 500);
  saveTimer.unref?.();
}

function pruneRoomEntry(entry, now = Date.now()) {
  if (!entry || typeof entry !== "object") return false;
  const expiry = entry.expiry || {};
  const medals = entry.medals || {};
  let changed = false;
  for (const [key, expiresAt] of Object.entries(expiry)) {
    if (Number(expiresAt) > now) continue;
    delete expiry[key];
    delete medals[key];
    changed = true;
  }
  if (changed) {
    entry.expiry = expiry;
    entry.medals = medals;
  }
  return changed;
}

async function loadFromDisk() {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const rooms =
      parsed && typeof parsed.rooms === "object" && parsed.rooms
        ? parsed.rooms
        : {};
    state = { rooms: { ...rooms } };
  } catch (_) {
    state = { rooms: {} };
  }
}

await loadFromDisk();

export function getDailyMedalsForRoom(roomId) {
  if (!roomId) return null;
  const entry = state.rooms?.[roomId];
  if (!entry || typeof entry !== "object") return null;
  const changed = pruneRoomEntry(entry);
  if (changed) scheduleSave();
  return {
    medals: reviveMap(entry.medals),
    expiry: reviveMap(entry.expiry),
  };
}

export function persistDailyMedalsForRoom(roomId, medalsMap, expiryMap) {
  if (!roomId) return;
  const medals = serializeMap(medalsMap);
  const expiry = serializeMap(expiryMap);
  if (!Object.keys(medals).length && !Object.keys(expiry).length) {
    if (state.rooms?.[roomId]) {
      delete state.rooms[roomId];
      scheduleSave();
    }
    return;
  }
  state.rooms[roomId] = {
    medals,
    expiry,
    updatedAt: Date.now(),
  };
  scheduleSave();
}
