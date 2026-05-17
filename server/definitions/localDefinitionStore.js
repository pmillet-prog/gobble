import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { normalizeWord } from "../../shared/gameLogic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DB_PATH = path.join(__dirname, "../../data/definitions-fr.sqlite");
const DB_PATH = process.env.GOBBLE_DEFINITIONS_DB
  ? path.resolve(process.env.GOBBLE_DEFINITIONS_DB)
  : DEFAULT_DB_PATH;
const CACHE_MAX = Number(process.env.GOBBLE_DEFINITIONS_LOCAL_CACHE_MAX || 2000);

let db = null;
let initPromise = null;
let unavailableLogged = false;
const cache = new Map();

export function normalizeDefinitionKey(value) {
  const normalized = normalizeWord(String(value || ""));
  return normalized ? normalized.toUpperCase() : "";
}

function remember(key, value) {
  if (!key || CACHE_MAX <= 0) return;
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
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
      await ready.exec("PRAGMA cache_size = -8192");
      console.log(`definitions DB ready path=${DB_PATH}`);
      db = ready;
      return db;
    } catch (err) {
      if (!unavailableLogged) {
        unavailableLogged = true;
        console.warn(
          `definitions DB unavailable path=${DB_PATH}: ${err?.message || err}`
        );
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

function serializeRow(row) {
  if (!row) return null;
  const definitions = parseDefinitionsJson(row.definitions_json);
  const definition = String(row.definition || "").trim();
  return {
    word: String(row.word || "").trim(),
    key: String(row.key || "").trim(),
    title: String(row.title || "").trim(),
    definition,
    definitions: definitions.length ? definitions : definition ? [definition] : [],
    source: String(row.source || "wiktionary").trim() || "wiktionary",
    sourceUrl: String(row.source_url || "").trim(),
    sourceLicense: String(row.source_license || "").trim(),
    isFormOf: Number(row.is_form_of) === 1,
    formOf: String(row.form_of || "").trim(),
  };
}

export async function getLocalDefinitionEntry(rawWord) {
  const key = normalizeDefinitionKey(rawWord);
  if (!key) return null;
  if (cache.has(key)) {
    const value = cache.get(key);
    cache.delete(key);
    cache.set(key, value);
    return value;
  }
  const ready = await ensureDb();
  if (!ready) return null;
  try {
    const row = await ready.get(
      `SELECT key, word, title, definition, definitions_json, source, source_url,
              source_license, is_form_of, form_of
         FROM definitions
        WHERE key = ?`,
      key
    );
    const entry = serializeRow(row);
    remember(key, entry);
    return entry;
  } catch (err) {
    console.warn(`definitions DB lookup failed key=${key}: ${err?.message || err}`);
    return null;
  }
}

export async function getLocalDefinitionStoreStatus() {
  const ready = await ensureDb();
  if (!ready) {
    return { ok: false, path: DB_PATH, entries: 0 };
  }
  try {
    const row = await ready.get("SELECT COUNT(1) AS count FROM definitions");
    return {
      ok: true,
      path: DB_PATH,
      entries: Number(row?.count) || 0,
      cacheSize: cache.size,
    };
  } catch (err) {
    return {
      ok: false,
      path: DB_PATH,
      entries: 0,
      error: String(err?.message || err),
    };
  }
}
