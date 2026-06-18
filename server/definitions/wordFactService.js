import { normalizeWord } from "../../shared/gameLogic.js";
import { getLocalDefinitionEntry } from "./localDefinitionStore.js";

const CACHE_MAX = Number(process.env.GOBBLE_WORD_FACT_CACHE_MAX || 3000);
const factCache = new Map();
const ETYMOLOGY_DISPLAY_LANGUAGE_CODES = new Map([
  ["tr", "turc"],
  ["ru", "russe"],
  ["la", "latin"],
  ["grc", "grec ancien"],
  ["ota", "turc ottoman"],
  ["orv", "vieux russe"],
  ["fa", "persan"],
  ["ar", "arabe"],
]);

function remember(cacheKey, value) {
  if (!cacheKey || CACHE_MAX <= 0) return;
  factCache.delete(cacheKey);
  factCache.set(cacheKey, value);
  if (factCache.size > CACHE_MAX) {
    const oldest = factCache.keys().next().value;
    if (oldest) factCache.delete(oldest);
  }
}

function normalizeForMatching(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’`]/g, "'")
    .toLowerCase()
    .trim();
}

function cleanFactDefinition(text, maxLen = 155) {
  let clean = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  clean = clean.replace(/^[([{]\s*[^)\]}]{1,45}\s*[)\]}]\s*/g, "").trim();
  clean = clean.replace(/[.;:,\s]+$/g, "").trim();
  if (!clean) return "";
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen).replace(/\s+\S*$/, "").trim()}...`;
}

function cleanShortFactText(text, maxLen = 180) {
  let clean = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  clean = clean.replace(/\.\s*:.*$/g, ".").replace(/[.;:,\s]+$/g, "").trim();
  if (!clean) return "";
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen).replace(/\s+\S*$/, "").trim()}...`;
}

function clipBotFactText(text, maxLen) {
  const clean = String(text || "").trim();
  if (!clean || clean.length <= maxLen) return clean;
  const slice = clean.slice(0, maxLen);
  const boundary = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("; "),
    slice.lastIndexOf(", "),
    slice.lastIndexOf(" et "),
    slice.lastIndexOf(" ou ")
  );
  const cut = boundary >= Math.min(80, Math.floor(maxLen * 0.55))
    ? slice.slice(0, boundary)
    : slice.replace(/\s+\S*$/, "");
  return `${cut.replace(/[«“(,;:\s]+$/g, "").trim()}...`;
}

function cleanEtymologyFact(text, maxLen = 260) {
  let clean = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  clean = clean
    .replace(/:{1,2}\s*\*/g, ": ")
    .replace(/,\s*:\s*\*/g, ", ")
    .replace(/\s*\*\s*/g, " ")
    .replace(/\s*:\s*,/g, ",")
    .replace(/:\s+([a-zA-ZÀ-ÿ-]+-,)/g, ": $1")
    .replace(/\bet:\s+/gi, "et ")
    .replace(/:\s{2,}/g, ": ")
    .replace(/\.\s*:?\s*[-–—]\s*:\s*.*$/g, ".")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])\s*([,;:])/g, "$1");
  clean = clean.replace(/^[\s:;*#-]+/g, "").trim();
  clean = clean.replace(/^etymologie\s*:?\s*/i, "").trim();
  if (/\.\s*:?\s*(?:de|du|d')\s+[A-ZÀ-Þ]/.test(clean)) return "";
  for (const [code, label] of ETYMOLOGY_DISPLAY_LANGUAGE_CODES.entries()) {
    clean = clean.replace(new RegExp(`\\b(?:du|de l'|de la|des)\\s+${code}\\b`, "gi"), (match) =>
      match.replace(new RegExp(`${code}\\b`, "i"), label)
    );
  }
  clean = clean.replace(/[.;:,\s]+$/g, "").trim();
  if (!clean || clean.length < 12) return "";
  if (clean.length <= maxLen) return clean;
  return clipBotFactText(clean, maxLen);
}

function isTautologicalScientificNameEtymology(etymology, rawWord, entry) {
  const normalizedEtymology = normalizeForMatching(etymology);
  if (!/\bnom scientifique\b/.test(normalizedEtymology)) return false;
  const match = normalizedEtymology.match(/\bnom scientifique\s+([a-z][a-z'-]{2,})\b/);
  const sourceName = normalizeWord(match?.[1] || "");
  if (!sourceName) return false;
  const word = normalizeWord(entry?.title || rawWord || "");
  const formOf = normalizeWord(entry?.formOf || "");
  const candidates = new Set([word, formOf].filter(Boolean));
  for (const candidate of Array.from(candidates)) {
    if (candidate.endsWith("s") && candidate.length > 4) {
      candidates.add(candidate.slice(0, -1));
    }
  }
  return candidates.has(sourceName);
}

function isBoringOrUnsafeDefinition(text) {
  const normalized = normalizeForMatching(text);
  if (!normalized || normalized.length < 28) return true;
  if (/^(forme|feminin|masculin|pluriel|participe|conjugaison|variante|graphie|orthographe)\b/.test(normalized)) {
    return true;
  }
  if (/^(premiere|deuxieme|troisieme)\s+personne\b/.test(normalized)) return true;
  if (/\b(indicatif|subjonctif|conditionnel|imperatif|pass[eé] simple|present de|imparfait de)\b/.test(normalized)) {
    return true;
  }
  if (/\b(forme de|pluriel de|feminin de|masculin de|variante de|ancienne orthographe de)\b/.test(normalized)) {
    return true;
  }
  if (/^(celui|celle|ceux|celles) qui\b/.test(normalized)) return true;
  if (/^qui\s+/.test(normalized) && normalized.length < 70) return true;
  if (/^\(?botanique\)?\s*[.;:,-]/.test(normalized)) return true;
  return false;
}

function scoreFactDefinition(text) {
  const normalized = normalizeForMatching(text);
  let score = 0;
  if (/\b(designe|nom donne|nomme|appelle)\b/.test(normalized)) score += 4;
  if (/\b(ancien|antiquite|romains|grec|latin|mythologie|divinite|oracle)\b/.test(normalized)) {
    score += 5;
  }
  if (/\b(odeur|pluie|terre|animal|plante|insecte|maladie|epidemie|instrument|art|science|marine|echecs|argot|familier|poetique|rare)\b/.test(normalized)) {
    score += 4;
  }
  if (/\b(fromage|aliment|architecture|musique|imprimerie|medecine|astronomie|geologie)\b/.test(normalized)) {
    score += 3;
  }
  if (normalized.length >= 45 && normalized.length <= 145) score += 2;
  if (normalized.length > 190) score -= 2;
  return score;
}

function extractLemmaFromFormEntry(entry) {
  const direct = normalizeWord(entry?.formOf || "");
  if (direct && direct.length >= 3 && !new Set(["les", "des", "une", "aux"]).has(direct)) {
    return direct;
  }
  const texts = [
    entry?.definition,
    ...(Array.isArray(entry?.definitions) ? entry.definitions : []),
  ];
  for (const raw of texts) {
    const text = normalizeForMatching(raw).replace(/[().,;:!?]/g, " ");
    const patterns = [
      /\b(?:du|de la|de l'|de|d')\s+(?:verbe|nom|adjectif|adverbe|substantif|mot)\s+([a-z][a-z'-]{2,})\b/,
      /\b(?:forme|pluriel|feminin|masculin|participe|conjugaison)[^.;:!?]{0,90}\b(?:de|du|des|d')\s+([a-z][a-z'-]{2,})\b/,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const lemma = normalizeWord(match?.[1] || "");
      if (lemma && lemma.length >= 3) return lemma;
    }
  }
  return "";
}

function pickDefinitionForFact(entry) {
  const definitions = Array.isArray(entry?.definitions)
    ? entry.definitions.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const unique = [];
  const seen = new Set();
  for (const raw of [entry?.definition, ...definitions]) {
    const text = String(raw || "").trim();
    const key = normalizeForMatching(text);
    if (!text || seen.has(key) || isBoringOrUnsafeDefinition(text)) continue;
    seen.add(key);
    unique.push(text);
  }
  if (!unique.length) return "";
  return unique
    .map((text, index) => ({ text, score: scoreFactDefinition(text) - index * 0.25 }))
    .sort((a, b) => b.score - a.score)[0]?.text || "";
}

function formatEtymologyFact(rawWord, entry) {
  const etymology = cleanEtymologyFact(entry?.etymology || "");
  if (!etymology) return null;
  if (isTautologicalScientificNameEtymology(etymology, rawWord, entry)) return null;
  const word = String(entry?.title || rawWord || "").trim();
  const display = (word || rawWord || "").toUpperCase();
  if (!display) return null;
  return `Note: ${display}, ${etymology}.`;
}

function formatOfflineWordFact(rawWord, entry, definition, formHint = null) {
  const word = String(formHint?.base ? rawWord : entry?.title || rawWord || "").trim();
  const display = (word || rawWord || "").toUpperCase();
  const clean = cleanFactDefinition(definition);
  if (!display || !clean) return null;
  const formLabel = formHint?.base
    ? `${display}, forme de ${String(formHint.base || "").toUpperCase()}`
    : display;
  const normalized = normalizeForMatching(clean);
  if (/\b(vient de|emprunte|issu|derive|latin|grec)\b/.test(normalized)) {
    return `Note: ${formLabel}, ${clean}.`;
  }
  if (/\b(designe|nom donne|nomme|appelle)\b/.test(normalized)) {
    return `Définition: ${formLabel} ${clean}.`;
  }
  return `Définition: ${formLabel}, c'est ${clean}.`;
}

function buildOfflineWordFactDetails(rawWord, entry, definition, formHint = null) {
  const lookupWord = normalizeWord(rawWord);
  const title = String(entry?.title || formHint?.base || rawWord || "").trim();
  const displayWord = String(rawWord || title || "").trim().toUpperCase();
  const baseWord = String(formHint?.base || title || "").trim().toUpperCase();
  const cleanDefinition = cleanFactDefinition(definition, 135);
  const etymology = cleanEtymologyFact(entry?.etymology || "", 220);
  if (!lookupWord || !displayWord || !cleanDefinition || !etymology) return null;
  if (isTautologicalScientificNameEtymology(etymology, rawWord, entry)) return null;
  return {
    lookupWord,
    displayWord,
    baseWord,
    isForm: !!formHint?.base,
    definition: cleanDefinition,
    etymology,
  };
}

async function resolveOfflineWordFactDetails(norm, minLen, seen = new Set()) {
  if (!norm || norm.length < minLen) return null;
  if (seen.has(norm)) return null;
  seen.add(norm);

  const cacheKey = `${norm}|details:v1`;
  if (factCache.has(cacheKey)) {
    const value = factCache.get(cacheKey);
    factCache.delete(cacheKey);
    factCache.set(cacheKey, value);
    return value;
  }

  const entry = await getLocalDefinitionEntry(norm);
  if (!entry) {
    remember(cacheKey, null);
    return null;
  }

  if (entry.isFormOf) {
    const lemma = extractLemmaFromFormEntry(entry);
    if (lemma && lemma !== norm) {
      const lemmaEntry = await getLocalDefinitionEntry(lemma);
      if (lemmaEntry) {
        const definition = pickDefinitionForFact(lemmaEntry);
        const details = definition
          ? buildOfflineWordFactDetails(norm, lemmaEntry, definition, { base: lemma })
          : null;
        remember(cacheKey, details);
        return details;
      }
    }
    remember(cacheKey, null);
    return null;
  }

  const definition = pickDefinitionForFact(entry);
  const details = definition ? buildOfflineWordFactDetails(norm, entry, definition) : null;
  remember(cacheKey, details);
  return details;
}

function pickInventorFact(entry) {
  const facts = Array.isArray(entry?.inventorFacts) ? entry.inventorFacts : [];
  return facts
    .map((fact) => ({
      kind: String(fact?.kind || "").trim(),
      name: String(fact?.name || "").trim(),
      text: cleanShortFactText(fact?.text || "", 190),
      source: String(fact?.source || "").trim(),
    }))
    .filter((fact) => fact.name && fact.text)
    .sort((a, b) => {
      const rank = (kind) => (kind === "inventor" ? 0 : kind === "named_after" ? 1 : 2);
      return rank(a.kind) - rank(b.kind);
    })[0] || null;
}

function pickDoubleDefinitions(entry) {
  const senses = Array.isArray(entry?.doubleDefinitions) ? entry.doubleDefinitions : [];
  const cleaned = [];
  const seen = new Set();
  for (const sense of senses) {
    const definition = cleanShortFactText(sense?.definition || "", 145);
    const label = cleanShortFactText(sense?.label || "", 42);
    const key = normalizeForMatching(definition);
    if (!definition || seen.has(key)) continue;
    seen.add(key);
    cleaned.push({ definition, label });
    if (cleaned.length >= 3) break;
  }
  return cleaned.length >= 2 ? cleaned : [];
}

async function resolveOfflineInventorFactDetails(norm, minLen, seen = new Set()) {
  if (!norm || norm.length < minLen) return null;
  if (seen.has(norm)) return null;
  seen.add(norm);
  const cacheKey = `${norm}|inventor:v1`;
  if (factCache.has(cacheKey)) {
    const value = factCache.get(cacheKey);
    factCache.delete(cacheKey);
    factCache.set(cacheKey, value);
    return value;
  }

  const entry = await getLocalDefinitionEntry(norm);
  if (!entry) {
    remember(cacheKey, null);
    return null;
  }
  if (entry.isFormOf) {
    const lemma = extractLemmaFromFormEntry(entry);
    if (lemma && lemma !== norm) {
      const details = await resolveOfflineInventorFactDetails(lemma, minLen, seen);
      const value = details ? { ...details, lookupWord: norm, isForm: true, baseWord: lemma } : null;
      remember(cacheKey, value);
      return value;
    }
    remember(cacheKey, null);
    return null;
  }
  const fact = pickInventorFact(entry);
  const title = String(entry?.title || norm || "").trim();
  const details = fact
    ? {
        lookupWord: norm,
        displayWord: title || norm,
        baseWord: title || norm,
        isForm: false,
        fact,
      }
    : null;
  remember(cacheKey, details);
  return details;
}

async function resolveOfflineDoubleDefinitionDetails(norm, minLen, seen = new Set()) {
  if (!norm || norm.length < minLen) return null;
  if (seen.has(norm)) return null;
  seen.add(norm);
  const cacheKey = `${norm}|double-defs:v1`;
  if (factCache.has(cacheKey)) {
    const value = factCache.get(cacheKey);
    factCache.delete(cacheKey);
    factCache.set(cacheKey, value);
    return value;
  }

  const entry = await getLocalDefinitionEntry(norm);
  if (!entry) {
    remember(cacheKey, null);
    return null;
  }
  if (entry.isFormOf) {
    const lemma = extractLemmaFromFormEntry(entry);
    if (lemma && lemma !== norm) {
      const details = await resolveOfflineDoubleDefinitionDetails(lemma, minLen, seen);
      const value = details ? { ...details, lookupWord: norm, isForm: true, baseWord: lemma } : null;
      remember(cacheKey, value);
      return value;
    }
    remember(cacheKey, null);
    return null;
  }
  const definitions = pickDoubleDefinitions(entry);
  const title = String(entry?.title || norm || "").trim();
  const details = definitions.length
    ? {
        lookupWord: norm,
        displayWord: title || norm,
        baseWord: title || norm,
        isForm: false,
        definitions,
      }
    : null;
  remember(cacheKey, details);
  return details;
}

async function resolveOfflineWordFact(norm, minLen, seen = new Set(), options = {}) {
  if (!norm || norm.length < minLen) return null;
  if (seen.has(norm)) return null;
  seen.add(norm);

  const allowDefinitions = options.allowDefinitions !== false;
  const cacheKey = `${norm}|defs:${allowDefinitions ? 1 : 0}`;
  if (factCache.has(cacheKey)) {
    const value = factCache.get(cacheKey);
    factCache.delete(cacheKey);
    factCache.set(cacheKey, value);
    return value;
  }

  const entry = await getLocalDefinitionEntry(norm);
  if (!entry) {
    remember(cacheKey, null);
    return null;
  }

  if (entry.isFormOf) {
    const lemma = extractLemmaFromFormEntry(entry);
    if (lemma && lemma !== norm) {
      const lemmaEntry = await getLocalDefinitionEntry(lemma);
      if (lemmaEntry) {
        const etymologyFact = formatEtymologyFact(norm, lemmaEntry);
        if (etymologyFact) {
          remember(cacheKey, etymologyFact);
          return etymologyFact;
        }
        if (allowDefinitions) {
          const definition = pickDefinitionForFact(lemmaEntry);
          const fact = definition
            ? formatOfflineWordFact(norm, lemmaEntry, definition, { base: lemma })
            : null;
          remember(cacheKey, fact);
          return fact;
        }
      }
    }
    remember(cacheKey, null);
    return null;
  }

  const etymologyFact = formatEtymologyFact(norm, entry);
  if (etymologyFact) {
    remember(cacheKey, etymologyFact);
    return etymologyFact;
  }
  if (!allowDefinitions) {
    remember(cacheKey, null);
    return null;
  }
  const definition = pickDefinitionForFact(entry);
  const fact = definition ? formatOfflineWordFact(norm, entry, definition) : null;
  remember(cacheKey, fact);
  return fact;
}

export async function getOfflineWordFact(rawWord, options = {}) {
  const norm = normalizeWord(rawWord);
  const minLen = Number(options.minLen) || 6;
  return resolveOfflineWordFact(norm, minLen, new Set(), options);
}

export async function getOfflineWordFactDetails(rawWord, options = {}) {
  const norm = normalizeWord(rawWord);
  const minLen = Number(options.minLen) || 6;
  return resolveOfflineWordFactDetails(norm, minLen, new Set());
}

export async function getOfflineInventorFactDetails(rawWord, options = {}) {
  const norm = normalizeWord(rawWord);
  const minLen = Number(options.minLen) || 5;
  return resolveOfflineInventorFactDetails(norm, minLen, new Set());
}

export async function getOfflineDoubleDefinitionDetails(rawWord, options = {}) {
  const norm = normalizeWord(rawWord);
  const minLen = Number(options.minLen) || 5;
  return resolveOfflineDoubleDefinitionDetails(norm, minLen, new Set());
}

export function getOfflineWordFactCacheSize() {
  return factCache.size;
}
