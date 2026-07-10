import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeWord } from "../../shared/gameLogic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SUPPLEMENTS_PATH = path.join(__dirname, "../../data/definition-supplements.jsonl");
const SUPPLEMENTS_PATH = process.env.GOBBLE_DEFINITION_SUPPLEMENTS
  ? path.resolve(process.env.GOBBLE_DEFINITION_SUPPLEMENTS)
  : DEFAULT_SUPPLEMENTS_PATH;

let supplementsPromise = null;
let supplements = null;
let unavailableLogged = false;

function normalizeDefinitionKey(value) {
  const normalized = normalizeWord(String(value || ""));
  return normalized ? normalized.toUpperCase() : "";
}

function parseJsonArray(value) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
}

function normalizeSupplementEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const key = normalizeDefinitionKey(raw.key || raw.word || raw.title);
  const definition = String(raw.definition || "").trim();
  if (!key || !definition) return null;
  const definitions = parseJsonArray(raw.definitions);
  return {
    word: String(raw.word || key).trim(),
    key,
    title: String(raw.title || raw.word || key).trim(),
    definition,
    definitions: definitions.length ? definitions : [definition],
    source: String(raw.source || "supplement-local").trim() || "supplement-local",
    sourceUrl: String(raw.sourceUrl || raw.url || "").trim(),
    sourceLicense: String(raw.sourceLicense || "").trim(),
    etymology: String(raw.etymology || "").trim(),
    partOfSpeech: parseJsonArray(raw.partOfSpeech),
    lexicalDomains: parseJsonArray(raw.lexicalDomains),
    semanticRelations:
      raw.semanticRelations && typeof raw.semanticRelations === "object" && !Array.isArray(raw.semanticRelations)
        ? raw.semanticRelations
        : {},
    categories: parseJsonArray(raw.categories),
    etymologyLangs: parseJsonArray(raw.etymologyLangs),
    etymons: parseJsonArray(raw.etymons),
    curiosityTags: parseJsonArray(raw.curiosityTags),
    gameSemanticThemes: Array.isArray(raw.gameSemanticThemes) ? raw.gameSemanticThemes : [],
    inventorFacts: Array.isArray(raw.inventorFacts) ? raw.inventorFacts : [],
    doubleDefinitions: Array.isArray(raw.doubleDefinitions) ? raw.doubleDefinitions : [],
    isFormOf: !!raw.isFormOf,
    formOf: String(raw.formOf || "").trim(),
  };
}

async function loadSupplements() {
  if (supplements) return supplements;
  if (supplementsPromise) return supplementsPromise;
  supplementsPromise = (async () => {
    const map = new Map();
    try {
      const raw = await fs.readFile(SUPPLEMENTS_PATH, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        try {
          const entry = normalizeSupplementEntry(JSON.parse(trimmed));
          if (entry) map.set(entry.key, entry);
        } catch (_) {}
      }
    } catch (err) {
      if (err?.code !== "ENOENT" && !unavailableLogged) {
        unavailableLogged = true;
        console.warn(`definition supplements unavailable path=${SUPPLEMENTS_PATH}: ${err?.message || err}`);
      }
    }
    supplements = map;
    return supplements;
  })();
  try {
    return await supplementsPromise;
  } finally {
    supplementsPromise = null;
  }
}

export async function getDefinitionSupplementEntry(rawWord) {
  const key = normalizeDefinitionKey(rawWord);
  if (!key) return null;
  const ready = await loadSupplements();
  return ready.get(key) || null;
}
