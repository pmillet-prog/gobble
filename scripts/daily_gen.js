#!/usr/bin/env node
import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

import { normalizeWord } from "../shared/gameLogic.js";
import { buildDailyPayload } from "../server/daily/dailyGeneration.js";
import { getFakeTwinsCompletionWordSet } from "../server/stats/wordRarityService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  const fakeTwinsCompletionWordSet = await getFakeTwinsCompletionWordSet();
  const payload = buildDailyPayload(dateId, dictionary, { fakeTwinsCompletionWordSet });
  await atomicWriteJson(outputPath, payload);
  console.log(
    `daily grid ready date=${dateId} monstrousWords=${payload.wordCount} specialWords=${payload.specialWordCount}`
  );
}

main().catch((err) => {
  console.error("daily grid generation failed", err);
  process.exit(1);
});
