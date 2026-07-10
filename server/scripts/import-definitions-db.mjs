#!/usr/bin/env node

import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { normalizeWord } from "../../shared/gameLogic.js";
import { buildGameSemanticThemes } from "../definitions/gameSemanticThemes.js";
import { buildWordLinguisticFacts } from "../definitions/wordLinguisticFacts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const DEFAULT_INPUT = path.join(ROOT_DIR, "data/definitions-fr.jsonl");
const DEFAULT_OUTPUT = path.join(ROOT_DIR, "data/definitions-fr.sqlite");
const DEFAULT_SUPPLEMENTS = path.join(ROOT_DIR, "data/definition-supplements.jsonl");
const BATCH_SIZE = 1000;

function printHelp() {
  console.log(`Usage:
  node server/scripts/import-definitions-db.mjs [options]

Options:
  --input <path>       JSONL source (defaut: data/definitions-fr.jsonl)
  --output <path>      SQLite generee (defaut: data/definitions-fr.sqlite)
  --supplements <path> JSONL de complements locaux (defaut: data/definition-supplements.jsonl)
  --help               Affiche cette aide
`);
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    supplements: DEFAULT_SUPPLEMENTS,
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
      return path.resolve(value);
    };
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--input") options.input = readValue();
    else if (arg === "--output") options.output = readValue();
    else if (arg === "--supplements") options.supplements = readValue();
    else throw new Error(`Option inconnue: ${arg}`);
  }
  return options;
}

function normalizeDefinitionKey(value) {
  const normalized = normalizeWord(String(value || ""));
  return normalized ? normalized.toUpperCase() : "";
}

function sanitizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const key = normalizeDefinitionKey(raw.key || raw.word || raw.title);
  const definition = String(raw.definition || "").trim();
  if (!key || !definition) return null;
  const definitions = Array.isArray(raw.definitions)
    ? raw.definitions.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [definition];
  const etymology = String(raw.etymology || "").replace(/\s+/g, " ").trim();
  const jsonArray = (value) =>
    JSON.stringify(
      Array.isArray(value)
        ? value.map((entry) => String(entry || "").trim()).filter(Boolean)
        : []
    );
  const semanticRelations =
    raw.semanticRelations && typeof raw.semanticRelations === "object" && !Array.isArray(raw.semanticRelations)
      ? raw.semanticRelations
      : {};
  const enrichmentSource = {
    word: raw.word || key,
    title: raw.title || raw.word || key,
    definition,
    definitions,
    lexicalDomains: raw.lexicalDomains,
    semanticRelations,
    categories: raw.categories,
  };
  const gameSemanticThemes = Array.isArray(raw.gameSemanticThemes)
    ? raw.gameSemanticThemes
    : buildGameSemanticThemes(enrichmentSource);
  const linguisticFacts =
    Array.isArray(raw.inventorFacts) || Array.isArray(raw.doubleDefinitions)
      ? {
          inventorFacts: Array.isArray(raw.inventorFacts) ? raw.inventorFacts : [],
          doubleDefinitions: Array.isArray(raw.doubleDefinitions) ? raw.doubleDefinitions : [],
        }
      : buildWordLinguisticFacts({
          ...enrichmentSource,
          etymology,
          partOfSpeech: raw.partOfSpeech,
          source: raw.source,
        });
  return {
    key,
    word: String(raw.word || key).trim(),
    title: String(raw.title || raw.word || key).trim(),
    definition,
    definitionsJson: JSON.stringify(definitions.length ? definitions : [definition]),
    etymology,
    partOfSpeechJson: jsonArray(raw.partOfSpeech),
    lexicalDomainsJson: jsonArray(raw.lexicalDomains),
    semanticRelationsJson: JSON.stringify(semanticRelations),
    categoriesJson: jsonArray(raw.categories),
    etymologyLangsJson: jsonArray(raw.etymologyLangs),
    etymonsJson: jsonArray(raw.etymons),
    curiosityTagsJson: jsonArray(raw.curiosityTags),
    gameSemanticThemesJson: JSON.stringify(gameSemanticThemes),
    inventorFactsJson: JSON.stringify(linguisticFacts.inventorFacts || []),
    doubleDefinitionsJson: JSON.stringify(linguisticFacts.doubleDefinitions || []),
    source: String(raw.source || "wiktionary").trim() || "wiktionary",
    sourceUrl: String(raw.sourceUrl || raw.url || "").trim(),
    sourceLicense: String(raw.sourceLicense || "").trim(),
    isFormOf: raw.isFormOf ? 1 : 0,
    formOf: String(raw.formOf || "").trim(),
  };
}

async function openBuildDb(outputPath) {
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
    CREATE TABLE definitions (
      key TEXT PRIMARY KEY,
      word TEXT NOT NULL,
      title TEXT NOT NULL,
      definition TEXT NOT NULL,
      definitions_json TEXT NOT NULL,
      etymology TEXT NOT NULL DEFAULT '',
      part_of_speech_json TEXT NOT NULL DEFAULT '[]',
      lexical_domains_json TEXT NOT NULL DEFAULT '[]',
      semantic_relations_json TEXT NOT NULL DEFAULT '{}',
      categories_json TEXT NOT NULL DEFAULT '[]',
      etymology_langs_json TEXT NOT NULL DEFAULT '[]',
      etymons_json TEXT NOT NULL DEFAULT '[]',
      curiosity_tags_json TEXT NOT NULL DEFAULT '[]',
      game_semantic_themes_json TEXT NOT NULL DEFAULT '[]',
      embedding_semantic_themes_json TEXT NOT NULL DEFAULT '[]',
      inventor_facts_json TEXT NOT NULL DEFAULT '[]',
      double_definitions_json TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL,
      source_url TEXT NOT NULL,
      source_license TEXT NOT NULL,
      is_form_of INTEGER NOT NULL DEFAULT 0,
      form_of TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX idx_definitions_form_of ON definitions(form_of);
    CREATE TABLE metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

async function flushBatch(db, statement, batch) {
  if (!batch.length) return;
  await db.exec("BEGIN");
  try {
    for (const entry of batch) {
      await statement.run(
        entry.key,
        entry.word,
        entry.title,
        entry.definition,
        entry.definitionsJson,
        entry.etymology,
        entry.partOfSpeechJson,
        entry.lexicalDomainsJson,
        entry.semanticRelationsJson,
        entry.categoriesJson,
        entry.etymologyLangsJson,
        entry.etymonsJson,
        entry.curiosityTagsJson,
        entry.gameSemanticThemesJson,
        "[]",
        entry.inventorFactsJson,
        entry.doubleDefinitionsJson,
        entry.source,
        entry.sourceUrl,
        entry.sourceLicense,
        entry.isFormOf,
        entry.formOf
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

async function importDefinitions(options) {
  const startedAt = Date.now();
  const tmpOutput = `${options.output}.tmp`;
  const db = await openBuildDb(tmpOutput);
  const insert = await db.prepare(`
    INSERT OR REPLACE INTO definitions
      (key, word, title, definition, definitions_json, etymology, part_of_speech_json,
       lexical_domains_json, semantic_relations_json, categories_json, etymology_langs_json,
       etymons_json, curiosity_tags_json, game_semantic_themes_json, embedding_semantic_themes_json,
       inventor_facts_json, double_definitions_json, source, source_url,
       source_license, is_form_of, form_of)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let read = 0;
  let written = 0;
  let skipped = 0;
  const batch = [];
  const rl = readline.createInterface({
    input: createReadStream(options.input, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      read += 1;
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed = null;
      try {
        parsed = JSON.parse(trimmed);
      } catch (_) {
        skipped += 1;
        continue;
      }
      const entry = sanitizeEntry(parsed);
      if (!entry) {
        skipped += 1;
        continue;
      }
      batch.push(entry);
      written += 1;
      if (batch.length >= BATCH_SIZE) {
        await flushBatch(db, insert, batch);
      }
      if (written > 0 && written % 50000 === 0) {
        console.error(`[definitions-db] written=${written} read=${read}`);
      }
    }
    if (options.supplements) {
      try {
        const supplementRaw = await fs.readFile(options.supplements, "utf8");
        for (const line of supplementRaw.split(/\r?\n/)) {
          read += 1;
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          let parsed = null;
          try {
            parsed = JSON.parse(trimmed);
          } catch (_) {
            skipped += 1;
            continue;
          }
          const entry = sanitizeEntry(parsed);
          if (!entry) {
            skipped += 1;
            continue;
          }
          batch.push(entry);
          written += 1;
          if (batch.length >= BATCH_SIZE) {
            await flushBatch(db, insert, batch);
          }
        }
      } catch (err) {
        if (err?.code !== "ENOENT") throw err;
      }
    }
    await flushBatch(db, insert, batch);
    await insert.finalize();
    await db.run(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
      "importedAt",
      new Date().toISOString()
    );
    await db.run(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
      "source",
      path.relative(ROOT_DIR, options.input)
    );
    await db.run(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
      "enrichmentSchemaVersion",
      "2"
    );
    await db.exec("PRAGMA optimize");
  } finally {
    await db.close();
  }

  await fs.rm(options.output, { force: true });
  await fs.rename(tmpOutput, options.output);
  const elapsedMs = Date.now() - startedAt;
  console.log(
    JSON.stringify(
      {
        ok: true,
        input: options.input,
        output: options.output,
        read,
        written,
        skipped,
        elapsedMs,
      },
      null,
      2
    )
  );
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

importDefinitions(options).catch((err) => {
  console.error(`[definitions-db] erreur: ${err?.message || err}`);
  process.exit(1);
});
