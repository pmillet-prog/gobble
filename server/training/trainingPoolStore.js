import fs from "fs/promises";
import path from "path";

import {
  TRAINING_GRID_SIZE,
  TRAINING_POOL_SCHEMA_VERSION,
  isTrainingPoolMode,
} from "./trainingPoolConfig.js";

function validateRecord(record) {
  return (
    typeof record?.id === "string" &&
    record.id.length > 0 &&
    Number.isSafeInteger(record.offset) &&
    record.offset >= 0 &&
    Number.isSafeInteger(record.length) &&
    record.length > 0
  );
}

function validateIndex(index, expectedMode) {
  if (!index || typeof index !== "object") return false;
  if (index.schemaVersion !== TRAINING_POOL_SCHEMA_VERSION) return false;
  if (index.mode !== expectedMode || Number(index.gridSize) !== TRAINING_GRID_SIZE) return false;
  if (!Array.isArray(index.records) || index.records.length !== Number(index.count)) return false;
  if (path.basename(index.dataFile || "") !== index.dataFile) return false;
  const ids = new Set();
  let previousEnd = 0;
  for (const record of index.records) {
    if (!validateRecord(record) || ids.has(record.id) || record.offset < previousEnd) return false;
    ids.add(record.id);
    previousEnd = record.offset + record.length;
  }
  return true;
}

export function resolveTrainingPoolDir({ serverDir, env = process.env } = {}) {
  if (!serverDir) throw new Error("Le dossier serveur est requis pour localiser les pools");
  const configuredDir = String(env?.GOBBLE_TRAINING_POOL_DIR || "").trim();
  return configuredDir
    ? path.resolve(configuredDir)
    : path.resolve(serverDir, "../data/training-pools");
}

export class TrainingPoolStore {
  constructor(rootDir) {
    this.rootDir = path.resolve(rootDir);
    this.indexPromises = new Map();
  }

  async getIndex(mode) {
    const normalizedMode = String(mode || "").trim();
    if (!isTrainingPoolMode(normalizedMode)) {
      throw new Error(`training_pool_mode_unsupported:${normalizedMode}`);
    }
    if (!this.indexPromises.has(normalizedMode)) {
      const indexPromise = this.loadIndex(normalizedMode).catch((error) => {
        this.indexPromises.delete(normalizedMode);
        throw error;
      });
      this.indexPromises.set(normalizedMode, indexPromise);
    }
    return this.indexPromises.get(normalizedMode);
  }

  async loadIndex(mode) {
    const indexPath = path.join(this.rootDir, `${mode}.index.json`);
    const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
    if (!validateIndex(index, mode)) {
      throw new Error(`training_pool_index_invalid:${mode}`);
    }
    return {
      ...index,
      dataPath: path.join(this.rootDir, index.dataFile),
    };
  }

  async readRecord(index, record) {
    const handle = await fs.open(index.dataPath, "r");
    try {
      const buffer = Buffer.allocUnsafe(record.length);
      const { bytesRead } = await handle.read(buffer, 0, record.length, record.offset);
      if (bytesRead !== record.length) {
        throw new Error(`training_pool_record_truncated:${record.id}`);
      }
      const entry = JSON.parse(buffer.toString("utf8").trim());
      if (entry?.id !== record.id) {
        throw new Error(`training_pool_record_mismatch:${record.id}`);
      }
      return entry;
    } finally {
      await handle.close();
    }
  }

  async getRandomEntry(mode, { excludeIds = [], random = Math.random } = {}) {
    const index = await this.getIndex(mode);
    const excluded = new Set(Array.isArray(excludeIds) ? excludeIds : []);
    const available = index.records.filter((record) => !excluded.has(record.id));
    if (!available.length) throw new Error(`training_pool_exhausted:${mode}`);
    const randomValue = Number(random());
    const boundedValue = Number.isFinite(randomValue)
      ? Math.min(0.9999999999999999, Math.max(0, randomValue))
      : 0;
    const record = available[Math.floor(boundedValue * available.length)];
    return this.readRecord(index, record);
  }

  clearIndexCache(mode = null) {
    if (mode == null) this.indexPromises.clear();
    else this.indexPromises.delete(String(mode));
  }
}
