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
const BACKUP_INTERVAL_MS = 60 * 60 * 1000;

let state = { rooms: {} };
let saveTimer = null;
let lastBackupAt = 0;

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

async function maybeBackupFile(filePath) {
  const now = Date.now();
  if (now - lastBackupAt < BACKUP_INTERVAL_MS) return;
  try {
    await fs.stat(filePath);
  } catch (_) {
    return;
  }
  const backupPath = `${filePath}.bak.${now}`;
  try {
    await fs.copyFile(filePath, backupPath);
    lastBackupAt = now;
  } catch (_) {}
}

async function replaceFile(tmpPath, targetPath) {
  try {
    await fs.rename(tmpPath, targetPath);
  } catch (err) {
    if (err?.code !== "EXDEV" && err?.code !== "EEXIST" && err?.code !== "EPERM") {
      throw err;
    }
    try {
      await fs.unlink(targetPath);
    } catch (_) {}
    await fs.rename(tmpPath, targetPath);
  }
}

async function saveToDisk() {
  saveTimer = null;
  const payload = {
    rooms: state.rooms || {},
  };
  const json = JSON.stringify(payload, null, 2);
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await maybeBackupFile(DATA_PATH);
    const tmpPath = `${DATA_PATH}.tmp`;
    await fs.writeFile(tmpPath, json, "utf8");
    await replaceFile(tmpPath, DATA_PATH);
    console.log(`dailyMedals saving size=${Buffer.byteLength(json, "utf8")}`);
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

async function readStatsFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const stat = await fs.stat(filePath);
    const size = Number(stat.size) || Buffer.byteLength(raw, "utf8");
    try {
      const parsed = JSON.parse(raw);
      return { parsed, size, path: filePath };
    } catch (_) {
      return { error: "parse", size, path: filePath };
    }
  } catch (_) {
    return null;
  }
}

async function readLatestBackup(basePath) {
  const dir = path.dirname(basePath);
  const base = path.basename(basePath);
  let entries = [];
  try {
    entries = await fs.readdir(dir);
  } catch (_) {
    return null;
  }
  const backups = entries
    .filter((name) => name.startsWith(`${base}.bak.`))
    .map((name) => path.join(dir, name));
  const stats = await Promise.all(
    backups.map(async (fullPath) => {
      try {
        const st = await fs.stat(fullPath);
        return { path: fullPath, mtimeMs: st.mtimeMs || 0 };
      } catch (_) {
        return null;
      }
    })
  );
  const ordered = stats.filter(Boolean).sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
  for (const entry of ordered) {
    const candidate = await readStatsFile(entry.path);
    if (candidate?.parsed) return candidate;
  }
  return null;
}

async function markCorrupt(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const corruptPath = path.join(dir, `${base}.corrupt.${Date.now()}`);
  try {
    await fs.rename(filePath, corruptPath);
  } catch (_) {}
}

async function loadFromDisk() {
  let selected = null;
  const primary = await readStatsFile(DATA_PATH);
  if (primary?.parsed) {
    selected = primary;
  } else if (primary?.error === "parse") {
    const backup = await readLatestBackup(DATA_PATH);
    if (backup?.parsed) {
      selected = backup;
    } else {
      await markCorrupt(DATA_PATH);
    }
  }

  if (selected?.parsed) {
    const rooms =
      selected.parsed && typeof selected.parsed.rooms === "object" && selected.parsed.rooms
        ? selected.parsed.rooms
        : {};
    state = { rooms: { ...rooms } };
  } else {
    state = { rooms: {} };
  }

  const loadedPath = selected?.path || "none";
  const loadedSize = selected?.size || 0;
  const loadedKeys = selected?.parsed ? Object.keys(selected.parsed).join(",") : "";
  console.log(`dailyMedals loaded from ${loadedPath} size=${loadedSize} keys=${loadedKeys}`);
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
