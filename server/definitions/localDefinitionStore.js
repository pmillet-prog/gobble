import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { normalizeWord } from "../../shared/gameLogic.js";
import { getSemanticWordOverride, mergeSemanticWordOverride } from "./semanticWordOverrides.js";
import { getDefinitionSupplementEntry } from "./definitionSupplements.js";

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
let schemaInfo = null;
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
      const columns = await ready.all("PRAGMA table_info(definitions)");
      const columnNames = new Set(
        (Array.isArray(columns) ? columns : []).map((column) => String(column?.name || ""))
      );
      schemaInfo = {
        hasEtymology: columnNames.has("etymology"),
        hasPartOfSpeech: columnNames.has("part_of_speech_json"),
        hasLexicalDomains: columnNames.has("lexical_domains_json"),
        hasSemanticRelations: columnNames.has("semantic_relations_json"),
        hasCategories: columnNames.has("categories_json"),
        hasEtymologyLangs: columnNames.has("etymology_langs_json"),
        hasEtymons: columnNames.has("etymons_json"),
        hasCuriosityTags: columnNames.has("curiosity_tags_json"),
        hasGameSemanticThemes: columnNames.has("game_semantic_themes_json"),
        hasEmbeddingSemanticThemes: columnNames.has("embedding_semantic_themes_json"),
        hasInventorFacts: columnNames.has("inventor_facts_json"),
        hasDoubleDefinitions: columnNames.has("double_definitions_json"),
      };
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

function parseJsonArray(value) {
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

function parseJsonObject(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function parseJsonObjectArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed
          .map((entry) => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
            const id = String(entry.id || "").trim();
            const label = String(entry.label || id).trim();
            const score = Math.max(0, Math.trunc(Number(entry.score) || 0));
            const confidence = String(entry.confidence || "").trim();
            const sources = Array.isArray(entry.sources)
              ? entry.sources.map((source) => String(source || "").trim()).filter(Boolean).slice(0, 12)
              : [];
            return id && label ? { id, label, score, confidence, sources } : null;
          })
          .filter(Boolean)
      : [];
  } catch (_) {
    return [];
  }
}

function parseJsonGenericObjectArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
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
    etymology: String(row.etymology || "").trim(),
    partOfSpeech: parseJsonArray(row.part_of_speech_json),
    lexicalDomains: parseJsonArray(row.lexical_domains_json),
    semanticRelations: parseJsonObject(row.semantic_relations_json),
    categories: parseJsonArray(row.categories_json),
    etymologyLangs: parseJsonArray(row.etymology_langs_json),
    etymons: parseJsonArray(row.etymons_json),
    curiosityTags: parseJsonArray(row.curiosity_tags_json),
    gameSemanticThemes: parseJsonObjectArray(row.game_semantic_themes_json),
    inventorFacts: parseJsonGenericObjectArray(row.inventor_facts_json),
    doubleDefinitions: parseJsonGenericObjectArray(row.double_definitions_json),
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
    const etymologySelect = schemaInfo?.hasEtymology ? ", etymology" : ", '' AS etymology";
    const enrichmentSelect = [
      schemaInfo?.hasPartOfSpeech ? "part_of_speech_json" : "'[]' AS part_of_speech_json",
      schemaInfo?.hasLexicalDomains ? "lexical_domains_json" : "'[]' AS lexical_domains_json",
      schemaInfo?.hasSemanticRelations ? "semantic_relations_json" : "'{}' AS semantic_relations_json",
      schemaInfo?.hasCategories ? "categories_json" : "'[]' AS categories_json",
      schemaInfo?.hasEtymologyLangs ? "etymology_langs_json" : "'[]' AS etymology_langs_json",
      schemaInfo?.hasEtymons ? "etymons_json" : "'[]' AS etymons_json",
      schemaInfo?.hasCuriosityTags ? "curiosity_tags_json" : "'[]' AS curiosity_tags_json",
      schemaInfo?.hasGameSemanticThemes
        ? "game_semantic_themes_json"
        : "'[]' AS game_semantic_themes_json",
      schemaInfo?.hasInventorFacts ? "inventor_facts_json" : "'[]' AS inventor_facts_json",
      schemaInfo?.hasDoubleDefinitions ? "double_definitions_json" : "'[]' AS double_definitions_json",
    ].join(", ");
    const row = await ready.get(
      `SELECT key, word, title, definition, definitions_json, source, source_url,
              source_license, is_form_of, form_of${etymologySelect}, ${enrichmentSelect}
         FROM definitions
        WHERE key = ?`,
      key
    );
    const supplement = row ? null : await getDefinitionSupplementEntry(rawWord);
    const entry = mergeSemanticWordOverride(
      serializeRow(row) || supplement,
      getSemanticWordOverride(key)
    );
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
        hasEtymology: !!schemaInfo?.hasEtymology,
        hasPartOfSpeech: !!schemaInfo?.hasPartOfSpeech,
        hasLexicalDomains: !!schemaInfo?.hasLexicalDomains,
        hasSemanticRelations: !!schemaInfo?.hasSemanticRelations,
        hasEtymologyLangs: !!schemaInfo?.hasEtymologyLangs,
        hasGameSemanticThemes: !!schemaInfo?.hasGameSemanticThemes,
        hasEmbeddingSemanticThemes: !!schemaInfo?.hasEmbeddingSemanticThemes,
        hasInventorFacts: !!schemaInfo?.hasInventorFacts,
        hasDoubleDefinitions: !!schemaInfo?.hasDoubleDefinitions,
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
