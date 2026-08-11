#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import {
  TRAINING_POOL_MODES,
  isTrainingPoolMode,
} from "../training/trainingPoolConfig.js";
import {
  getCanonicalTrainingGridSignature,
  validatePreparedTrainingGrid,
} from "../training/trainingPoolFormat.js";
import { TrainingPoolStore } from "../training/trainingPoolStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

function parsePositiveInt(rawValue, optionName) {
  const value = Math.trunc(Number(rawValue));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${optionName} doit être un entier positif`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    mode: "all",
    count: 300,
    inputDir: path.join(ROOT_DIR, "data/training-pools"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Valeur manquante pour ${argument}`);
    index += 1;
    if (argument === "--mode") options.mode = String(value).trim();
    else if (argument === "--count") options.count = parsePositiveInt(value, argument);
    else if (argument === "--input-dir") options.inputDir = path.resolve(value);
    else throw new Error(`Option inconnue: ${argument}`);
  }
  if (options.mode !== "all" && !isTrainingPoolMode(options.mode)) {
    throw new Error(`Catégorie inconnue: ${options.mode}`);
  }
  return options;
}

async function verifyMode(store, mode, expectedCount) {
  const index = await store.getIndex(mode);
  if (index.count !== expectedCount) {
    throw new Error(`${mode}: ${index.count}/${expectedCount} grilles`);
  }
  const ids = new Set();
  const signatures = new Set();
  for (const record of index.records) {
    const entry = await store.readRecord(index, record);
    const validation = validatePreparedTrainingGrid(entry, mode);
    if (!validation.ok) throw new Error(`${mode}:${entry.id}:${validation.error}`);
    const signature = getCanonicalTrainingGridSignature(entry.grid);
    if (ids.has(entry.id)) throw new Error(`${mode}:identifiant dupliqué:${entry.id}`);
    if (signatures.has(signature)) throw new Error(`${mode}:géométrie dupliquée:${entry.id}`);
    ids.add(entry.id);
    signatures.add(signature);
  }
  const dataStats = await fs.stat(index.dataPath);
  const lastRecord = index.records.at(-1);
  const expectedBytes = lastRecord ? lastRecord.offset + lastRecord.length : 0;
  if (dataStats.size !== expectedBytes) {
    throw new Error(`${mode}:taille incohérente:${dataStats.size}/${expectedBytes}`);
  }
  console.log(`[training-pool:verify] ${mode}: ${index.count} grilles valides`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const modes =
    options.mode === "all"
      ? TRAINING_POOL_MODES.map((entry) => entry.value)
      : [options.mode];
  const store = new TrainingPoolStore(options.inputDir);
  for (const mode of modes) await verifyMode(store, mode, options.count);
}

main().catch((error) => {
  console.error(`[training-pool:verify] échec: ${error?.stack || error}`);
  process.exitCode = 1;
});

