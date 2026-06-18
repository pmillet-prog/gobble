#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { buildWordLinguisticFacts } from "../definitions/wordLinguisticFacts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const DEFAULT_DB = path.join(ROOT_DIR, "data/definitions-fr.sqlite");
const BATCH_SIZE = 1000;
const WORD_LINGUISTIC_FACTS_SCHEMA_VERSION = "1";

function parseArgs(argv) {
  const options = {
    db: DEFAULT_DB,
    limit: 0,
    onlyEmpty: false,
    ifNeeded: false,
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
    if (arg === "--db") options.db = path.resolve(readValue());
    else if (arg === "--limit") options.limit = Math.max(0, Math.trunc(Number(readValue()) || 0));
    else if (arg === "--only-empty") options.onlyEmpty = true;
    else if (arg === "--if-needed") options.ifNeeded = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node server/scripts/backfill-word-linguistic-facts.mjs [options]

Options:
  --db <path>       Base SQLite a enrichir (defaut: data/definitions-fr.sqlite)
  --limit <n>       Limite de lignes pour test
  --only-empty      Ne recalcule que les lignes vides
  --if-needed       Skip si la base a deja la bonne version
`);
      process.exit(0);
    } else {
      throw new Error(`Option inconnue: ${arg}`);
    }
  }
  return options;
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function ensureColumns(db) {
  const columns = await db.all("PRAGMA table_info(definitions)");
  const names = new Set(columns.map((column) => String(column?.name || "")));
  if (!names.has("inventor_facts_json")) {
    await db.exec("ALTER TABLE definitions ADD COLUMN inventor_facts_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!names.has("double_definitions_json")) {
    await db.exec("ALTER TABLE definitions ADD COLUMN double_definitions_json TEXT NOT NULL DEFAULT '[]'");
  }
}

async function ensureMetadataTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

async function readExistingSchemaVersion(dbPath) {
  let db = null;
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READONLY,
    });
    await db.exec("PRAGMA busy_timeout = 1000");
    const row = await db.get(
      "SELECT value FROM metadata WHERE key = ?",
      "wordLinguisticFactsSchemaVersion"
    );
    return String(row?.value || "");
  } catch (_) {
    return "";
  } finally {
    if (db) {
      try {
        await db.close();
      } catch (_) {}
    }
  }
}

async function run(options) {
  await fs.access(options.db);
  const startedAt = Date.now();

  if (options.ifNeeded) {
    const existingVersion = await readExistingSchemaVersion(options.db);
    if (existingVersion === WORD_LINGUISTIC_FACTS_SCHEMA_VERSION) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            skipped: true,
            reason: "word_linguistic_facts_up_to_date",
            schemaVersion: WORD_LINGUISTIC_FACTS_SCHEMA_VERSION,
            db: options.db,
          },
          null,
          2
        )
      );
      return;
    }
  }

  const db = await open({
    filename: options.db,
    driver: sqlite3.Database,
  });
  await db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY");
  await ensureColumns(db);
  await ensureMetadataTable(db);

  const where = options.onlyEmpty
    ? "WHERE inventor_facts_json IS NULL OR inventor_facts_json = '' OR double_definitions_json IS NULL OR double_definitions_json = ''"
    : "";
  const limitClause = options.limit > 0 ? `LIMIT ${options.limit}` : "";
  const rows = await db.all(
    `SELECT key, word, title, definition, definitions_json, etymology
       FROM definitions
       ${where}
      ORDER BY key
      ${limitClause}`
  );

  const update = await db.prepare(
    "UPDATE definitions SET inventor_facts_json = ?, double_definitions_json = ? WHERE key = ?"
  );
  let updated = 0;
  let withInventorFacts = 0;
  let withDoubleDefinitions = 0;
  try {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await db.exec("BEGIN");
      try {
        for (const row of batch) {
          const definitions = parseJsonArray(row.definitions_json);
          const facts = buildWordLinguisticFacts({
            word: row.word,
            title: row.title,
            definition: row.definition,
            definitions: definitions.length ? definitions : row.definition ? [row.definition] : [],
            etymology: row.etymology,
          });
          if (facts.inventorFacts.length) withInventorFacts += 1;
          if (facts.doubleDefinitions.length) withDoubleDefinitions += 1;
          await update.run(
            JSON.stringify(facts.inventorFacts),
            JSON.stringify(facts.doubleDefinitions),
            row.key
          );
          updated += 1;
        }
        await db.exec("COMMIT");
      } catch (err) {
        try {
          await db.exec("ROLLBACK");
        } catch (_) {}
        throw err;
      }
      if (updated > 0 && updated % 50000 === 0) {
        console.error(`[word-linguistic-facts] updated=${updated}/${rows.length}`);
      }
    }
  } finally {
    await update.finalize();
    await db.run(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
      "wordLinguisticFactsBackfilledAt",
      new Date().toISOString()
    );
    await db.run(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
      "wordLinguisticFactsSchemaVersion",
      WORD_LINGUISTIC_FACTS_SCHEMA_VERSION
    );
    await db.exec("PRAGMA optimize");
    await db.close();
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        db: options.db,
        rows: rows.length,
        updated,
        withInventorFacts,
        withDoubleDefinitions,
        schemaVersion: WORD_LINGUISTIC_FACTS_SCHEMA_VERSION,
        elapsedMs: Date.now() - startedAt,
      },
      null,
      2
    )
  );
}

run(parseArgs(process.argv.slice(2))).catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
