import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";
import { spawn } from "child_process";
import { normalizeWord, solveGrid } from "../../shared/gameLogic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.GOBBLE_DATA_DIR
  ? path.resolve(process.env.GOBBLE_DATA_DIR)
  : path.join(__dirname, "../data");
const DAILY_DIR = path.join(DATA_DIR, "daily");
const MIN_PALIER_SCORE = 2000;
const PALIER_STEP = 500;
const LOCK_STALE_MS = 2 * 60 * 60 * 1000;

const gridCache = new Map();
const resultsCache = new Map();
const activeGenerators = new Set();
let championCache = null;
let lastChampionDateId = null;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function buildDateId(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function getParisDateId(date = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value || 0);
  const month = Number(parts.find((p) => p.type === "month")?.value || 0);
  const day = Number(parts.find((p) => p.type === "day")?.value || 0);
  return buildDateId(year, month, day);
}

export function addDaysToDateId(dateId, deltaDays) {
  const match = String(dateId || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateId;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const base = new Date(Date.UTC(year, month, day));
  base.setUTCDate(base.getUTCDate() + Number(deltaDays || 0));
  return buildDateId(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

function dailyGridPath(dateId) {
  return path.join(DAILY_DIR, `daily-${dateId}.json`);
}

function dailyResultsPath(dateId) {
  return path.join(DAILY_DIR, `results-${dateId}.json`);
}

function dailyLockPath(dateId) {
  return path.join(DAILY_DIR, `.gen-${dateId}.lock`);
}

function dailyChampionPath() {
  return path.join(DAILY_DIR, "champion.json");
}

async function ensureDailyDir() {
  await fs.mkdir(DAILY_DIR, { recursive: true });
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const cleaned = raw.length > 0 && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return JSON.parse(cleaned);
  } catch (_) {
    return null;
  }
}

async function atomicWriteJson(filePath, payload) {
  const json = JSON.stringify(payload, null, 2);
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, json, "utf8");
  try {
    await fs.rename(tmpPath, filePath);
  } catch (_) {
    try {
      await fs.unlink(filePath);
    } catch (_) {}
    await fs.rename(tmpPath, filePath);
  }
}

async function getFileStat(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (_) {
    return null;
  }
}

async function loadDailyGrid(dateId) {
  const filePath = dailyGridPath(dateId);
  const cached = gridCache.get(dateId);
  const stat = await getFileStat(filePath);
  if (!stat) {
    gridCache.delete(dateId);
    return null;
  }
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.data;
  }
  const data = await readJsonFile(filePath);
  if (!data) return null;
  gridCache.set(dateId, { data, mtimeMs: stat.mtimeMs });
  return data;
}

async function loadDailyResults(dateId) {
  const filePath = dailyResultsPath(dateId);
  const cached = resultsCache.get(dateId);
  const stat = await getFileStat(filePath);
  if (!stat) {
    resultsCache.delete(dateId);
    return { dateId, results: [], attempts: {} };
  }
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.data;
  }
  const data = await readJsonFile(filePath);
  const safe = data && typeof data === "object" ? data : null;
  const results = Array.isArray(safe?.results) ? safe.results : [];
  const attempts =
    safe?.attempts && typeof safe.attempts === "object" ? safe.attempts : {};
  const payload = { dateId, results, attempts };
  resultsCache.set(dateId, { data: payload, mtimeMs: stat.mtimeMs });
  return payload;
}

async function saveDailyResults(dateId, payload) {
  const filePath = dailyResultsPath(dateId);
  await ensureDailyDir();
  await atomicWriteJson(filePath, payload);
  const stat = await getFileStat(filePath);
  if (stat) {
    resultsCache.set(dateId, { data: payload, mtimeMs: stat.mtimeMs });
  }
}

function sortResults(results) {
  return [...results].sort((a, b) => {
    const diff = (b?.score || 0) - (a?.score || 0);
    if (diff !== 0) return diff;
    const at = Number(a?.submittedAt) || 0;
    const bt = Number(b?.submittedAt) || 0;
    if (at !== bt) return at - bt;
    const ad = Number(a?.durationMs);
    const bd = Number(b?.durationMs);
    if (Number.isFinite(ad) && Number.isFinite(bd) && ad !== bd) return ad - bd;
    return String(a?.pseudo || "").localeCompare(String(b?.pseudo || ""));
  });
}

function buildPalierEntries(maxScore) {
  const maxTarget = Math.max(
    MIN_PALIER_SCORE,
    Math.ceil(Math.max(0, maxScore) / PALIER_STEP) * PALIER_STEP
  );
  const entries = [];
  for (let score = PALIER_STEP; score <= maxTarget; score += PALIER_STEP) {
    entries.push({
      nick: `Palier ${score}`,
      score,
      rightLabel: `${score} pts`,
      isPalier: true,
      playerKey: `palier-${score}`,
    });
  }
  return entries;
}

function buildDailyBoardEntries(results) {
  const sorted = sortResults(results);
  const maxScore = sorted.length ? Number(sorted[0]?.score) || 0 : 0;
  const palierEntries = buildPalierEntries(maxScore);
  const playerEntries = sorted.map((entry) => ({
    nick: entry.pseudo || entry.nick || "Joueur",
    score: Number(entry.score) || 0,
    wordsCount: Number.isFinite(entry.wordCount) ? entry.wordCount : null,
    installId: entry.installId || null,
    submittedAt: entry.submittedAt || null,
    isPalier: false,
  }));
  const merged = [...playerEntries, ...palierEntries];
  merged.sort((a, b) => {
    const diff = (b?.score || 0) - (a?.score || 0);
    if (diff !== 0) return diff;
    const aPalier = a?.isPalier ? 1 : 0;
    const bPalier = b?.isPalier ? 1 : 0;
    if (aPalier !== bPalier) return aPalier - bPalier;
    const at = Number(a?.submittedAt) || 0;
    const bt = Number(b?.submittedAt) || 0;
    if (at !== bt) return at - bt;
    return String(a?.nick || "").localeCompare(String(b?.nick || ""));
  });
  return merged;
}

export async function ensureDaily(dateId) {
  if (!dateId) return { ready: false };
  await ensureDailyDir();
  const gridPath = dailyGridPath(dateId);
  const stat = await getFileStat(gridPath);
  if (stat) return { ready: true };

  const lockPath = dailyLockPath(dateId);
  const lockStat = await getFileStat(lockPath);
  if (lockStat) {
    const ageMs = Date.now() - (lockStat.mtimeMs || 0);
    if (ageMs < LOCK_STALE_MS) {
      return { ready: false };
    }
    fs.unlink(lockPath).catch(() => {});
  }

  spawnDailyGenerator(dateId);
  return { ready: false };
}

function spawnDailyGenerator(dateId) {
  if (!dateId) return;
  if (activeGenerators.has(dateId)) return;
  activeGenerators.add(dateId);
  const lockPath = dailyLockPath(dateId);
  ensureDailyDir()
    .then(() => fs.writeFile(lockPath, String(Date.now()), "utf8"))
    .catch(() => {});

  const scriptPath = path.join(__dirname, "../../scripts/daily_gen.js");
  const nodeBin = process.execPath;
  const args = [scriptPath, "--date", dateId];

  let child = null;
  if (process.platform === "linux") {
    try {
      child = spawn("nice", ["-n", "10", nodeBin, ...args], {
        detached: true,
        stdio: "ignore",
      });
    } catch (_) {
      child = null;
    }
  }
  if (!child) {
    child = spawn(nodeBin, args, { detached: true, stdio: "ignore" });
  }

  child.on("exit", () => {
    activeGenerators.delete(dateId);
    fs.unlink(lockPath).catch(() => {});
  });
  child.on("error", () => {
    activeGenerators.delete(dateId);
    fs.unlink(lockPath).catch(() => {});
  });
  child.unref();
}

export async function getDailyStatus(dateId, installId) {
  const safeDateId = dateId || getParisDateId();
  const grid = await loadDailyGrid(safeDateId);
  const ready = !!grid;
  let hasPlayed = false;
  let myResult = null;
  if (installId) {
    const resultsPayload = await loadDailyResults(safeDateId);
    const results = Array.isArray(resultsPayload?.results) ? resultsPayload.results : [];
    myResult = results.find((entry) => entry.installId === installId) || null;
    const attempts = resultsPayload?.attempts || {};
    hasPlayed = !!myResult || !!attempts?.[installId];
  }
  return { dateId: safeDateId, ready, hasPlayed, myResult, champion: championCache };
}

export async function getDailyBoard(dateId) {
  const safeDateId = dateId || getParisDateId();
  const grid = await loadDailyGrid(safeDateId);
  const ready = !!grid;
  const resultsPayload = await loadDailyResults(safeDateId);
  const results = Array.isArray(resultsPayload?.results) ? resultsPayload.results : [];
  return {
    dateId: safeDateId,
    ready,
    entries: buildDailyBoardEntries(results),
    totalPlayers: results.length,
  };
}

export async function startDailyAttempt(dateId, installId, pseudo) {
  const safeDateId = dateId || getParisDateId();
  const grid = await loadDailyGrid(safeDateId);
  if (!grid) {
    return { ok: false, error: "not_ready", dateId: safeDateId };
  }
  const resultsPayload = await loadDailyResults(safeDateId);
  const results = Array.isArray(resultsPayload.results) ? resultsPayload.results : [];
  if (results.find((entry) => entry.installId === installId)) {
    return { ok: false, error: "already_played", dateId: safeDateId };
  }
  const attempts = resultsPayload.attempts || {};
  if (attempts[installId]) {
    return { ok: false, error: "already_played", dateId: safeDateId };
  }
  attempts[installId] = {
    pseudo: String(pseudo || "").trim().slice(0, 32),
    startedAt: Date.now(),
  };
  await saveDailyResults(safeDateId, {
    dateId: safeDateId,
    results,
    attempts,
  });
  return {
    ok: true,
    dateId: safeDateId,
    grid: grid.grid,
    gridSize: grid.gridSize || 4,
    seed: grid.seed,
    gridQuality: grid.gridQuality || null,
    durationMs: grid.durationMs || null,
  };
}

export async function submitDailyResult({
  dateId,
  installId,
  pseudo,
  foundWords,
  durationMs,
  dictionary,
}) {
  const safeDateId = dateId || getParisDateId();
  const grid = await loadDailyGrid(safeDateId);
  if (!grid) return { ok: false, error: "not_ready", dateId: safeDateId };
  const resultsPayload = await loadDailyResults(safeDateId);
  const results = Array.isArray(resultsPayload.results) ? resultsPayload.results : [];
  if (results.find((entry) => entry.installId === installId)) {
    return { ok: false, error: "already_played", dateId: safeDateId };
  }
  if (!dictionary || dictionary.size === 0) {
    return { ok: false, error: "no_dictionary", dateId: safeDateId };
  }

  const wordsRaw = Array.isArray(foundWords) ? foundWords : [];
  const uniqueWords = Array.from(
    new Set(
      wordsRaw
        .map((word) => normalizeWord(String(word || "")))
        .filter((word) => word && word.length >= 3)
    )
  );
  const solved = solveGrid(grid.grid, dictionary);
  let score = 0;
  let wordCount = 0;
  let longestWordLen = 0;
  for (const word of uniqueWords) {
    const data = solved.get(word);
    if (!data) continue;
    score += data.pts || 0;
    wordCount += 1;
    if (word.length > longestWordLen) longestWordLen = word.length;
  }

  const submittedAt = Date.now();
  const entry = {
    installId,
    pseudo: String(pseudo || "").trim().slice(0, 32),
    score,
    wordCount,
    longestWordLen,
    durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
    submittedAt,
  };
  results.push(entry);
  const attempts = resultsPayload.attempts || {};
  if (attempts[installId]) {
    delete attempts[installId];
  }
  await saveDailyResults(safeDateId, {
    dateId: safeDateId,
    results,
    attempts,
  });

  const sorted = sortResults(results);
  const rank = sorted.findIndex((r) => r.installId === installId);
  return {
    ok: true,
    dateId: safeDateId,
    score,
    rank: rank >= 0 ? rank + 1 : null,
    totalPlayers: sorted.length,
    board: buildDailyBoardEntries(results),
  };
}

export async function refreshDailyChampionIfNeeded() {
  const today = getParisDateId();
  if (lastChampionDateId === today) return championCache;
  const yesterday = addDaysToDateId(today, -1);
  const resultsPayload = await loadDailyResults(yesterday);
  const results = Array.isArray(resultsPayload?.results) ? resultsPayload.results : [];
  const sorted = sortResults(results);
  const best = sorted[0] || null;
  championCache = best
    ? {
        dateId: yesterday,
        installId: best.installId || null,
        pseudo: best.pseudo || null,
        score: best.score || 0,
        submittedAt: best.submittedAt || null,
      }
    : { dateId: yesterday, installId: null, pseudo: null, score: 0 };
  lastChampionDateId = today;
  await ensureDailyDir();
  await atomicWriteJson(dailyChampionPath(), championCache);
  return championCache;
}

export async function loadDailyChampion() {
  if (championCache) return championCache;
  const data = await readJsonFile(dailyChampionPath());
  if (data && typeof data === "object") {
    championCache = data;
    return championCache;
  }
  return null;
}
