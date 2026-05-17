#!/usr/bin/env node

import { createHash } from "crypto";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { normalizeWord } from "../../shared/gameLogic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const DEFAULT_DICTIONARY = path.join(ROOT_DIR, "public/dico.txt");
const DEFAULT_DEFINITIONS_DB = path.join(ROOT_DIR, "data/definitions-fr.sqlite");
const DEFAULT_COUNTS = path.join(ROOT_DIR, ".tmp/vocab-word-player-counts.jsonl");
const DEFAULT_OUTPUT = path.join(ROOT_DIR, "data/word-rarity.sqlite");
const DEFAULT_REPORT = path.join(ROOT_DIR, "data/word-rarity.report.json");
const DEFAULT_MAX_LENGTH = 16;
const DEFAULT_MIN_ELIGIBLE_VOCAB = 500;
const BATCH_SIZE = 1000;

function printHelp() {
  console.log(`Usage:
  node server/scripts/build-word-rarity.mjs [options]

Options:
  --dictionary <path>          Dictionnaire source (defaut: public/dico.txt)
  --definitions-db <path>      SQLite des definitions (defaut: data/definitions-fr.sqlite)
  --counts <path>              JSONL agregat wordHash/playersFound exporte depuis la VM
  --output <path>              SQLite generee (defaut: data/word-rarity.sqlite)
  --report <path>              Rapport JSON (defaut: data/word-rarity.report.json)
  --max-length <n>             Longueur max des mots (defaut: ${DEFAULT_MAX_LENGTH})
  --min-eligible-vocab <n>     Seuil joueurs eligibles attendu dans le meta export (defaut: ${DEFAULT_MIN_ELIGIBLE_VOCAB})
  --help                       Affiche cette aide

Format counts JSONL:
  {"type":"meta","eligiblePlayers":123,"minEligibleVocab":500}
  {"wordHash":"...","playersFound":42}
`);
}

function parseArgs(argv) {
  const options = {
    dictionary: DEFAULT_DICTIONARY,
    definitionsDb: DEFAULT_DEFINITIONS_DB,
    counts: DEFAULT_COUNTS,
    output: DEFAULT_OUTPUT,
    report: DEFAULT_REPORT,
    maxLength: DEFAULT_MAX_LENGTH,
    minEligibleVocab: DEFAULT_MIN_ELIGIBLE_VOCAB,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const readValue = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Valeur manquante pour ${arg}`);
      }
      i += 1;
      return value;
    };
    const readPath = () => path.resolve(readValue());
    const readInt = () => {
      const value = Number(readValue());
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${arg} doit etre un entier positif`);
      }
      return value;
    };
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--dictionary") options.dictionary = readPath();
    else if (arg === "--definitions-db") options.definitionsDb = readPath();
    else if (arg === "--counts") options.counts = readPath();
    else if (arg === "--output") options.output = readPath();
    else if (arg === "--report") options.report = readPath();
    else if (arg === "--max-length") options.maxLength = readInt();
    else if (arg === "--min-eligible-vocab") options.minEligibleVocab = readInt();
    else throw new Error(`Option inconnue: ${arg}`);
  }
  return options;
}

function normalizeDefinitionKey(value) {
  const normalized = normalizeWord(String(value || ""));
  return normalized ? normalized.toUpperCase() : "";
}

function normalizeForText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[œ]/g, "oe")
    .replace(/[æ]/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectFormOfDefinition(definition) {
  const normalized = normalizeForText(definition);
  if (!normalized) return null;
  const patterns = [
    /\b(?:premiere|deuxieme|troisieme) personne\b[\s\S]*\bdu verbe ([a-z'-]+)\b/,
    /\b(?:participe passe|participe present)\b[\s\S]*\bdu verbe ([a-z'-]+)\b/,
    /\bforme conjuguee\b[\s\S]*\bde ([a-z'-]+)\b/,
    /\bconjugaison\b[\s\S]*\bde ([a-z'-]+)\b/,
    /\bforme du verbe ([a-z'-]+)\b/,
    /\b(?:feminin|masculin|pluriel|singulier)\b[\s\S]*\bde ([a-z'-]+)\b/,
    /\b(?:variante|graphie|orthographe)\b[\s\S]*\bde ([a-z'-]+)\b/,
  ];
  for (const re of patterns) {
    const match = normalized.match(re);
    if (match?.[1]) return { base: match[1] };
  }
  return null;
}

function hashWord(word) {
  return createHash("sha1").update(word).digest("hex");
}

async function loadDictionary(filePath, maxLength) {
  const raw = await fs.readFile(filePath, "utf8");
  const wordsByKey = new Map();
  let lines = 0;
  for (const line of raw.split(/\r?\n/)) {
    lines += 1;
    const word = line.trim();
    if (!word) continue;
    const key = normalizeDefinitionKey(word);
    if (!key || key.length > maxLength) continue;
    if (!wordsByKey.has(key)) {
      const normalized = normalizeWord(word);
      wordsByKey.set(key, {
        key,
        word: word.toUpperCase(),
        length: key.length,
        wordHash: hashWord(normalized),
      });
    }
  }
  return { lines, words: Array.from(wordsByKey.values()) };
}

async function loadDefinitions(definitionsDbPath) {
  const db = await open({
    filename: definitionsDbPath,
    driver: sqlite3.Database,
    mode: sqlite3.OPEN_READONLY,
  });
  try {
    await db.exec("PRAGMA query_only = ON");
    const rows = await db.all(
      `SELECT key, definition, is_form_of, form_of
         FROM definitions`
    );
    const byKey = new Map();
    for (const row of rows) {
      const key = String(row?.key || "").trim();
      if (!key) continue;
      const detected = detectFormOfDefinition(row?.definition || "");
      const formOf = String(row?.form_of || detected?.base || "").trim();
      byKey.set(key, {
        isFormOf: Number(row?.is_form_of) === 1 || !!detected,
        formOf,
      });
    }
    return byKey;
  } finally {
    await db.close();
  }
}

async function loadCounts(countsPath) {
  const counts = new Map();
  let meta = null;
  let rows = 0;
  const rl = readline.createInterface({
    input: createReadStream(countsPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = JSON.parse(trimmed);
    if (parsed?.type === "meta") {
      meta = parsed;
      continue;
    }
    const wordHash = String(parsed?.wordHash || "").trim();
    const playersFound = Number(parsed?.playersFound);
    if (!wordHash || !Number.isFinite(playersFound)) continue;
    counts.set(wordHash, Math.max(0, Math.round(playersFound)));
    rows += 1;
  }
  return { counts, meta, rows };
}

function computeRarity(playersFound, eligiblePlayers) {
  const eligible = Math.max(0, Number(eligiblePlayers) || 0);
  const found = Math.max(0, Number(playersFound) || 0);
  if (eligible <= 0) {
    return {
      prevalence: 0,
      rarityScore: found > 0 ? 50 : 100,
      bucket: found > 0 ? "unknown" : "never_found",
    };
  }
  const prevalence = Math.min(1, found / eligible);
  const smoothed = (found + 0.5) / (eligible + 1);
  const maxRaw = -Math.log(0.5 / (eligible + 1));
  const raw = -Math.log(Math.max(Number.EPSILON, smoothed));
  const rarityScore = Math.max(0, Math.min(100, Math.round((raw / maxRaw) * 100)));
  let bucket = "common";
  if (found === 0) bucket = "never_found";
  else if (prevalence <= 0.01 || rarityScore >= 85) bucket = "extreme";
  else if (prevalence <= 0.05 || rarityScore >= 70) bucket = "very_rare";
  else if (prevalence <= 0.15 || rarityScore >= 50) bucket = "rare";
  else if (prevalence <= 0.35 || rarityScore >= 30) bucket = "uncommon";
  return { prevalence, rarityScore, bucket };
}

function assignLengthRarityScores(entries) {
  const byLength = new Map();
  for (const entry of entries) {
    if (!byLength.has(entry.length)) byLength.set(entry.length, []);
    byLength.get(entry.length).push(entry);
  }
  for (const group of byLength.values()) {
    group.sort((a, b) => {
      const foundDiff = a.playersFound - b.playersFound;
      if (foundDiff) return foundDiff;
      return b.rarityScore - a.rarityScore;
    });
    const maxRank = Math.max(1, group.length - 1);
    group.forEach((entry, idx) => {
      entry.lengthRarityScore = Math.round(100 - (idx / maxRank) * 100);
    });
  }
}

async function openOutputDb(outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.rm(outputPath, { force: true });
  await fs.rm(`${outputPath}-shm`, { force: true });
  await fs.rm(`${outputPath}-wal`, { force: true });
  const db = await open({
    filename: outputPath,
    driver: sqlite3.Database,
  });
  await db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    PRAGMA temp_store = MEMORY;
    CREATE TABLE word_rarity (
      key TEXT PRIMARY KEY,
      word TEXT NOT NULL,
      length INTEGER NOT NULL,
      word_hash TEXT NOT NULL,
      players_found INTEGER NOT NULL,
      eligible_players INTEGER NOT NULL,
      prevalence REAL NOT NULL,
      rarity_score INTEGER NOT NULL,
      length_rarity_score INTEGER NOT NULL,
      rarity_bucket TEXT NOT NULL,
      has_definition INTEGER NOT NULL,
      is_form_of INTEGER NOT NULL,
      form_of TEXT NOT NULL
    );
    CREATE INDEX idx_word_rarity_bucket ON word_rarity(rarity_bucket, length);
    CREATE INDEX idx_word_rarity_score ON word_rarity(rarity_score DESC, length);
    CREATE INDEX idx_word_rarity_length_score ON word_rarity(length, length_rarity_score DESC);
    CREATE INDEX idx_word_rarity_hash ON word_rarity(word_hash);
    CREATE TABLE metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

async function flushEntries(db, statement, batch) {
  if (!batch.length) return;
  await db.exec("BEGIN");
  try {
    for (const entry of batch) {
      await statement.run(
        entry.key,
        entry.word,
        entry.length,
        entry.wordHash,
        entry.playersFound,
        entry.eligiblePlayers,
        entry.prevalence,
        entry.rarityScore,
        entry.lengthRarityScore,
        entry.rarityBucket,
        entry.hasDefinition ? 1 : 0,
        entry.isFormOf ? 1 : 0,
        entry.formOf || ""
      );
    }
    await db.exec("COMMIT");
  } catch (err) {
    try {
      await db.exec("ROLLBACK");
    } catch (_) {}
    throw err;
  }
  batch.length = 0;
}

function summarize(entries, eligiblePlayers) {
  const byBucket = {};
  const byLength = {};
  const byLengthAndBucket = {};
  let withDefinition = 0;
  let formOfCount = 0;
  for (const entry of entries) {
    byBucket[entry.rarityBucket] = (byBucket[entry.rarityBucket] || 0) + 1;
    byLength[entry.length] = (byLength[entry.length] || 0) + 1;
    const lengthKey = String(entry.length);
    if (!byLengthAndBucket[lengthKey]) byLengthAndBucket[lengthKey] = {};
    byLengthAndBucket[lengthKey][entry.rarityBucket] =
      (byLengthAndBucket[lengthKey][entry.rarityBucket] || 0) + 1;
    if (entry.hasDefinition) withDefinition += 1;
    if (entry.isFormOf) formOfCount += 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    eligiblePlayers,
    totalWords: entries.length,
    withDefinition,
    formOfCount,
    byBucket,
    byLength,
    byLengthAndBucket,
  };
}

async function buildWordRarity(options) {
  const startedAt = Date.now();
  const [dictionary, definitions, countsPayload] = await Promise.all([
    loadDictionary(options.dictionary, options.maxLength),
    loadDefinitions(options.definitionsDb),
    loadCounts(options.counts),
  ]);
  const meta = countsPayload.meta || {};
  const eligiblePlayers = Math.max(0, Math.round(Number(meta.eligiblePlayers) || 0));
  if (eligiblePlayers <= 0) {
    throw new Error("counts meta missing eligiblePlayers");
  }
  if (
    Number(meta.minEligibleVocab) &&
    Number(meta.minEligibleVocab) !== options.minEligibleVocab
  ) {
    console.warn(
      `[word-rarity] counts minEligibleVocab=${meta.minEligibleVocab}, script expected=${options.minEligibleVocab}`
    );
  }

  const entries = dictionary.words.map((wordEntry) => {
    const definition = definitions.get(wordEntry.key) || null;
    const playersFound = countsPayload.counts.get(wordEntry.wordHash) || 0;
    const rarity = computeRarity(playersFound, eligiblePlayers);
    const hasDefinition = !!definition;
    const isFormOf = !!definition?.isFormOf;
    return {
      ...wordEntry,
      playersFound,
      eligiblePlayers,
      prevalence: rarity.prevalence,
      rarityScore: rarity.rarityScore,
      lengthRarityScore: 0,
      rarityBucket: rarity.bucket,
      hasDefinition,
      isFormOf,
      formOf: definition?.formOf || "",
    };
  });
  assignLengthRarityScores(entries);

  await fs.mkdir(path.dirname(options.report), { recursive: true });
  const tmpOutput = `${options.output}.tmp`;
  const db = await openOutputDb(tmpOutput);
  const insert = await db.prepare(`
    INSERT OR REPLACE INTO word_rarity
      (key, word, length, word_hash, players_found, eligible_players, prevalence,
       rarity_score, length_rarity_score, rarity_bucket, has_definition,
       is_form_of, form_of)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const batch = [];
  try {
    for (const entry of entries) {
      batch.push(entry);
      if (batch.length >= BATCH_SIZE) await flushEntries(db, insert, batch);
    }
    await flushEntries(db, insert, batch);
    await insert.finalize();
    const report = {
      ...summarize(entries, eligiblePlayers),
      dictionary: path.relative(ROOT_DIR, options.dictionary),
      definitionsDb: path.relative(ROOT_DIR, options.definitionsDb),
      counts: path.relative(ROOT_DIR, options.counts),
      countsRows: countsPayload.rows,
      minEligibleVocab:
        Number(meta.minEligibleVocab) || options.minEligibleVocab,
      elapsedMs: Date.now() - startedAt,
    };
    await db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)", "report", JSON.stringify(report));
    await db.exec("PRAGMA optimize");
    await fs.writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ok: true, output: options.output, report: options.report, ...report }, null, 2));
  } finally {
    await db.close();
  }

  await fs.rm(options.output, { force: true });
  await fs.rename(tmpOutput, options.output);
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

buildWordRarity(options).catch((err) => {
  console.error(`[word-rarity] erreur: ${err?.message || err}`);
  process.exit(1);
});
