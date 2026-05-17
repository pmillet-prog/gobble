#!/usr/bin/env node

import { createReadStream, createWriteStream } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const DEFAULT_DICTIONARY = "public/dico.txt";
const DEFAULT_OUTPUT = "data/definitions-fr.jsonl";
const DEFAULT_MAX_LENGTH = 16;
const DEFAULT_MAX_DEFINITIONS = 4;
const DEFAULT_PROGRESS_EVERY = 25000;

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

function replaceInlineTemplate(templateBody) {
  const parts = String(templateBody || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return "";

  const name = normalizeForText(parts[0]);
  const params = parts.slice(1);
  const firstLexeme = () => {
    for (const param of params) {
      if (param.includes("=")) continue;
      if (/^[a-z]{2,3}$/i.test(param)) continue;
      if (/^\d+$/.test(param)) continue;
      return param;
    }
    return "";
  };

  if (
    name === "lien" ||
    name === "l" ||
    name === "m" ||
    name === "f" ||
    name === "mf" ||
    name.startsWith("forme") ||
    name.includes("orthographe") ||
    name.includes("graphie") ||
    name.includes("variante")
  ) {
    return firstLexeme();
  }
  return "";
}

function cleanDefinitionText(rawText) {
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

function extractFormOfInfo(definition) {
  const normalized = normalizeForText(definition);
  if (!normalized) return null;
  const match = normalized.match(
    /^(?:forme|feminin|masculin|pluriel|participe|premiere|deuxieme|troisieme|variante|graphie|orthographe)\b[\s\S]*\bde\s+([a-z'-]+)\b/
  );
  if (!match) return null;
  return { base: match[1], kind: "form_of" };
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
    pagesRead: 0,
    matchedPages: 0,
    definitionsWritten: 0,
    duplicateKeysSkipped: 0,
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
    const word = dictionaryInfo.wordsByKey.get(key);
    const entry = {
      word,
      key,
      title: page.title,
      definition: definitions[0],
      definitions,
      source: "wiktionary",
      sourceUrl: sourceUrl(page.title),
      sourceLicense: "CC BY-SA / GFDL",
      isFormOf: Boolean(formOf),
      formOf: formOf?.base || null,
    };

    output.write(`${JSON.stringify(entry)}\n`);
    writtenKeys.add(key);
    stats.definitionsWritten += 1;

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

main().catch((err) => {
  console.error(`[definitions] erreur: ${err?.message || err}`);
  process.exitCode = 1;
});
