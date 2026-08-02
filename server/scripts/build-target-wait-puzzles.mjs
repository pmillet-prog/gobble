#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { performance } from "perf_hooks";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

import { normalizeWord } from "../../shared/gameLogic.js";
import {
  buildCompactTargetWaitTrie,
  createTargetWaitCatalogPayload,
  generateTargetWaitPuzzles,
  hashTargetWaitSeed,
} from "../targetMiniGame/targetWaitPuzzleGenerator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

const DEFAULT_DICTIONARY = path.join(ROOT_DIR, "public/dico.txt");
const DEFAULT_RARITY_DB = path.join(ROOT_DIR, "data/word-rarity.sqlite");
const DEFAULT_OUTPUT = path.join(ROOT_DIR, "data/target-wait-puzzles.json");
const DEFAULT_REPORT = path.join(ROOT_DIR, "data/target-wait-puzzles.report.json");

function printHelp() {
  console.log(`Usage:
  node server/scripts/build-target-wait-puzzles.mjs [options]

Options:
  --count <n>                    Nombre de grilles a produire (defaut: 1000)
  --max-attempts <n>             Limite de tentatives (defaut: count x 500)
  --seed <texte>                 Graine reproductible (defaut: gobble-target-wait-v1)
  --choices <n>                  Nombre de lettres proposees (defaut: 4)
  --min-length <n>               Longueur cible minimale (defaut: 7)
  --max-length <n>               Longueur cible maximale (defaut: 11)
  --max-per-target <n>           Variantes max par mot cible (defaut: 4)
  --min-target-found <n>         Joueurs ayant deja trouve le mot cible (defaut: 1)
  --min-common-found <n>         Joueurs ayant trouve un mot leurre naturel (defaut: 2)
  --min-correct-other-words <n>  Autres mots naturels avec la bonne lettre (defaut: 2)
  --min-decoy-common-words <n>   Mots naturels par lettre leurre (defaut: 2)
  --min-decoy-blank-words <n>    Mots totaux utilisant la case leurre (defaut: 3)
  --min-decoy-max-length <n>     Longueur mini obtenue avec un leurre (defaut: 4)
  --strict-global-unique         Rejette toute autre lettre donnant un mot aussi long
  --dictionary <path>            Dictionnaire (defaut: public/dico.txt)
  --rarity-db <path>             Base de rarete (defaut: data/word-rarity.sqlite)
  --output <path>                Catalogue compact de production
  --report <path>                Rapport detaille de generation
  --progress-every <n>           Frequence du suivi des grilles acceptees (defaut: 10)
  --help                         Affiche cette aide
`);
}

function parsePositiveInt(raw, optionName) {
  const value = Math.trunc(Number(raw));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${optionName} doit etre un entier positif`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    count: 1000,
    maxAttempts: null,
    seedText: "gobble-target-wait-v1",
    choices: 4,
    minLength: 7,
    maxLength: 11,
    maxPerTarget: 4,
    minTargetFound: 1,
    minCommonFound: 2,
    minCorrectOtherWords: 2,
    minDecoyCommonWords: 2,
    minDecoyBlankWords: 3,
    minDecoyMaxLength: 4,
    strictGlobalUnique: false,
    dictionary: DEFAULT_DICTIONARY,
    rarityDb: DEFAULT_RARITY_DB,
    output: DEFAULT_OUTPUT,
    report: DEFAULT_REPORT,
    progressEvery: 10,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Valeur manquante pour ${argument}`);
      }
      index += 1;
      return value;
    };
    const readInt = () => parsePositiveInt(readValue(), argument);
    const readPath = () => path.resolve(readValue());

    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--count") options.count = readInt();
    else if (argument === "--max-attempts") options.maxAttempts = readInt();
    else if (argument === "--seed") options.seedText = readValue();
    else if (argument === "--choices") options.choices = readInt();
    else if (argument === "--min-length") options.minLength = readInt();
    else if (argument === "--max-length") options.maxLength = readInt();
    else if (argument === "--max-per-target") options.maxPerTarget = readInt();
    else if (argument === "--min-target-found") options.minTargetFound = readInt();
    else if (argument === "--min-common-found") options.minCommonFound = readInt();
    else if (argument === "--min-correct-other-words") {
      options.minCorrectOtherWords = readInt();
    } else if (argument === "--min-decoy-common-words") {
      options.minDecoyCommonWords = readInt();
    } else if (argument === "--min-decoy-blank-words") {
      options.minDecoyBlankWords = readInt();
    } else if (argument === "--min-decoy-max-length") {
      options.minDecoyMaxLength = readInt();
    } else if (argument === "--strict-global-unique") {
      options.strictGlobalUnique = true;
    } else if (argument === "--dictionary") options.dictionary = readPath();
    else if (argument === "--rarity-db") options.rarityDb = readPath();
    else if (argument === "--output") options.output = readPath();
    else if (argument === "--report") options.report = readPath();
    else if (argument === "--progress-every") options.progressEvery = readInt();
    else throw new Error(`Option inconnue: ${argument}`);
  }

  if (options.maxLength < options.minLength) {
    throw new Error("--max-length doit etre superieur ou egal a --min-length");
  }
  options.maxAttempts = options.maxAttempts || options.count * 500;
  return options;
}

async function loadDictionary(dictionaryPath) {
  const raw = await fs.readFile(dictionaryPath, "utf8");
  const words = [];
  const seen = new Set();
  for (const line of raw.split(/\r?\n/)) {
    const word = normalizeWord(String(line || "").trim());
    if (!word || seen.has(word) || !/^[a-z]+$/.test(word)) continue;
    seen.add(word);
    words.push(word);
  }
  return words;
}

async function loadRarityData(rarityDbPath, options) {
  const db = await open({
    filename: rarityDbPath,
    driver: sqlite3.Database,
    mode: sqlite3.OPEN_READONLY,
  });
  try {
    await db.exec("PRAGMA query_only = ON");
    const targetRows = await db.all(
      `SELECT word, players_found, rarity_bucket, has_definition, is_form_of
         FROM word_rarity
        WHERE length BETWEEN ? AND ?
          AND players_found >= ?
          AND has_definition = 1
          AND is_form_of = 0
          AND rarity_bucket NOT IN ('never_found', 'extreme')`,
      options.minLength,
      options.maxLength,
      options.minTargetFound
    );
    const commonRows = await db.all(
      `SELECT word
         FROM word_rarity
        WHERE length >= 4
          AND players_found >= ?
          AND has_definition = 1
          AND is_form_of = 0
          AND rarity_bucket NOT IN ('never_found', 'extreme')`,
      options.minCommonFound
    );
    const targetWords = targetRows
      .map((row) => ({
        word: normalizeWord(String(row?.word || "")),
        playersFound: Number(row?.players_found) || 0,
        rarityBucket: String(row?.rarity_bucket || ""),
      }))
      .filter((entry) => entry.word);
    const commonWordSet = new Set(
      commonRows
        .map((row) => normalizeWord(String(row?.word || "")))
        .filter(Boolean)
    );
    return { targetWords, commonWordSet };
  } finally {
    await db.close();
  }
}

async function writeJson(filePath, payload, { pretty = true } = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const serialized = pretty
    ? JSON.stringify(payload, null, 2)
    : JSON.stringify(payload);
  await fs.writeFile(filePath, `${serialized}\n`, "utf8");
}

function formatPercent(value) {
  return `${(Math.max(0, Number(value) || 0) * 100).toFixed(2)}%`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const startedAt = performance.now();
  const seed = hashTargetWaitSeed(options.seedText);

  console.log(`[target-wait] dictionnaire: ${options.dictionary}`);
  const dictionaryWords = await loadDictionary(options.dictionary);
  console.log(`[target-wait] mots normalises: ${dictionaryWords.length}`);

  const trieStartedAt = performance.now();
  const trie = buildCompactTargetWaitTrie(dictionaryWords, {
    minLength: 2,
    maxLength: 18,
  });
  const trieDurationMs = performance.now() - trieStartedAt;
  console.log(
    `[target-wait] trie: ${trie.words.length} mots, ${trie.nodeCount} noeuds, ${trieDurationMs.toFixed(0)} ms`
  );

  const { targetWords, commonWordSet } = await loadRarityData(
    options.rarityDb,
    options
  );
  console.log(
    `[target-wait] cibles eligibles: ${targetWords.length}, mots naturels: ${commonWordSet.size}`
  );

  let lastProgressAt = 0;
  const { puzzles, report: generationReport } = generateTargetWaitPuzzles({
    trie,
    targetWords,
    commonWordSet,
    count: options.count,
    maxAttempts: options.maxAttempts,
    seed,
    choices: options.choices,
    minTargetLength: options.minLength,
    maxTargetLength: options.maxLength,
    minCorrectOtherWords: options.minCorrectOtherWords,
    minDecoyCommonWords: options.minDecoyCommonWords,
    minDecoyBlankWords: options.minDecoyBlankWords,
    minDecoyMaxLength: options.minDecoyMaxLength,
    maxPerTarget: options.maxPerTarget,
    requireGlobalUniqueness: options.strictGlobalUnique,
    onProgress: ({ accepted, attempts, requested }) => {
      if (
        accepted === requested ||
        accepted - lastProgressAt >= options.progressEvery
      ) {
        lastProgressAt = accepted;
        console.log(
          `[target-wait] ${accepted}/${requested} acceptees apres ${attempts} tentatives`
        );
      }
    },
  });

  const durationMs = performance.now() - startedAt;
  const sourceMetadata = {
    generator: "target-wait-v1",
    seed,
    seedText: options.seedText,
    source: {
      dictionary: path.relative(ROOT_DIR, options.dictionary),
      rarityDb: path.relative(ROOT_DIR, options.rarityDb),
    },
    config: {
      count: options.count,
      maxAttempts: options.maxAttempts,
      choices: options.choices,
      minLength: options.minLength,
      maxLength: options.maxLength,
      maxPerTarget: options.maxPerTarget,
      minTargetFound: options.minTargetFound,
      minCommonFound: options.minCommonFound,
      minCorrectOtherWords: options.minCorrectOtherWords,
      minDecoyCommonWords: options.minDecoyCommonWords,
      minDecoyBlankWords: options.minDecoyBlankWords,
      minDecoyMaxLength: options.minDecoyMaxLength,
      strictGlobalUnique: options.strictGlobalUnique,
    },
  };
  const catalog = createTargetWaitCatalogPayload(puzzles, sourceMetadata);
  const report = {
    generatedAt: catalog.generatedAt,
    durationMs: Math.round(durationMs),
    trie: {
      words: trie.words.length,
      nodes: trie.nodeCount,
      buildDurationMs: Math.round(trieDurationMs),
    },
    pools: {
      dictionaryWords: dictionaryWords.length,
      targetWords: targetWords.length,
      commonWords: commonWordSet.size,
    },
    ...sourceMetadata,
    generation: generationReport,
    samples: puzzles.slice(0, 30),
  };

  await Promise.all([
    writeJson(options.output, catalog, { pretty: false }),
    writeJson(options.report, report),
  ]);

  console.log(
    `[target-wait] termine: ${puzzles.length}/${options.count}, rendement ${formatPercent(
      generationReport.acceptanceRate
    )}, ${durationMs.toFixed(0)} ms`
  );
  console.log(`[target-wait] catalogue: ${options.output}`);
  console.log(`[target-wait] rapport: ${options.report}`);
  if (generationReport.exhausted) {
    console.warn(
      `[target-wait] limite atteinte avant le quota (${generationReport.attempts} tentatives)`
    );
  }
}

main().catch((error) => {
  console.error(`[target-wait] echec: ${error?.stack || error}`);
  process.exitCode = 1;
});
