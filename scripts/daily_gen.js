#!/usr/bin/env node
import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";
import { normalizeWord, solveGrid, LETTER_BAG } from "../shared/gameLogic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIN_WORDS = 200;
const MIN_LONG_LEN = 12;
const GRID_SIZE = 4;
const DAILY_DURATION_MS = 2 * 60 * 1000;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function buildDateId(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function getParisDateId(date = new Date()) {
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

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--date") {
      args.dateId = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function hashString(input) {
  const str = String(input ?? "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomLetterFromBag(rand) {
  const letter = LETTER_BAG[Math.floor(rand() * LETTER_BAG.length)];
  return letter === "Q" ? "Qu" : letter;
}

function generateGridFromSeed(seed, size = GRID_SIZE) {
  const rand = mulberry32(seed);
  const total = size * size;
  const base = Array(total)
    .fill(null)
    .map(() => ({ letter: randomLetterFromBag(rand), bonus: null }));
  const indices = [...Array(total).keys()];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const bonuses = ["L2", "L3", "M2", "M3"];
  bonuses.forEach((bonus, idx) => {
    base[indices[idx]].bonus = bonus;
  });
  return base;
}

async function readDictionary() {
  const dictPath = path.join(__dirname, "../public/dico.txt");
  const raw = await fs.readFile(dictPath, "utf8");
  return new Set(
    raw
      .split(/\r?\n/)
      .map((w) => normalizeWord(w.trim()))
      .filter(Boolean)
  );
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

async function fileExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch (_) {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const dateId = args.dateId || getParisDateId();
  const dataDir = process.env.GOBBLE_DATA_DIR
    ? path.resolve(process.env.GOBBLE_DATA_DIR)
    : path.join(__dirname, "../server/data");
  const dailyDir = path.join(dataDir, "daily");
  const outputPath = path.join(dailyDir, `daily-${dateId}.json`);

  await fs.mkdir(dailyDir, { recursive: true });
  if (await fileExists(outputPath)) {
    console.log(`daily grid already exists for ${dateId}`);
    return;
  }

  const dictionary = await readDictionary();
  if (!dictionary || dictionary.size === 0) {
    console.error("daily grid generation failed: dictionary missing");
    process.exit(1);
  }

  const baseSeed = hashString(dateId);
  let attempt = 0;
  while (true) {
    const seed = baseSeed + attempt;
    const grid = generateGridFromSeed(seed, GRID_SIZE);
    const solved = solveGrid(grid, dictionary);
    const wordCount = solved.size;
    let maxLen = 0;
    let maxPts = 0;
    let totalPts = 0;
    let longWords = 0;
    for (const [word, data] of solved.entries()) {
      const len = word.length;
      const pts = data?.pts || 0;
      if (len > maxLen) maxLen = len;
      if (pts > maxPts) maxPts = pts;
      totalPts += pts;
      if (len >= MIN_LONG_LEN) longWords += 1;
    }

    if (wordCount >= MIN_WORDS && maxLen >= MIN_LONG_LEN) {
      const payload = {
        dateId,
        seed,
        gridSize: GRID_SIZE,
        grid,
        durationMs: DAILY_DURATION_MS,
        generatedAt: Date.now(),
        wordCount,
        longestWordLen: maxLen,
        gridQuality: {
          words: wordCount,
          maxLen,
          maxPts,
          totalPts,
          longWords,
        },
      };
      await atomicWriteJson(outputPath, payload);
      console.log(
        `daily grid ready date=${dateId} words=${wordCount} maxLen=${maxLen} seed=${seed}`
      );
      return;
    }

    attempt += 1;
    if (attempt % 50 === 0) {
      console.log(`daily grid search date=${dateId} attempts=${attempt}`);
    }
  }
}

main().catch((err) => {
  console.error("daily grid generation failed", err);
  process.exit(1);
});
