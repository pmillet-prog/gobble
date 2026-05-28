#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { normalizeWord } from "../../shared/gameLogic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

const DEFAULT_DICTIONARY = path.join(ROOT_DIR, "public/dico.txt");
const DEFAULT_RARITY_DB = path.join(ROOT_DIR, "data/word-rarity.sqlite");
const DEFAULT_DEFINITIONS_DB = path.join(ROOT_DIR, "data/definitions-fr.sqlite");
const DEFAULT_OUTPUT = path.join(ROOT_DIR, "data/ocid-target-pool.json");
const DEFAULT_REPORT = path.join(ROOT_DIR, "data/ocid-target-pool.report.json");
const DEFAULT_MAX_LENGTH = 13;
const OCID_TARGET_BUCKETS = Object.freeze(["never_found", "extreme", "very_rare", "rare"]);
const OCID_DERIVATIONAL_PREFIXES = Object.freeze([
  "anti",
  "auto",
  "des",
  "de",
  "dis",
  "em",
  "en",
  "hyper",
  "inter",
  "macro",
  "micro",
  "neo",
  "non",
  "pre",
  "re",
  "sous",
  "super",
  "sur",
  "trans",
  "ultra",
]);
const OCID_DERIVATIONAL_SUFFIXES = Object.freeze([
  ["atrice", ["", "er", "eur"]],
  ["ateur", ["", "er"]],
  ["ation", ["", "er"]],
  ["age", ["", "er", "ir", "re"]],
  ["ement", ["", "er"]],
  ["iser", ["", "e"]],
  ["ise", ["", "er"]],
  ["ant", ["", "er"]],
  ["ent", ["", "er"]],
  ["isme", [""]],
  ["iste", [""]],
  ["ique", ["", "ie"]],
  ["ure", ["", "er", "ement"]],
]);

function printHelp() {
  console.log(`Usage:
  node server/scripts/build-ocid-target-pool.mjs [options]

Options:
  --dictionary <path>       Dictionnaire source (defaut: public/dico.txt)
  --rarity-db <path>        SQLite de rarete (defaut: data/word-rarity.sqlite)
  --definitions-db <path>   SQLite des definitions (defaut: data/definitions-fr.sqlite)
  --output <path>           Pool JSON genere (defaut: data/ocid-target-pool.json)
  --report <path>           Rapport JSON (defaut: data/ocid-target-pool.report.json)
  --max-length <n>          Longueur max OCID (defaut: ${DEFAULT_MAX_LENGTH})
  --help                    Affiche cette aide
`);
}

function parseArgs(argv) {
  const options = {
    dictionary: DEFAULT_DICTIONARY,
    rarityDb: DEFAULT_RARITY_DB,
    definitionsDb: DEFAULT_DEFINITIONS_DB,
    output: DEFAULT_OUTPUT,
    report: DEFAULT_REPORT,
    maxLength: DEFAULT_MAX_LENGTH,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const readValue = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`Valeur manquante pour ${arg}`);
      i += 1;
      return value;
    };
    const readPath = () => path.resolve(readValue());
    const readInt = () => {
      const value = Number(readValue());
      if (!Number.isInteger(value) || value <= 0) throw new Error(`${arg} doit etre positif`);
      return value;
    };
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--dictionary") options.dictionary = readPath();
    else if (arg === "--rarity-db") options.rarityDb = readPath();
    else if (arg === "--definitions-db") options.definitionsDb = readPath();
    else if (arg === "--output") options.output = readPath();
    else if (arg === "--report") options.report = readPath();
    else if (arg === "--max-length") options.maxLength = readInt();
    else throw new Error(`Option inconnue: ${arg}`);
  }
  return options;
}

function normalizeKey(value) {
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
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDefinitionsJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [];
  } catch (_) {
    return [];
  }
}

function buildSpoilerFragments(word, aliases = []) {
  const fragments = new Set();
  const add = (value, minLength = 4) => {
    const norm = normalizeWord(value || "").replace(/[^a-z]/g, "");
    if (norm.length >= minLength) fragments.add(norm);
  };
  const addWordFamily = (entry, allowDerived = true) => {
    const norm = normalizeWord(entry).replace(/[^a-z]/g, "");
    add(norm, 4);
    if (norm.endsWith("er") && norm.length >= 5) {
      const stem = norm.slice(0, -2);
      add(stem, 3);
      if (stem.length >= 2 && stem.at(-1) === stem.at(-2)) add(stem.slice(0, -1), 3);
    }
    if (norm.endsWith("ir") && norm.length >= 5) add(norm.slice(0, -2), 4);
    if (norm.endsWith("re") && norm.length >= 5) add(norm.slice(0, -2), 4);
    if (norm.endsWith("e") && norm.length >= 5) add(norm.slice(0, -1), 4);
    if (norm.endsWith("s") && norm.length >= 5) add(norm.slice(0, -1), 4);
    if (norm.length >= 8) add(norm.slice(0, Math.min(norm.length - 2, 6)), 6);
    if (norm.length >= 10) add(norm.slice(0, Math.min(norm.length - 3, 8)), 7);
    for (const [suffix, replacements] of OCID_DERIVATIONAL_SUFFIXES) {
      if (!norm.endsWith(suffix) || norm.length < suffix.length + 4) continue;
      const stem = norm.slice(0, -suffix.length);
      add(stem, 4);
      replacements.forEach((replacement) => add(`${stem}${replacement}`, 4));
      break;
    }
    if (!allowDerived) return;
    for (const prefix of OCID_DERIVATIONAL_PREFIXES) {
      if (!norm.startsWith(prefix) || norm.length < prefix.length + 4) continue;
      const derivedBase = norm.slice(prefix.length);
      if (!derivedBase || derivedBase === norm) continue;
      addWordFamily(derivedBase, false);
      break;
    }
  };
  [word, ...aliases].filter(Boolean).forEach((entry) => addWordFamily(entry));
  return Array.from(fragments);
}

function isFormOnlyDefinition(definition) {
  const text = normalizeForText(definition);
  if (!text) return true;
  return [
    /^(?:premiere|deuxieme|troisieme) personne\b/,
    /^participe (?:passe|present)\b/,
    /^forme conjuguee\b[\s\S]*\bde\b/,
    /^conjugaison\b[\s\S]*\bde\b/,
    /^forme du verbe\b/,
    /^(?:feminin|masculin|pluriel|singulier)\b[\s\S]*\bde\b/,
    /^(?:variante|graphie|orthographe)\b[\s\S]*\bde\b/,
  ].some((pattern) => pattern.test(text));
}

function isDefinitionUsable(definition, word = "", aliases = []) {
  const text = String(definition || "").trim().toLowerCase();
  if (!text) return false;
  if (isFormOnlyDefinition(text)) return false;
  const normalizedWord = normalizeWord(word || "");
  const normalizedDefinition = normalizeForText(text);
  if (
    normalizedWord.startsWith("re") &&
    /\b(?:de nouveau|a nouveau|une nouvelle fois|encore une fois)\b/.test(normalizedDefinition)
  ) {
    return false;
  }
  const hasBadKind = [
    "commune francaise",
    "ancienne commune",
    "ville de",
    "municipalite",
    "localite",
    "toponyme",
    "gentile",
    "nom de famille",
    "nom propre",
    "patronyme",
    "matronyme",
    "anthroponyme",
    "prenom",
    "pseudonyme",
    "sigle",
    "acronyme",
    "code iso",
    "code iata",
    "symbole chimique",
    "variante orthographique",
  ].some((fragment) => normalizedDefinition.includes(fragment));
  if (hasBadKind) return false;
  const normalizedText = normalizeWord(text).replace(/[^a-z]/g, "");
  if (!normalizedText) return false;
  return !buildSpoilerFragments(word, aliases).some((fragment) =>
    normalizedText.includes(fragment)
  );
}

function pickUsableDefinition(definitionEntry, word, aliases) {
  const seen = new Set();
  const definitions = [
    definitionEntry?.definition,
    ...(Array.isArray(definitionEntry?.definitions) ? definitionEntry.definitions : []),
  ];
  for (const raw of definitions) {
    const text = String(raw || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    if (isDefinitionUsable(text, word, aliases)) return text;
  }
  return "";
}

async function loadDictionary(filePath, maxLength) {
  const raw = await fs.readFile(filePath, "utf8");
  const words = new Set();
  for (const line of raw.split(/\r?\n/)) {
    const word = normalizeWord(line.trim());
    if (word && word.length <= maxLength) words.add(word);
  }
  return words;
}

async function loadRarityRows(dbPath, maxLength) {
  const db = await open({ filename: dbPath, driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
  try {
    await db.exec("PRAGMA query_only = ON");
    const placeholders = OCID_TARGET_BUCKETS.map(() => "?").join(", ");
    const rows = await db.all(
      `SELECT key, word, length, rarity_bucket, rarity_score, players_found,
              has_definition, is_form_of, form_of
         FROM word_rarity
        WHERE rarity_bucket IN (${placeholders})
          AND has_definition = 1
          AND length BETWEEN 4 AND ?
        ORDER BY rarity_bucket, length, word`,
      [...OCID_TARGET_BUCKETS, maxLength]
    );
    const byKey = new Map();
    rows.forEach((row) => {
      const key = String(row?.key || normalizeKey(row?.word)).trim();
      if (key) byKey.set(key, row);
    });
    return { rows, byKey };
  } finally {
    await db.close();
  }
}

async function loadDefinitions(dbPath) {
  const db = await open({ filename: dbPath, driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
  try {
    await db.exec("PRAGMA query_only = ON");
    const rows = await db.all(
      `SELECT key, word, title, definition, definitions_json, source, source_url,
              is_form_of, form_of
         FROM definitions`
    );
    const byKey = new Map();
    rows.forEach((row) => {
      const key = String(row?.key || "").trim();
      const definition = String(row?.definition || "").trim();
      if (!key || !definition) return;
      byKey.set(key, {
        word: String(row?.word || "").trim(),
        title: String(row?.title || "").trim(),
        definition,
        definitions: parseDefinitionsJson(row?.definitions_json),
        source: String(row?.source || "wiktionary").trim() || "wiktionary",
        sourceUrl: String(row?.source_url || "").trim(),
        isFormOf: Number(row?.is_form_of) === 1,
        formOf: String(row?.form_of || "").trim(),
      });
    });
    return byKey;
  } finally {
    await db.close();
  }
}

function summarize(pool, stats, elapsedMs) {
  const byBucket = {};
  const byLength = {};
  pool.forEach((entry) => {
    byBucket[entry.rarityBucket] = (byBucket[entry.rarityBucket] || 0) + 1;
    byLength[entry.word.length] = (byLength[entry.word.length] || 0) + 1;
  });
  return {
    generatedAt: new Date().toISOString(),
    total: pool.length,
    byBucket,
    byLength,
    stats,
    elapsedMs,
  };
}

async function buildPool(options) {
  const startedAt = Date.now();
  const [dictionary, rarityPayload, definitions] = await Promise.all([
    loadDictionary(options.dictionary, options.maxLength),
    loadRarityRows(options.rarityDb, options.maxLength),
    loadDefinitions(options.definitionsDb),
  ]);
  const out = [];
  const seen = new Set();
  const stats = {
    rarityRows: rarityPayload.rows.length,
    rejectedNotPlayable: 0,
    rejectedMissingDefinition: 0,
    rejectedBucketAfterLemma: 0,
    rejectedDefinition: 0,
    lemmaReplacements: 0,
    originalFallbacks: 0,
  };

  for (const row of rarityPayload.rows) {
    const rawWord = normalizeWord(row?.word || "");
    const baseWord =
      Number(row?.is_form_of) === 1 && row?.form_of ? normalizeWord(row.form_of) : "";
    const candidateWords = baseWord && baseWord !== rawWord ? [baseWord, rawWord] : [rawWord];
    for (const word of candidateWords) {
      if (!word || word.length > options.maxLength || seen.has(word)) continue;
      if (!dictionary.has(word)) {
        stats.rejectedNotPlayable += 1;
        continue;
      }
      const wordKey = normalizeKey(word);
      const candidateRow = word === rawWord ? row : rarityPayload.byKey.get(wordKey);
      if (
        !candidateRow ||
        Number(candidateRow.has_definition) !== 1 ||
        !OCID_TARGET_BUCKETS.includes(String(candidateRow.rarity_bucket || ""))
      ) {
        stats.rejectedBucketAfterLemma += 1;
        continue;
      }
      const definition = definitions.get(wordKey);
      if (!definition?.definition) {
        stats.rejectedMissingDefinition += 1;
        continue;
      }
      const aliases = [rawWord, baseWord, row?.form_of, definition?.formOf].filter(Boolean);
      const usableDefinition = pickUsableDefinition(definition, word, aliases);
      if (!usableDefinition) {
        stats.rejectedDefinition += 1;
        continue;
      }
      seen.add(word);
      if (word !== rawWord) stats.lemmaReplacements += 1;
      else if (baseWord && baseWord !== rawWord) stats.originalFallbacks += 1;
      out.push({
        word,
        definition: usableDefinition,
        source: definition.source || "wiktionary",
        sourceUrl: definition.sourceUrl || "",
        rarityBucket: String(candidateRow.rarity_bucket || ""),
        rarityScore: Number(candidateRow.rarity_score) || 0,
        playersFound: Number(candidateRow.players_found) || 0,
      });
      break;
    }
  }

  out.sort((a, b) => {
    const bucketDiff =
      OCID_TARGET_BUCKETS.indexOf(a.rarityBucket) - OCID_TARGET_BUCKETS.indexOf(b.rarityBucket);
    if (bucketDiff) return bucketDiff;
    const foundDiff = a.playersFound - b.playersFound;
    if (foundDiff) return foundDiff;
    return a.word.localeCompare(b.word, "fr");
  });

  const report = summarize(out, stats, Date.now() - startedAt);
  const payload = {
    version: 1,
    ...report,
    source: {
      dictionary: path.relative(ROOT_DIR, options.dictionary),
      rarityDb: path.relative(ROOT_DIR, options.rarityDb),
      definitionsDb: path.relative(ROOT_DIR, options.definitionsDb),
      maxLength: options.maxLength,
      buckets: OCID_TARGET_BUCKETS,
    },
    entries: out,
  };

  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, `${JSON.stringify(payload)}\n`, "utf8");
  await fs.writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, output: options.output, report: options.report, ...report }, null, 2));
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

buildPool(options).catch((err) => {
  console.error(`[ocid-pool] erreur: ${err?.message || err}`);
  process.exit(1);
});
