import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { normalizeWord } from "../../shared/gameLogic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DB_PATH = path.join(__dirname, "../../data/word-rarity.sqlite");
const DEFAULT_OCID_POOL_PATH = path.join(__dirname, "../../data/ocid-target-pool.json");
const DB_PATH = process.env.GOBBLE_WORD_RARITY_DB
  ? path.resolve(process.env.GOBBLE_WORD_RARITY_DB)
  : DEFAULT_DB_PATH;
const OCID_POOL_PATH = process.env.GOBBLE_OCID_TARGET_POOL
  ? path.resolve(process.env.GOBBLE_OCID_TARGET_POOL)
  : DEFAULT_OCID_POOL_PATH;
const FAKE_TWINS_COMPLETION_BUCKETS = new Set(["common"]);
const OCID_TARGET_BUCKETS = Object.freeze(["never_found", "extreme", "very_rare", "rare"]);
const OCID_TARGET_BUCKET_WEIGHTS = Object.freeze({
  never_found: 0.35,
  extreme: 0.3,
  very_rare: 0.25,
  rare: 0.1,
});
const OCID_TARGET_CANDIDATE_LIMIT = 20000;
const RARE_BONUS_BUCKETS = new Set(["rare", "very_rare", "extreme", "never_found"]);

let db = null;
let initPromise = null;
let fakeTwinsCompletionWordSet = null;
let rareBonusWordMetaMap = null;
let ocidTargetPool = null;
let ocidTargetPoolPromise = null;
let unavailableLogged = false;
let ocidPoolUnavailableLogged = false;

function getOcidBucketLimit(bucket, maxRows) {
  const weight = Number(OCID_TARGET_BUCKET_WEIGHTS[bucket]) || 0;
  const weighted = Math.floor(maxRows * weight);
  return Math.max(250, weighted);
}

function normalizeOcidPoolEntry(entry) {
  const word = normalizeWord(entry?.word || "");
  const definition = String(entry?.definition || "").trim();
  if (!word || word.length > 13 || !definition) return null;
  return {
    word,
    definition,
    source: String(entry?.source || "wiktionary").trim() || "wiktionary",
    sourceUrl: String(entry?.sourceUrl || "").trim(),
    rarityBucket: String(entry?.rarityBucket || ""),
    rarityScore: Number(entry?.rarityScore) || 0,
    playersFound: Number(entry?.playersFound) || 0,
  };
}

async function loadOcidTargetPool() {
  if (Array.isArray(ocidTargetPool)) return ocidTargetPool;
  if (ocidTargetPoolPromise) return ocidTargetPoolPromise;
  ocidTargetPoolPromise = (async () => {
    try {
      const raw = await fs.readFile(OCID_POOL_PATH, "utf8");
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
      ocidTargetPool = entries.map(normalizeOcidPoolEntry).filter(Boolean);
      console.log(`OCID target pool ready path=${OCID_POOL_PATH} count=${ocidTargetPool.length}`);
      return ocidTargetPool;
    } catch (err) {
      if (!ocidPoolUnavailableLogged) {
        ocidPoolUnavailableLogged = true;
        console.warn(`OCID target pool unavailable path=${OCID_POOL_PATH}: ${err?.message || err}`);
      }
      ocidTargetPool = [];
      return ocidTargetPool;
    } finally {
      ocidTargetPoolPromise = null;
    }
  })();
  return ocidTargetPoolPromise;
}

function sampleEntries(entries, limit) {
  const maxRows = Math.max(
    50,
    Math.min(OCID_TARGET_CANDIDATE_LIMIT, Math.trunc(Number(limit) || OCID_TARGET_CANDIDATE_LIMIT))
  );
  if (!Array.isArray(entries) || entries.length <= maxRows) return [...(entries || [])];
  const byBucket = new Map();
  entries.forEach((entry) => {
    const bucket = entry.rarityBucket || "unknown";
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket).push(entry);
  });
  const out = [];
  const seen = new Set();
  for (const bucket of OCID_TARGET_BUCKETS) {
    const group = byBucket.get(bucket) || [];
    if (!group.length) continue;
    const bucketLimit = Math.min(group.length, getOcidBucketLimit(bucket, maxRows));
    let bucketCount = 0;
    while (out.length < maxRows && bucketCount < bucketLimit) {
      const entry = group[Math.floor(Math.random() * group.length)];
      if (!entry || seen.has(entry.word)) continue;
      seen.add(entry.word);
      out.push(entry);
      bucketCount += 1;
    }
  }
  while (out.length < maxRows && seen.size < entries.length) {
    const entry = entries[Math.floor(Math.random() * entries.length)];
    if (!entry || seen.has(entry.word)) continue;
    seen.add(entry.word);
    out.push(entry);
  }
  return out;
}

async function ensureDb() {
  if (db) return db;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      await fs.access(DB_PATH);
      const ready = await open({
        filename: DB_PATH,
        driver: sqlite3.Database,
        mode: sqlite3.OPEN_READONLY,
      });
      await ready.exec("PRAGMA query_only = ON");
      await ready.exec("PRAGMA temp_store = MEMORY");
      db = ready;
      console.log(`word rarity DB ready path=${DB_PATH}`);
      return db;
    } catch (err) {
      if (!unavailableLogged) {
        unavailableLogged = true;
        console.warn(`word rarity DB unavailable path=${DB_PATH}: ${err?.message || err}`);
      }
      return null;
    }
  })();
  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

export async function initWordRarityService() {
  await ensureDb();
}

export async function getFakeTwinsCompletionWordSet() {
  if (fakeTwinsCompletionWordSet instanceof Set) return fakeTwinsCompletionWordSet;
  const ready = await ensureDb();
  if (!ready) {
    fakeTwinsCompletionWordSet = new Set();
    return fakeTwinsCompletionWordSet;
  }
  try {
    const placeholders = Array.from(FAKE_TWINS_COMPLETION_BUCKETS).map(() => "?").join(", ");
    const rows = await ready.all(
      `SELECT word
         FROM word_rarity
        WHERE rarity_bucket IN (${placeholders})`,
      Array.from(FAKE_TWINS_COMPLETION_BUCKETS)
    );
    fakeTwinsCompletionWordSet = new Set(
      rows
        .map((row) => normalizeWord(String(row?.word || "")))
        .filter((word) => word && word.length >= 4)
    );
    console.log(`fake twins completion words ready count=${fakeTwinsCompletionWordSet.size}`);
    return fakeTwinsCompletionWordSet;
  } catch (err) {
    console.warn(`fake twins completion words load failed: ${err?.message || err}`);
    fakeTwinsCompletionWordSet = new Set();
    return fakeTwinsCompletionWordSet;
  }
}

export async function getRareBonusWordMetaMap() {
  if (rareBonusWordMetaMap instanceof Map) return rareBonusWordMetaMap;
  const ready = await ensureDb();
  if (!ready) {
    rareBonusWordMetaMap = new Map();
    return rareBonusWordMetaMap;
  }
  try {
    const placeholders = Array.from(RARE_BONUS_BUCKETS).map(() => "?").join(", ");
    const rows = await ready.all(
      `SELECT word, rarity_bucket, rarity_score
         FROM word_rarity
        WHERE rarity_bucket IN (${placeholders})`,
      Array.from(RARE_BONUS_BUCKETS)
    );
    rareBonusWordMetaMap = new Map();
    rows.forEach((row) => {
      const word = normalizeWord(String(row?.word || ""));
      if (!word) return;
      rareBonusWordMetaMap.set(word, {
        rarityBucket: String(row?.rarity_bucket || ""),
        rarityScore: Number(row?.rarity_score) || 0,
      });
    });
    console.log(`rare bonus words ready count=${rareBonusWordMetaMap.size}`);
    return rareBonusWordMetaMap;
  } catch (err) {
    console.warn(`rare bonus words load failed: ${err?.message || err}`);
    rareBonusWordMetaMap = new Map();
    return rareBonusWordMetaMap;
  }
}

export async function getOcidTargetCandidates({
  dictionary = null,
  limit = OCID_TARGET_CANDIDATE_LIMIT,
} = {}) {
  const pool = await loadOcidTargetPool();
  const usablePool =
    dictionary instanceof Set ? pool.filter((entry) => dictionary.has(entry.word)) : pool;
  return sampleEntries(usablePool, limit);
}
