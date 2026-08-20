#!/usr/bin/env node

import { createReadStream, createWriteStream } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { buildGameSemanticThemes } from "../server/definitions/gameSemanticThemes.js";
import { buildWordLinguisticFacts } from "../server/definitions/wordLinguisticFacts.js";

const DEFAULT_DICTIONARY = "public/dico.txt";
const DEFAULT_OUTPUT = "data/definitions-fr.jsonl";
const DEFAULT_MAX_LENGTH = 16;
const DEFAULT_MAX_DEFINITIONS = 4;
const DEFAULT_MAX_ETYMOLOGY_LEN = 420;
const DEFAULT_PROGRESS_EVERY = 25000;
const MAX_RELATION_TERMS = 32;

const POS_LABELS = new Map([
  ["nom", "nom"],
  ["nom propre", "nom propre"],
  ["verbe", "verbe"],
  ["adjectif", "adjectif"],
  ["adverbe", "adverbe"],
  ["interjection", "interjection"],
  ["pronom", "pronom"],
  ["determinant", "déterminant"],
  ["article", "article"],
  ["preposition", "préposition"],
  ["conjonction", "conjonction"],
  ["locution", "locution"],
  ["locution nominale", "locution nominale"],
  ["locution verbale", "locution verbale"],
  ["locution adjectivale", "locution adjectivale"],
  ["locution adverbiale", "locution adverbiale"],
]);

const RELATION_SECTIONS = new Map([
  ["synonymes", "synonyms"],
  ["antonymes", "antonyms"],
  ["hyperonymes", "hypernyms"],
  ["hyponymes", "hyponyms"],
  ["meronymes", "meronyms"],
  ["meronymes", "meronyms"],
  ["holonymes", "holonyms"],
  ["derives", "derived"],
  ["derives autres langues", "derived"],
  ["apparentes", "related"],
  ["vocabulaire", "vocabulary"],
]);

const ETYMOLOGY_LANGUAGE_CODES = new Map([
  ["la", "latin"],
  ["lat", "latin"],
  ["grc", "grec ancien"],
  ["el", "grec"],
  ["gem", "germanique"],
  ["frk", "francique"],
  ["gmh", "moyen haut allemand"],
  ["goh", "vieux haut allemand"],
  ["ang", "vieil anglais"],
  ["en", "anglais"],
  ["de", "allemand"],
  ["nl", "néerlandais"],
  ["ar", "arabe"],
  ["it", "italien"],
  ["es", "espagnol"],
  ["pt", "portugais"],
  ["oc", "occitan"],
  ["tr", "turc"],
  ["ota", "turc ottoman"],
  ["fro", "ancien français"],
  ["frm", "moyen français"],
  ["orv", "vieux russe"],
  ["gaul", "gaulois"],
  ["sa", "sanskrit"],
  ["fa", "persan"],
  ["ru", "russe"],
  ["ja", "japonais"],
]);

const ETYMOLOGY_LANGUAGE_TEXT_PATTERNS = [
  ["latin", /\blatin(?:e|s)?\b/i],
  ["grec ancien", /\bgrec ancien\b|\bgrecque ancienne\b/i],
  ["grec", /\bgrec(?:que)?\b/i],
  ["germanique", /\bgermanique\b/i],
  ["francique", /\bfrancique\b/i],
  ["anglais", /\banglais(?:e)?\b/i],
  ["allemand", /\ballemand(?:e)?\b/i],
  ["néerlandais", /\bneerlandais(?:e)?\b|\bnéerlandais(?:e)?\b/i],
  ["arabe", /\barabe\b/i],
  ["italien", /\bitalien(?:ne)?\b/i],
  ["espagnol", /\bespagnol(?:e)?\b/i],
  ["occitan", /\boccitan(?:e)?\b|\bprovençal(?:e)?\b/i],
  ["ancien français", /\bancien français\b/i],
  ["moyen français", /\bmoyen français\b/i],
  ["gaulois", /\bgaulois(?:e)?\b/i],
  ["sanskrit", /\bsanskrit\b/i],
  ["persan", /\bpersan(?:e)?\b/i],
  ["russe", /\brusse\b/i],
  ["japonais", /\bjaponais(?:e)?\b/i],
];

function printHelp() {
  console.log(`Usage:
  node scripts/build-wiktionary-definitions.mjs --dump <frwiktionary.xml> [options]
  node scripts/build-wiktionary-definitions.mjs --dump - [options]

Options:
  --dictionary <path>       Dictionnaire a filtrer (defaut: ${DEFAULT_DICTIONARY})
  --output <path>           Fichier JSONL genere (defaut: ${DEFAULT_OUTPUT})
  --report <path>           Rapport JSON (defaut: <output>.report.json)
  --max-length <n>          Longueur max des mots gardes (defaut: ${DEFAULT_MAX_LENGTH})
  --max-definitions <n>     Definitions gardees par mot (defaut: ${DEFAULT_MAX_DEFINITIONS})
  --max-etymology-len <n>   Taille max de l'etymologie gardee (defaut: ${DEFAULT_MAX_ETYMOLOGY_LEN})
  --limit <n>               Arrete apres n definitions ecrites, utile pour tester
  --progress-every <n>      Log de progression toutes les n pages (defaut: ${DEFAULT_PROGRESS_EVERY})
  --quiet                   Masque les logs de progression
  --help                    Affiche cette aide

Exemples:
  node scripts/build-wiktionary-definitions.mjs --dump data/frwiktionary-latest-pages-articles.xml
  7z e -so data/frwiktionary-latest-pages-articles.xml.bz2 | node scripts/build-wiktionary-definitions.mjs --dump -

Note:
  Node ne decompresse pas le bzip2 nativement. Decompresse le dump avant, ou envoie le XML
  decompresse via stdin avec 7z, bzcat, bzip2 -dc, etc.
`);
}

function parseArgs(argv) {
  const options = {
    dictionary: DEFAULT_DICTIONARY,
    dump: "",
    output: DEFAULT_OUTPUT,
    report: "",
    maxLength: DEFAULT_MAX_LENGTH,
    maxDefinitions: DEFAULT_MAX_DEFINITIONS,
    maxEtymologyLen: DEFAULT_MAX_ETYMOLOGY_LEN,
    limit: 0,
    progressEvery: DEFAULT_PROGRESS_EVERY,
    quiet: false,
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
      return value;
    };
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--dictionary") options.dictionary = readValue();
    else if (arg === "--dump") options.dump = readValue();
    else if (arg === "--output") options.output = readValue();
    else if (arg === "--report") options.report = readValue();
    else if (arg === "--max-length") options.maxLength = readPositiveInteger(readValue(), arg);
    else if (arg === "--max-definitions") {
      options.maxDefinitions = readPositiveInteger(readValue(), arg);
    } else if (arg === "--max-etymology-len") {
      options.maxEtymologyLen = readPositiveInteger(readValue(), arg);
    } else if (arg === "--limit") options.limit = readPositiveInteger(readValue(), arg);
    else if (arg === "--progress-every") {
      options.progressEvery = readPositiveInteger(readValue(), arg);
    } else if (arg === "--quiet") options.quiet = true;
    else {
      throw new Error(`Option inconnue: ${arg}`);
    }
  }

  if (!options.report) {
    options.report = `${options.output.replace(/\.jsonl$/i, "")}.report.json`;
  }
  return options;
}

function readPositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} doit etre un entier positif`);
  }
  return parsed;
}

function normalizeKey(value) {
  return String(value || "")
    .replace(/[œŒ]/g, "oe")
    .replace(/[æÆ]/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();
}

function normalizeForText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[œ]/g, "oe")
    .replace(/[æ]/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniquePush(list, value, limit = 0) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean || list.includes(clean)) return;
  if (limit > 0 && list.length >= limit) return;
  list.push(clean);
}

function normalizeDomainLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(?:lexique|termes?)\s+(?:en\s+)?(?:français\s+)?(?:du|de la|de l'|des|de)\s+/i, "")
    .replace(/^français\s+(?:du|de la|de l'|des|de)\s+/i, "")
    .trim()
    .toLowerCase();
}

function normalizeRelationTerm(value) {
  let clean = cleanDefinitionText(value)
    .replace(/\([^)]{0,80}\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  clean = clean.replace(/^[*#:;\s-]+/g, "").replace(/[.;:,]\s*$/g, "").trim();
  if (!clean || clean.length < 2 || clean.length > 80) return "";
  if (/^(?:voir|note|exemple|prononciation|traduction)s?\b/i.test(clean)) return "";
  return clean;
}

function getFrenchSectionLines(wikitext) {
  const lines = String(wikitext || "").split(/\r?\n/);
  const kept = [];
  let inFrench = false;
  for (const line of lines) {
    const heading = parseHeading(line);
    if (heading) {
      if (isFrenchLanguageHeading(heading)) {
        inFrench = true;
        kept.push(line);
        continue;
      }
      if (inFrench && heading.level <= 2) break;
    }
    if (inFrench) kept.push(line);
  }
  return kept;
}

function extractTemplateLexeme(templateBody) {
  const parts = String(templateBody || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  const blocked = new Set(["fr", "la", "grc", "en", "de", "it", "es", "pt", "nl", "ar", "id"]);
  for (const raw of parts.slice(1)) {
    if (raw.includes("=")) continue;
    const clean = raw.replace(/^['"]+|['"]+$/g, "").trim();
    if (!clean || blocked.has(normalizeForText(clean)) || /^\d+$/.test(clean)) continue;
    return clean;
  }
  return "";
}

function extractLexemesFromWikitextLine(line) {
  const terms = [];
  const raw = String(line || "");
  for (const match of raw.matchAll(/\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|([^\]]+))?\]\]/g)) {
    uniquePush(terms, normalizeRelationTerm(match[1]), MAX_RELATION_TERMS);
  }
  for (const match of raw.matchAll(/\{\{([^{}]+)\}\}/g)) {
    const body = match[1] || "";
    const name = normalizeForText(body.split("|")[0] || "");
    if (
      name === "lien" ||
      name === "l" ||
      name === "m" ||
      name === "f" ||
      name === "mf" ||
      name === "term" ||
      name === "terme"
    ) {
      uniquePush(terms, normalizeRelationTerm(extractTemplateLexeme(body)), MAX_RELATION_TERMS);
    }
  }
  return terms;
}

async function loadDictionary(filePath, maxLength) {
  const raw = await readFile(filePath, "utf8");
  const wordsByKey = new Map();
  let totalLines = 0;
  let kept = 0;

  for (const line of raw.split(/\r?\n/)) {
    totalLines += 1;
    const word = line.trim();
    if (!word) continue;
    const key = normalizeKey(word);
    if (!key || key.length > maxLength) continue;
    if (!wordsByKey.has(key)) {
      wordsByKey.set(key, word.toUpperCase());
      kept += 1;
    }
  }

  return { wordsByKey, totalLines, kept };
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function extractPage(pageXml) {
  return {
    title: extractTag(pageXml, "title").trim(),
    text: extractTag(pageXml, "text"),
  };
}

function getDumpStream(dumpPath) {
  if (dumpPath === "-") {
    process.stdin.setEncoding("utf8");
    return process.stdin;
  }
  if (/\.bz2$/i.test(dumpPath)) {
    throw new Error(
      "Le dump .bz2 doit etre decompresse avant lecture, ou passe via stdin. Exemple: 7z e -so dump.xml.bz2 | node scripts/build-wiktionary-definitions.mjs --dump -"
    );
  }
  return createReadStream(dumpPath, { encoding: "utf8" });
}

export function replaceInlineTemplate(templateBody) {
  const parts = String(templateBody || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return "";

  const name = normalizeForText(parts[0]);
  const params = parts.slice(1);
  const positionalParams = params.filter((param) => !param.includes("="));
  const namedParam = (key) => {
    const prefix = `${key}=`;
    const found = params.find((param) => normalizeForText(param).startsWith(prefix));
    return found ? found.slice(found.indexOf("=") + 1).trim() : "";
  };
  const firstLexeme = () => {
    for (const param of params) {
      if (param.includes("=")) continue;
      if (/^[a-z]{2,3}$/i.test(param)) continue;
      if (/^\d+$/.test(param)) continue;
      return param;
    }
    return "";
  };

  if (name === "w" || name === "wp" || name === "wikipedia") {
    return (
      namedParam("texte") ||
      namedParam("titre") ||
      namedParam("label") ||
      positionalParams[1] ||
      positionalParams[0] ||
      ""
    );
  }

  if (name === "lien web" || name === "lien externe") {
    return namedParam("texte") || namedParam("titre") || namedParam("label") || "";
  }

  if (name === "date") {
    return positionalParams.join(" ");
  }

  if (name === "siecle") {
    const value = positionalParams.join(" ").trim();
    if (!value) return "";
    if (/siecle/i.test(normalizeForText(value))) return value;
    if (/^[ivxlcdm]+$/i.test(value)) return `${value}e siècle`;
    return `${value} siècle`;
  }

  if (
    name === "lien" ||
    name === "l" ||
    name === "m" ||
    name === "f" ||
    name === "mf" ||
    name === "etyl" ||
    name === "etym" ||
    name === "etymon" ||
    name === "emprunt" ||
    name.startsWith("derive") ||
    name.startsWith("compose") ||
    name.startsWith("forme") ||
    name.includes("orthographe") ||
    name.includes("graphie") ||
    name.includes("variante")
  ) {
    if (name === "etyl") {
      const code = normalizeForText(params[0] || "");
      const label = ETYMOLOGY_LANGUAGE_CODES.get(code) || code;
      const sourceWord = namedParam("mot") || namedParam("dif");
      return sourceWord ? `${label} ${sourceWord}` : label;
    }
    return firstLexeme();
  }
  return "";
}

export function cleanDefinitionText(rawText) {
  let text = String(rawText || "");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, " ");
  text = text.replace(/<ref\b[^/]*\/>/gi, " ");

  for (let i = 0; i < 8 && /\{\{[^{}]*\}\}/.test(text); i += 1) {
    text = text.replace(/\{\{([^{}]*)\}\}/g, (_, body) => replaceInlineTemplate(body));
  }

  text = text.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
  text = text.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, "$1");
  text = text.replace(/\[https?:\/\/[^\]]+\]/g, " ");
  text = text.replace(/'''+/g, "");
  text = text.replace(/''/g, "");
  text = text.replace(/<[^>]*>/g, " ");
  text = text.replace(/\{\{|\}\}/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  text = text.replace(/\s+([,.;:!?])/g, "$1");
  return text;
}

function pickPrimaryEtymologyRawText(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const termLines = lines.filter((line) => /^\s*:/.test(line) && /\{\{\s*term\s*\|/i.test(line));
  if (termLines.length >= 2) return termLines[0];
  return String(rawText || "");
}

export function cleanEtymologyText(rawText, maxLen = DEFAULT_MAX_ETYMOLOGY_LEN) {
  let text = cleanDefinitionText(pickPrimaryEtymologyRawText(rawText))
    .replace(/:{1,2}\s*\*/g, ": ")
    .replace(/,\s*:\s*\*/g, ", ")
    .replace(/\s*\*\s*/g, " ")
    .replace(/\s*:\s*,/g, ",")
    .replace(/\bet:\s+/gi, "et ")
    .replace(/:\s{2,}/g, ": ")
    .replace(/^[\s:;*#-]+/g, "")
    .replace(/\s*\([^)]*(?:prononciation|audio|ecouter|homophone)[^)]*\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  text = text.replace(/\s+([,.;:!?])/g, "$1").replace(/([,;:])\s*([,;:])/g, "$1");
  text = text.replace(/^(?:etymologie\s*:?\s*)/i, "").trim();
  if (!text || text.length < 18) return "";
  if (/^(?:voir|variante de|forme de)\s+/i.test(text)) return "";
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
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

function parseHeading(line) {
  const match = String(line || "").match(/^(=+)\s*([\s\S]*?)\s*\1\s*$/);
  if (!match) return null;
  return {
    level: match[1].length,
    text: match[2].trim(),
    normalized: normalizeForText(match[2]),
  };
}

function isFrenchLanguageHeading(heading) {
  return heading?.level === 2 && /\{\{\s*langue\s*\|\s*fr\s*\}\}/i.test(heading.text);
}

function isEtymologyHeading(heading) {
  if (!heading || heading.level < 3) return false;
  const normalized = heading.normalized;
  return (
    normalized.includes("etymologie") ||
    /\{\{\s*s\s*\|\s*(?:e|é)tymologie\b/i.test(heading.text)
  );
}

function extractFrenchEtymology(wikitext, maxLen = DEFAULT_MAX_ETYMOLOGY_LEN) {
  const lines = String(wikitext || "").split(/\r?\n/);
  let inFrench = false;
  let inEtymology = false;
  let etymologyLevel = 0;
  const parts = [];

  for (const line of lines) {
    const heading = parseHeading(line);
    if (heading) {
      if (isFrenchLanguageHeading(heading)) {
        inFrench = true;
        inEtymology = false;
        etymologyLevel = 0;
        continue;
      }
      if (inFrench && heading.level <= 2) break;
      if (!inFrench) continue;
      if (isEtymologyHeading(heading)) {
        inEtymology = true;
        etymologyLevel = heading.level;
        continue;
      }
      if (inEtymology && heading.level <= etymologyLevel) break;
      continue;
    }

    if (!inFrench || !inEtymology) continue;
    const raw = String(line || "").trim();
    if (!raw) {
      if (parts.length) break;
      continue;
    }
    if (/^\[\[(?:Catégorie|Category|Fichier|File|Image):/i.test(raw)) continue;
    if (/^\{\{(?:pron|écouter|audio|voir|cf)\b/i.test(raw)) continue;

    const cleaned = cleanEtymologyText(raw, maxLen);
    if (!cleaned) continue;
    if (!parts.includes(cleaned)) parts.push(cleaned);
    const joined = parts.join(" ");
    if (joined.length >= maxLen) return cleanEtymologyText(joined, maxLen);
  }

  return cleanEtymologyText(parts.join(" "), maxLen);
}

function extractFrenchDefinitions(wikitext, maxDefinitions) {
  const lines = String(wikitext || "").split(/\r?\n/);
  let inFrench = false;
  const definitions = [];

  for (const line of lines) {
    if (/^==\s*\{\{langue\|fr\}\}\s*==/i.test(line)) {
      inFrench = true;
      continue;
    }
    if (inFrench && /^==[^=]/.test(line)) break;
    if (!inFrench) continue;

    const match = line.match(/^#(?![#*:;])\s*(.+)/);
    if (!match) continue;

    const cleaned = cleanDefinitionText(match[1]);
    if (!cleaned || cleaned.length < 8) continue;
    if (/^(voir|variante de)\s+/i.test(cleaned)) continue;
    if (!definitions.includes(cleaned)) definitions.push(cleaned);
    if (definitions.length >= maxDefinitions) break;
  }

  return definitions;
}

function extractFrenchPartOfSpeech(wikitext) {
  const result = [];
  for (const line of getFrenchSectionLines(wikitext)) {
    const heading = parseHeading(line);
    if (!heading || heading.level < 3 || heading.level > 4) continue;
    const sectionMatch = heading.text.match(/\{\{\s*S\s*\|\s*([^|}]+)(?:\|[^}]*)?\}\}/i);
    const raw = normalizeForText(sectionMatch?.[1] || heading.text);
    const label = POS_LABELS.get(raw);
    if (label) uniquePush(result, label);
  }
  return result;
}

function extractLexicalDomains(wikitext) {
  const domains = [];
  const frenchText = getFrenchSectionLines(wikitext).join("\n");
  for (const match of frenchText.matchAll(/\{\{\s*lexique\s*\|\s*([^|}]+)(?:\|[^}]*)?\}\}/gi)) {
    uniquePush(domains, normalizeDomainLabel(match[1]));
  }
  for (const match of frenchText.matchAll(/\[\[Catégorie:([^\]]+)\]\]/gi)) {
    const category = String(match[1] || "").replace(/\|.*$/, "").trim();
    if (/^lexique en français /i.test(category)) {
      uniquePush(domains, normalizeDomainLabel(category));
    }
  }
  return domains.filter(Boolean);
}

function emptySemanticRelations() {
  return {
    synonyms: [],
    antonyms: [],
    hypernyms: [],
    hyponyms: [],
    meronyms: [],
    holonyms: [],
    derived: [],
    related: [],
    vocabulary: [],
  };
}

function extractSemanticRelations(wikitext) {
  const relations = emptySemanticRelations();
  const lines = getFrenchSectionLines(wikitext);
  let activeKey = "";
  let activeLevel = 0;

  for (const line of lines) {
    const heading = parseHeading(line);
    if (heading) {
      if (activeKey && heading.level <= activeLevel) {
        activeKey = "";
        activeLevel = 0;
      }
      const sectionMatch = heading.text.match(/\{\{\s*S\s*\|\s*([^|}]+)(?:\|[^}]*)?\}\}/i);
      const sectionName = normalizeForText(sectionMatch?.[1] || heading.text);
      const relationKey = RELATION_SECTIONS.get(sectionName);
      if (relationKey) {
        activeKey = relationKey;
        activeLevel = heading.level;
      }
      continue;
    }

    if (!activeKey || !/^\s*[*#:;]/.test(line)) continue;
    for (const term of extractLexemesFromWikitextLine(line)) {
      uniquePush(relations[activeKey], term, MAX_RELATION_TERMS);
    }
  }

  return relations;
}

function extractFrenchCategories(wikitext) {
  const categories = [];
  const frenchText = getFrenchSectionLines(wikitext).join("\n");
  for (const match of frenchText.matchAll(/\[\[Catégorie:([^\]]+)\]\]/gi)) {
    const category = String(match[1] || "").replace(/\|.*$/, "").trim();
    if (category) uniquePush(categories, category, 40);
  }
  return categories;
}

function extractRawFrenchEtymologyBlock(wikitext) {
  const lines = String(wikitext || "").split(/\r?\n/);
  let inFrench = false;
  let inEtymology = false;
  let etymologyLevel = 0;
  const parts = [];

  for (const line of lines) {
    const heading = parseHeading(line);
    if (heading) {
      if (isFrenchLanguageHeading(heading)) {
        inFrench = true;
        inEtymology = false;
        etymologyLevel = 0;
        continue;
      }
      if (inFrench && heading.level <= 2) break;
      if (!inFrench) continue;
      if (isEtymologyHeading(heading)) {
        inEtymology = true;
        etymologyLevel = heading.level;
        continue;
      }
      if (inEtymology && heading.level <= etymologyLevel) break;
      continue;
    }
    if (!inFrench || !inEtymology) continue;
    const raw = String(line || "").trim();
    if (!raw) {
      if (parts.length) break;
      continue;
    }
    if (/^\[\[(?:Catégorie|Category|Fichier|File|Image):/i.test(raw)) continue;
    parts.push(raw);
  }

  return parts.join("\n");
}

function extractEtymologyLanguages(rawEtymology, cleanedEtymology = "") {
  const langs = [];
  const raw = pickPrimaryEtymologyRawText(rawEtymology);
  for (const match of raw.matchAll(/\{\{\s*(?:étyl|etyl|étym|etym|étymon|etymon|emprunt)\s*\|\s*([^|}]+)/gi)) {
    const code = normalizeForText(match[1]);
    uniquePush(langs, ETYMOLOGY_LANGUAGE_CODES.get(code) || code);
  }
  const text = `${raw}\n${cleanedEtymology}`;
  for (const [label, pattern] of ETYMOLOGY_LANGUAGE_TEXT_PATTERNS) {
    if (pattern.test(text)) uniquePush(langs, label);
  }
  return langs;
}

function extractEtymons(rawEtymology) {
  const etymons = [];
  const raw = pickPrimaryEtymologyRawText(rawEtymology);
  const addEtymon = (value) => {
    const clean = normalizeRelationTerm(value);
    const normalized = normalizeForText(clean);
    if (!clean || normalized === "id" || normalized === "idem") return;
    uniquePush(etymons, clean, 8);
  };
  for (const match of raw.matchAll(/\{\{([^{}]+)\}\}/g)) {
    const body = match[1] || "";
    const name = normalizeForText(body.split("|")[0] || "");
    if (
      name === "lien" ||
      name === "l" ||
      name === "m" ||
      name === "etymon" ||
      name === "étymon" ||
      name === "etym" ||
      name === "étym"
    ) {
      addEtymon(extractTemplateLexeme(body));
    }
  }
  for (const match of raw.matchAll(/''([^'\n]{2,60})''/g)) {
    addEtymon(match[1]);
  }
  return etymons;
}

function buildCuriosityTags({ etymology, etymologyLangs, lexicalDomains, semanticRelations }) {
  const tags = [];
  const normalizedEtymology = normalizeForText(etymology);
  for (const lang of etymologyLangs || []) uniquePush(tags, `origine:${lang}`);
  for (const domain of lexicalDomains || []) uniquePush(tags, `domaine:${domain}`, 20);
  if (semanticRelations?.derived?.length >= 3) uniquePush(tags, "famille:derives_nombreux");
  if (semanticRelations?.related?.length >= 3) uniquePush(tags, "famille:apparentes_nombreux");
  if (/\bonomatopee\b|\bonomatop/.test(normalizedEtymology)) uniquePush(tags, "curiosite:onomatopee");
  if (/\bcontroverse|\bincertain|\bobscur|\bdiscut/.test(normalizedEtymology)) {
    uniquePush(tags, "curiosite:origine_discutee");
  }
  if (/\bemprunt/.test(normalizedEtymology)) uniquePush(tags, "curiosite:emprunt");
  if (/\bcompose|\bcomposition/.test(normalizedEtymology)) uniquePush(tags, "curiosite:compose");
  return tags;
}

function extractFormOfInfo(definition) {
  const normalized = normalizeForText(definition).replace(/[’`]/g, "'");
  if (!normalized) return null;
  if (
    !/^(?:forme|feminin|masculin|pluriel|participe|premiere|deuxieme|troisieme|variante|graphie|orthographe)\b/.test(
      normalized
    )
  ) {
    return null;
  }

  const blockedBases = new Set(["d", "l", "la", "le", "les", "de", "des", "du", "un", "une"]);
  const pickBase = (match) => {
    const base = String(match?.[1] || "").trim();
    if (!base || base.length < 2 || blockedBases.has(base)) return null;
    return base;
  };
  const patterns = [
    /\bdu verbe\s+([a-z'-]+)\b/,
    /\bde l'auxiliaire\s+([a-z'-]+)\b/,
    /\b(?:participe|conjugaison|forme)\b[\s\S]*\bd'?([a-z-]{3,})\s*$/,
    /\bde\s+([a-z'-]+)\s*$/,
    /\bde\s+([a-z'-]+)\b/,
  ];
  for (const pattern of patterns) {
    const base = pickBase(normalized.match(pattern));
    if (base) return { base, kind: "form_of" };
  }
  return null;
}

function sourceUrl(title) {
  return `https://fr.wiktionary.org/wiki/${encodeURIComponent(title)}`;
}

async function processDump(options, dictionaryInfo) {
  await mkdir(path.dirname(options.output), { recursive: true });
  await mkdir(path.dirname(options.report), { recursive: true });

  const input = getDumpStream(options.dump);
  const output = createWriteStream(options.output, { encoding: "utf8" });
  const writtenKeys = new Set();
  const stats = {
    startedAt: new Date().toISOString(),
    dictionary: options.dictionary,
    dictionaryLines: dictionaryInfo.totalLines,
    dictionaryWordsAtMaxLength: dictionaryInfo.kept,
    maxLength: options.maxLength,
    maxDefinitions: options.maxDefinitions,
    maxEtymologyLen: options.maxEtymologyLen,
    pagesRead: 0,
    matchedPages: 0,
    definitionsWritten: 0,
    etymologiesWritten: 0,
    entriesWithPartOfSpeech: 0,
    entriesWithLexicalDomains: 0,
    entriesWithSemanticRelations: 0,
    entriesWithEtymologyLanguages: 0,
    entriesWithEtymons: 0,
    entriesWithCuriosityTags: 0,
    entriesWithInventorFacts: 0,
    entriesWithDoubleDefinitions: 0,
    duplicateKeysSkipped: 0,
    capitalizedTitlesSkipped: 0,
    pagesWithoutFrenchDefinition: 0,
    source: "fr.wiktionary.org dump",
    sourceLicense: "Wiktionary content is available under CC BY-SA and GFDL terms.",
  };

  let buffer = "";
  let shouldStop = false;

  const handlePage = (pageXml) => {
    stats.pagesRead += 1;
    if (!options.quiet && stats.pagesRead % options.progressEvery === 0) {
      console.error(
        `[definitions] pages=${stats.pagesRead} matched=${stats.matchedPages} written=${stats.definitionsWritten}`
      );
    }

    const page = extractPage(pageXml);
    if (!page.title || page.title.includes(":") || page.title.includes(" ")) return;

    const key = normalizeKey(page.title);
    if (!dictionaryInfo.wordsByKey.has(key) || key.length > options.maxLength) return;
    const firstChar = Array.from(page.title)[0] || "";
    const startsWithUppercase =
      firstChar &&
      firstChar.toLocaleLowerCase("fr") !== firstChar &&
      firstChar.toLocaleUpperCase("fr") === firstChar;
    if (startsWithUppercase && normalizeKey(page.title.toLocaleLowerCase("fr")) === key) {
      stats.capitalizedTitlesSkipped += 1;
      return;
    }
    stats.matchedPages += 1;

    if (writtenKeys.has(key)) {
      stats.duplicateKeysSkipped += 1;
      return;
    }

    const definitions = extractFrenchDefinitions(page.text, options.maxDefinitions);
    if (!definitions.length) {
      stats.pagesWithoutFrenchDefinition += 1;
      return;
    }

    const formOf = extractFormOfInfo(definitions[0]);
    const rawEtymology = extractRawFrenchEtymologyBlock(page.text);
    const etymology = cleanEtymologyText(rawEtymology, options.maxEtymologyLen);
    const partOfSpeech = extractFrenchPartOfSpeech(page.text);
    const lexicalDomains = extractLexicalDomains(page.text);
    const semanticRelations = extractSemanticRelations(page.text);
    const categories = extractFrenchCategories(page.text);
    const etymologyLangs = extractEtymologyLanguages(rawEtymology, etymology);
    const etymons = extractEtymons(rawEtymology);
    const curiosityTags = buildCuriosityTags({
      etymology,
      etymologyLangs,
      lexicalDomains,
      semanticRelations,
    });
    const word = dictionaryInfo.wordsByKey.get(key);
    const entry = {
      word,
      key,
      title: page.title,
      definition: definitions[0],
      definitions,
      etymology,
      partOfSpeech,
      lexicalDomains,
      semanticRelations,
      categories,
      etymologyLangs,
      etymons,
      curiosityTags,
      source: "wiktionary",
      sourceUrl: sourceUrl(page.title),
      sourceLicense: "CC BY-SA / GFDL",
      isFormOf: Boolean(formOf),
      formOf: formOf?.base || null,
    };
    entry.gameSemanticThemes = buildGameSemanticThemes(entry);
    const linguisticFacts = buildWordLinguisticFacts(entry);
    entry.inventorFacts = linguisticFacts.inventorFacts;
    entry.doubleDefinitions = linguisticFacts.doubleDefinitions;

    output.write(`${JSON.stringify(entry)}\n`);
    writtenKeys.add(key);
    stats.definitionsWritten += 1;
    if (etymology) stats.etymologiesWritten += 1;
    if (partOfSpeech.length) stats.entriesWithPartOfSpeech += 1;
    if (lexicalDomains.length) stats.entriesWithLexicalDomains += 1;
    if (Object.values(semanticRelations).some((items) => Array.isArray(items) && items.length)) {
      stats.entriesWithSemanticRelations += 1;
    }
    if (etymologyLangs.length) stats.entriesWithEtymologyLanguages += 1;
    if (etymons.length) stats.entriesWithEtymons += 1;
    if (curiosityTags.length) stats.entriesWithCuriosityTags += 1;
    if (entry.inventorFacts.length) stats.entriesWithInventorFacts += 1;
    if (entry.doubleDefinitions.length) stats.entriesWithDoubleDefinitions += 1;

    if (options.limit && stats.definitionsWritten >= options.limit) {
      shouldStop = true;
    }
  };

  try {
    for await (const chunk of input) {
      if (shouldStop) break;
      buffer += chunk;

      while (!shouldStop) {
        const start = buffer.indexOf("<page>");
        if (start < 0) {
          if (buffer.length > 1024 * 1024) buffer = buffer.slice(-1024);
          break;
        }
        if (start > 0) buffer = buffer.slice(start);

        const end = buffer.indexOf("</page>");
        if (end < 0) break;

        const pageXml = buffer.slice(0, end + "</page>".length);
        buffer = buffer.slice(end + "</page>".length);
        handlePage(pageXml);
      }
    }
  } finally {
    await new Promise((resolve, reject) => {
      output.end((err) => (err ? reject(err) : resolve()));
    });
  }

  stats.finishedAt = new Date().toISOString();
  await writeFile(options.report, `${JSON.stringify(stats, null, 2)}\n`, "utf8");
  return stats;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.dump) {
    throw new Error("Passe un dump Wiktionnaire avec --dump <path>, ou --dump - pour stdin.");
  }

  const dictionaryInfo = await loadDictionary(options.dictionary, options.maxLength);
  if (!options.quiet) {
    console.error(
      `[definitions] dictionnaire=${dictionaryInfo.kept}/${dictionaryInfo.totalLines} mots <= ${options.maxLength}`
    );
  }

  const stats = await processDump(options, dictionaryInfo);
  console.error(
    `[definitions] termine: ${stats.definitionsWritten} definitions dans ${options.output}; rapport ${options.report}`
  );
}

const isExecutedDirectly =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isExecutedDirectly) {
  main().catch((err) => {
    console.error(`[definitions] erreur: ${err?.message || err}`);
    process.exitCode = 1;
  });
}
