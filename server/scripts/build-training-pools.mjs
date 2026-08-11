#!/usr/bin/env node

import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { Worker } from "worker_threads";

import {
  TRAINING_GRID_SIZE,
  TRAINING_POOL_GENERATOR_VERSION,
  TRAINING_POOL_MODES,
  TRAINING_POOL_SCHEMA_VERSION,
  buildTrainingPoolRoundPlan,
  createTrainingRoomConfig,
  isTrainingPoolMode,
} from "../training/trainingPoolConfig.js";
import {
  createTrainingPoolEntry,
  getCanonicalTrainingGridSignature,
  validateTrainingPoolCatalog,
} from "../training/trainingPoolFormat.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const DEFAULT_OUTPUT_DIR = path.join(ROOT_DIR, "data/training-pools");
const WORKER_URL = new URL("../compute/worker.js", import.meta.url);

function printHelp() {
  console.log(`Usage:
  node server/scripts/build-training-pools.mjs [options]

Options:
  --mode <type|all>       Catégorie à générer (défaut: all)
  --count <n>             Grilles voulues par catégorie (défaut: 300)
  --workers <n>           Workers parallèles (défaut: 2 maximum)
  --max-jobs <n>          Tentatives externes maximum par catégorie (défaut: count × 12)
  --progress-every <n>    Sauvegarde et progression toutes les n grilles (défaut: 10)
  --output-dir <path>     Dossier des catalogues (défaut: data/training-pools)
  --force                 Ignore les catalogues et reprises existants
  --no-resume             Ne reprend pas le fichier partiel
  --help                  Affiche cette aide

Catégories:
  ${TRAINING_POOL_MODES.map((entry) => entry.value).join(", ")}
`);
}

function parsePositiveInt(rawValue, optionName) {
  const value = Math.trunc(Number(rawValue));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${optionName} doit être un entier positif`);
  }
  return value;
}

function parseArgs(argv) {
  const defaultWorkers = Math.max(1, Math.min(2, Number(os.availableParallelism?.()) || 1));
  const options = {
    mode: "all",
    count: 300,
    workers: defaultWorkers,
    maxJobs: null,
    progressEvery: 10,
    outputDir: DEFAULT_OUTPUT_DIR,
    force: false,
    resume: true,
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
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--mode") options.mode = String(readValue()).trim();
    else if (argument === "--count") options.count = parsePositiveInt(readValue(), argument);
    else if (argument === "--workers") options.workers = parsePositiveInt(readValue(), argument);
    else if (argument === "--max-jobs") options.maxJobs = parsePositiveInt(readValue(), argument);
    else if (argument === "--progress-every") {
      options.progressEvery = parsePositiveInt(readValue(), argument);
    } else if (argument === "--output-dir") options.outputDir = path.resolve(readValue());
    else if (argument === "--force") options.force = true;
    else if (argument === "--no-resume") options.resume = false;
    else throw new Error(`Option inconnue: ${argument}`);
  }

  if (options.mode !== "all" && !isTrainingPoolMode(options.mode)) {
    throw new Error(`Catégorie inconnue: ${options.mode}`);
  }
  options.workers = Math.max(1, Math.min(8, options.workers));
  options.maxJobs = options.maxJobs || options.count * 12;
  return options;
}

class TrainingWorkerClient {
  constructor(index) {
    this.index = index;
    this.worker = new Worker(WORKER_URL, { type: "module" });
    this.nextId = 1;
    this.pending = new Map();
    this.failed = null;
    this.worker.on("message", (message) => this.handleMessage(message));
    this.worker.on("error", (err) => this.handleFailure(err));
    this.worker.on("exit", (code) => {
      if (code !== 0 && !this.failed) {
        this.handleFailure(new Error(`training_worker_${index}_exit_${code}`));
      }
    });
  }

  handleMessage(message) {
    const pending = this.pending.get(message?.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message?.ok) pending.resolve(message.result);
    else pending.reject(new Error(message?.error || "training_worker_error"));
  }

  handleFailure(err) {
    this.failed = err instanceof Error ? err : new Error(String(err || "training_worker_error"));
    for (const pending of this.pending.values()) pending.reject(this.failed);
    this.pending.clear();
  }

  prepare(payload) {
    if (this.failed) return Promise.reject(this.failed);
    const id = `${this.index}-${this.nextId++}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type: "prepareNextGrid", payload });
    });
  }

  async close() {
    await this.worker.terminate().catch(() => {});
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (_) {
    return null;
  }
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function replaceFileWithRetry(temporaryPath, finalPath) {
  let lastError = null;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      await fs.rm(finalPath, { force: true });
      await fs.rename(temporaryPath, finalPath);
      return;
    } catch (error) {
      lastError = error;
      if (!new Set(["EPERM", "EACCES", "EBUSY"]).has(error?.code) || attempt === 12) {
        throw error;
      }
      await wait(attempt * 75);
    }
  }
  throw lastError;
}

async function writeJsonAtomic(filePath, value, { pretty = false } = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  const serialized = JSON.stringify(value, null, pretty ? 2 : 0);
  await fs.writeFile(temporaryPath, `${serialized}\n`, "utf8");
  await replaceFileWithRetry(temporaryPath, filePath);
}

async function readJsonLines(filePath) {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    return contents
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (_) {
    return [];
  }
}

async function writeCatalogAtomic({ dataPath, indexPath, mode, entries, requestedCount }) {
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  const generatedAt = new Date().toISOString();
  const records = [];
  const chunks = [];
  let offset = 0;
  for (const entry of entries) {
    const chunk = Buffer.from(`${JSON.stringify(entry)}\n`, "utf8");
    records.push({ id: entry.id, offset, length: chunk.length });
    chunks.push(chunk);
    offset += chunk.length;
  }
  const manifest = {
    schemaVersion: TRAINING_POOL_SCHEMA_VERSION,
    generator: TRAINING_POOL_GENERATOR_VERSION,
    generatedAt,
    mode,
    gridSize: TRAINING_GRID_SIZE,
    requestedCount,
    count: entries.length,
    dataFile: path.basename(dataPath),
    records,
  };
  const temporaryDataPath = `${dataPath}.tmp`;
  await fs.writeFile(temporaryDataPath, Buffer.concat(chunks));
  await replaceFileWithRetry(temporaryDataPath, dataPath);
  await writeJsonAtomic(indexPath, manifest, { pretty: true });
  return manifest;
}

function createCatalog(mode, entries, requestedCount, generatedAt = new Date().toISOString()) {
  return {
    schemaVersion: TRAINING_POOL_SCHEMA_VERSION,
    generator: TRAINING_POOL_GENERATOR_VERSION,
    generatedAt,
    mode,
    gridSize: TRAINING_GRID_SIZE,
    requestedCount,
    count: entries.length,
    entries,
  };
}

function countBy(entries, selector) {
  const counts = {};
  for (const entry of entries) {
    const key = String(selector(entry) ?? "unknown");
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function summarizeNumber(entries, selector) {
  const values = entries.map(selector).map(Number).filter(Number.isFinite);
  if (!values.length) return { min: null, max: null, average: null };
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    average: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10,
  };
}

function createReport({ mode, entries, jobsStarted, rejected, elapsedMs, requestedCount }) {
  return {
    schemaVersion: TRAINING_POOL_SCHEMA_VERSION,
    generator: TRAINING_POOL_GENERATOR_VERSION,
    generatedAt: new Date().toISOString(),
    mode,
    gridSize: TRAINING_GRID_SIZE,
    requestedCount,
    acceptedCount: entries.length,
    jobsStarted,
    elapsedMs,
    rejected,
    quality: {
      words: summarizeNumber(entries, (entry) => entry?.quality?.words),
      possibleScore: summarizeNumber(entries, (entry) => entry?.quality?.possibleScore),
      maxLength: summarizeNumber(entries, (entry) => entry?.quality?.maxLen),
      solutions: summarizeNumber(entries, (entry) => entry?.solutions?.length),
      targetLength: summarizeNumber(entries, (entry) => entry?.targetLength),
      targetLengths: countBy(
        entries.filter((entry) => Number(entry?.targetLength) > 0),
        (entry) => entry.targetLength
      ),
    },
    samples: entries.slice(0, 12).map((entry) => ({
      id: entry.id,
      letters: entry.grid.map((cell) => cell.letter).join(""),
      words: Number(entry?.quality?.words) || 0,
      possibleScore: Number(entry?.quality?.possibleScore) || 0,
      maxLength: Number(entry?.quality?.maxLen) || 0,
      targetWord: entry.targetWord || null,
    })),
  };
}

async function loadResumeEntries({ dataPath, indexPath, partialPath, mode, options }) {
  if (options.force) return [];
  const candidates = [];
  const finalIndex = await readJson(indexPath);
  if (finalIndex?.mode === mode && Number(finalIndex.count) > 0) {
    candidates.push(...(await readJsonLines(dataPath)));
  }
  if (options.resume) {
    const partialCatalogs = await Promise.all([
      readJson(partialPath),
      readJson(`${partialPath}.tmp`),
    ]);
    for (const partialCatalog of partialCatalogs) {
      if (partialCatalog?.mode === mode && Array.isArray(partialCatalog.entries)) {
        candidates.push(...partialCatalog.entries);
      }
    }
  }
  const entries = [];
  const signatures = new Set();
  for (const entry of candidates) {
    if (entries.length >= options.count) break;
    const signature = getCanonicalTrainingGridSignature(entry?.grid);
    if (!entry?.id || !signature || signatures.has(signature)) continue;
    signatures.add(signature);
    entries.push(entry);
  }
  return entries;
}

async function generateMode(mode, clients, options) {
  const startedAt = Date.now();
  const dataPath = path.join(options.outputDir, `${mode}.jsonl`);
  const indexPath = path.join(options.outputDir, `${mode}.index.json`);
  const reportPath = path.join(options.outputDir, `${mode}.report.json`);
  const partialPath = path.join(options.outputDir, `${mode}.partial.json`);
  if (!options.force) {
    const existingIndex = await readJson(indexPath);
    const existingEntries =
      existingIndex?.mode === mode && Number(existingIndex.count) === options.count
        ? await readJsonLines(dataPath)
        : [];
    const existingCatalog = createCatalog(mode, existingEntries, options.count);
    if (
      existingCatalog.entries.length === options.count &&
      validateTrainingPoolCatalog(existingCatalog)
    ) {
      console.log(`[training-pool] ${mode}: catalogue déjà complet (${options.count})`);
      return;
    }
  }
  const entries = await loadResumeEntries({
    dataPath,
    indexPath,
    partialPath,
    mode,
    options,
  });
  const signatures = new Set(entries.map((entry) => getCanonicalTrainingGridSignature(entry.grid)));
  const rejected = {};
  let jobsStarted = 0;
  let lastSavedCount = entries.length;
  let checkpointQueue = Promise.resolve();
  const roomConfig = createTrainingRoomConfig();
  const roundPlan = buildTrainingPoolRoundPlan(mode, roomConfig);

  const reject = (reason) => {
    const key = String(reason || "unknown");
    rejected[key] = (rejected[key] || 0) + 1;
  };
  const saveCheckpoint = () => {
    if (entries.length === lastSavedCount) return;
    lastSavedCount = entries.length;
    const snapshot = entries.slice();
    checkpointQueue = checkpointQueue.then(() =>
      writeJsonAtomic(partialPath, createCatalog(mode, snapshot, options.count))
    );
  };

  if (entries.length > 0) {
    console.log(`[training-pool] ${mode}: reprise à ${entries.length}/${options.count}`);
  } else {
    console.log(`[training-pool] ${mode}: génération de ${options.count} grilles`);
  }

  async function runWorker(client) {
    while (entries.length < options.count && jobsStarted < options.maxJobs) {
      jobsStarted += 1;
      const jobNumber = jobsStarted;
      let prepared = null;
      try {
        prepared = await client.prepare({
          roomConfig,
          roundPlan,
          roundNumber: jobNumber,
          cultureThemeOptions: { disabled: true },
        });
      } catch (err) {
        reject(`worker:${err?.message || "error"}`);
        continue;
      }
      if (entries.length >= options.count) return;
      const created = createTrainingPoolEntry(prepared, mode);
      if (!created.entry) {
        reject(created.error);
        continue;
      }
      if (signatures.has(created.signature)) {
        reject("duplicate_geometry");
        continue;
      }
      signatures.add(created.signature);
      entries.push(created.entry);
      if (entries.length % options.progressEvery === 0 || entries.length === options.count) {
        console.log(
          `[training-pool] ${mode}: ${entries.length}/${options.count} ` +
            `(jobs=${jobsStarted}, rejets=${Object.values(rejected).reduce((sum, value) => sum + value, 0)})`
        );
        saveCheckpoint();
      }
    }
  }

  await Promise.all(clients.map((client) => runWorker(client)));
  saveCheckpoint();
  await checkpointQueue;

  if (entries.length < options.count) {
    throw new Error(
      `${mode}: seulement ${entries.length}/${options.count} grilles après ${jobsStarted} jobs`
    );
  }

  const finalEntries = entries.slice(0, options.count);
  const catalog = createCatalog(mode, finalEntries, options.count);
  if (!validateTrainingPoolCatalog(catalog)) {
    throw new Error(`${mode}: validation finale du catalogue échouée`);
  }
  await writeCatalogAtomic({
    dataPath,
    indexPath,
    mode,
    entries: finalEntries,
    requestedCount: options.count,
  });
  const report = createReport({
    mode,
    entries: finalEntries,
    jobsStarted,
    rejected,
    elapsedMs: Date.now() - startedAt,
    requestedCount: options.count,
  });
  const [dataStats, indexStats] = await Promise.all([fs.stat(dataPath), fs.stat(indexPath)]);
  report.catalogBytes = dataStats.size + indexStats.size;
  report.dataBytes = dataStats.size;
  report.indexBytes = indexStats.size;
  await writeJsonAtomic(reportPath, report, { pretty: true });
  await fs.rm(partialPath, { force: true });
  console.log(
    `[training-pool] ${mode}: terminé (${finalEntries.length} grilles, ` +
      `${(report.catalogBytes / 1024 / 1024).toFixed(2)} Mio, ${report.elapsedMs} ms)`
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const modes =
    options.mode === "all"
      ? TRAINING_POOL_MODES.map((entry) => entry.value)
      : [options.mode];
  await fs.mkdir(options.outputDir, { recursive: true });
  const clients = Array.from(
    { length: options.workers },
    (_, index) => new TrainingWorkerClient(index + 1)
  );
  try {
    for (const mode of modes) {
      await generateMode(mode, clients, options);
    }
  } finally {
    await Promise.all(clients.map((client) => client.close()));
  }
}

main().catch((err) => {
  console.error(`[training-pool] échec: ${err?.stack || err}`);
  process.exitCode = 1;
});
