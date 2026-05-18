import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { normalizeWord } from "../../shared/gameLogic.js";
import { getLocalDefinitionEntry } from "../definitions/localDefinitionStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DB_PATH = path.join(__dirname, "../../data/word-rarity.sqlite");
const DB_PATH = process.env.GOBBLE_WORD_RARITY_DB
  ? path.resolve(process.env.GOBBLE_WORD_RARITY_DB)
  : DEFAULT_DB_PATH;
const FAKE_TWINS_COMPLETION_BUCKETS = new Set(["common", "uncommon"]);
const OCID_TARGET_BUCKETS = Object.freeze(["extreme", "very_rare", "rare"]);
const OCID_TARGET_CANDIDATE_LIMIT = 15000;
const RARE_BONUS_BUCKETS = new Set(["rare", "very_rare", "extreme", "never_found"]);

let db = null;
let initPromise = null;
let fakeTwinsCompletionWordSet = null;
let rareBonusWordMetaMap = null;
let unavailableLogged = false;

function buildOcidSpoilerFragments(word, aliases = []) {
  const fragments = new Set();
  const add = (value, minLength = 4) => {
    const norm = normalizeWord(value || "").replace(/[^a-z]/g, "");
    if (norm.length >= minLength) fragments.add(norm);
  };
  const allWords = [word, ...aliases].filter(Boolean);
  allWords.forEach((entry) => {
    const norm = normalizeWord(entry).replace(/[^a-z]/g, "");
    add(norm, 4);
    if (norm.endsWith("er") && norm.length >= 5) {
      const stem = norm.slice(0, -2);
      add(stem, 3);
      if (stem.length >= 2 && stem.at(-1) === stem.at(-2)) {
        add(stem.slice(0, -1), 3);
      }
    }
    if (norm.endsWith("ir") && norm.length >= 5) add(norm.slice(0, -2), 4);
    if (norm.endsWith("re") && norm.length >= 5) add(norm.slice(0, -2), 4);
    if (norm.endsWith("e") && norm.length >= 5) add(norm.slice(0, -1), 4);
    if (norm.endsWith("s") && norm.length >= 5) add(norm.slice(0, -1), 4);
  });
  return Array.from(fragments);
}

function normalizeOcidDefinitionText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[œ]/g, "oe")
    .replace(/[æ]/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isOcidFormOnlyDefinition(definition) {
  const text = normalizeOcidDefinitionText(definition);
  if (!text) return true;
  return [
    /^(?:premiere|deuxieme|troisieme) personne\b[\s\S]*\bdu verbe\b/,
    /^participe (?:passe|present)\b[\s\S]*\bdu verbe\b/,
    /^forme conjuguee\b[\s\S]*\bde\b/,
    /^conjugaison\b[\s\S]*\bde\b/,
    /^forme du verbe\b/,
    /^(?:feminin|masculin|pluriel|singulier)\b[\s\S]*\bde\b/,
    /^(?:variante|graphie|orthographe)\b[\s\S]*\bde\b/,
  ].some((pattern) => pattern.test(text));
}

function isOcidDefinitionUsable(definition, word = "", aliases = []) {
  const text = String(definition || "").trim().toLowerCase();
  if (!text) return false;
  if (isOcidFormOnlyDefinition(text)) return false;
  const hasBadKind = [
    "commune française",
    "ancienne commune",
    "ville de",
    "municipalité",
    "localité",
    "toponyme",
    "gentilé",
    "sigle",
    "acronyme",
    "code iso",
    "code iata",
    "symbole chimique",
    "variante orthographique",
  ].some((fragment) => text.includes(fragment));
  if (hasBadKind) return false;
  const normalizedText = normalizeWord(text).replace(/[^a-z]/g, "");
  if (!normalizedText) return false;
  return !buildOcidSpoilerFragments(word, aliases).some((fragment) =>
    normalizedText.includes(fragment)
  );
}

function buildOcidCandidateFromEntry({ row, word, definition, aliases = [] }) {
  const normalizedWord = normalizeWord(word || "");
  if (!normalizedWord || normalizedWord.length > 13 || !definition?.definition) return null;
  if (!isOcidDefinitionUsable(definition.definition, normalizedWord, aliases)) return null;
  return {
    word: normalizedWord,
    definition: definition.definition,
    definitions: Array.isArray(definition.definitions) ? definition.definitions : [],
    source: definition.source || "wiktionary",
    sourceUrl: definition.sourceUrl || "",
    rarityBucket: String(row?.rarity_bucket || ""),
    rarityScore: Number(row?.rarity_score) || 0,
    playersFound: Number(row?.players_found) || 0,
  };
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
  const ready = await ensureDb();
  if (!ready) return [];
  const maxRows = Math.max(
    50,
    Math.min(OCID_TARGET_CANDIDATE_LIMIT, Math.trunc(Number(limit) || OCID_TARGET_CANDIDATE_LIMIT))
  );
  try {
    const placeholders = OCID_TARGET_BUCKETS.map(() => "?").join(", ");
    const rows = await ready.all(
      `SELECT word, rarity_bucket, rarity_score, players_found, is_form_of, form_of
         FROM word_rarity
        WHERE rarity_bucket IN (${placeholders})
          AND has_definition = 1
          AND length BETWEEN 4 AND 13
        ORDER BY rarity_score DESC, players_found ASC, length ASC
        LIMIT ?`,
      [...OCID_TARGET_BUCKETS, maxRows]
    );
    const out = [];
    const seen = new Set();
    for (const row of rows) {
      const rawWord = normalizeWord(row?.word || "");
      const baseWord =
        Number(row?.is_form_of) === 1 && row?.form_of ? normalizeWord(row.form_of) : "";
      const candidates = baseWord && baseWord !== rawWord ? [baseWord, rawWord] : [rawWord];
      for (const word of candidates) {
        if (!word || word.length > 13 || seen.has(word)) continue;
        if (dictionary instanceof Set && !dictionary.has(word)) continue;
        const definition = await getLocalDefinitionEntry(word);
        const aliases = [rawWord, baseWord, row?.form_of, definition?.formOf].filter(Boolean);
        const candidate = buildOcidCandidateFromEntry({ row, word, definition, aliases });
        if (!candidate) continue;
        seen.add(word);
        out.push(candidate);
        break;
      }
    }
    return out;
  } catch (err) {
    console.warn(`OCID target candidates load failed: ${err?.message || err}`);
    return [];
  }
}
