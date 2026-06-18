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

export function getOfflineWordFactCacheSize() {
  return factCache.size;
}
