import { createHash } from "crypto";

import {
  TRAINING_GRID_SIZE,
  TRAINING_MODE_MASSIVE_BOGGLE,
  TRAINING_MODE_SELF_SPECIALS_3,
  isTrainingPoolMode,
} from "./trainingPoolConfig.js";

const GRID_CELL_COUNT = TRAINING_GRID_SIZE * TRAINING_GRID_SIZE;

function normalizeCell(cell) {
  const letter = String(cell?.letter || "").trim();
  const bonus = String(cell?.bonus || "").trim() || null;
  const altLetter = String(cell?.altLetter || "").trim() || null;
  return {
    letter,
    bonus,
    ...(altLetter ? { altLetter, specialType: "fake_twins" } : null),
  };
}

function getTransformIndex(index, transform, size = TRAINING_GRID_SIZE) {
  const row = Math.floor(index / size);
  const column = index % size;
  const max = size - 1;
  const reflectedColumn = transform >= 4 ? max - column : column;
  const rotation = transform % 4;
  if (rotation === 0) return row * size + reflectedColumn;
  if (rotation === 1) return reflectedColumn * size + (max - row);
  if (rotation === 2) return (max - row) * size + (max - reflectedColumn);
  return (max - reflectedColumn) * size + row;
}

function encodeCell(cell) {
  const normalized = normalizeCell(cell);
  return `${normalized.letter}:${normalized.bonus || "-"}:${normalized.altLetter || "-"}`;
}

export function getCanonicalTrainingGridSignature(grid) {
  if (!Array.isArray(grid) || grid.length !== GRID_CELL_COUNT) return "";
  const encoded = grid.map(encodeCell);
  const signatures = [];
  for (let transform = 0; transform < 8; transform += 1) {
    const transformed = Array.from({ length: GRID_CELL_COUNT }, () => "");
    for (let sourceIndex = 0; sourceIndex < encoded.length; sourceIndex += 1) {
      transformed[getTransformIndex(sourceIndex, transform)] = encoded[sourceIndex];
    }
    signatures.push(transformed.join("|"));
  }
  signatures.sort();
  return signatures[0] || "";
}

function sanitizeJsonValue(value) {
  if (value == null) return value;
  if (value instanceof Map || value instanceof Set || typeof value === "function") {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeJsonValue).filter((entry) => entry !== undefined);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "rareBonusWordMetaMap" && key !== "ocidTargetCandidates")
        .map(([key, entry]) => [key, sanitizeJsonValue(entry)])
        .filter(([, entry]) => entry !== undefined)
    );
  }
  return value;
}

function validateGrid(grid) {
  return (
    Array.isArray(grid) &&
    grid.length === GRID_CELL_COUNT &&
    grid.every((cell) => typeof cell?.letter === "string" && cell.letter.trim())
  );
}

export function validatePreparedTrainingGrid(prepared, expectedMode) {
  const mode = String(expectedMode || "").trim();
  if (!isTrainingPoolMode(mode)) return { ok: false, error: "unsupported_mode" };
  if (!prepared || typeof prepared !== "object") return { ok: false, error: "missing_result" };
  if (!validateGrid(prepared.grid)) return { ok: false, error: "invalid_grid" };
  if (prepared?.plan?.type !== mode) return { ok: false, error: "wrong_mode" };
  if (prepared?.quality?.ok !== true) return { ok: false, error: "quality_rejected" };
  if (!Array.isArray(prepared.solutions) || prepared.solutions.length === 0) {
    return { ok: false, error: "missing_solutions" };
  }
  if (mode === "target_long" || mode === "target_score") {
    if (!prepared.targetWord || !Array.isArray(prepared.targetPath)) {
      return { ok: false, error: "missing_target" };
    }
  }
  if (mode === "bonus_letter" && !prepared?.plan?.bonusLetter) {
    return { ok: false, error: "missing_bonus_letter" };
  }
  if (mode === "fake_twins") {
    const twinIndex = Number(prepared?.plan?.twinIndex);
    if (!Number.isInteger(twinIndex) || twinIndex < 0 || twinIndex >= GRID_CELL_COUNT) {
      return { ok: false, error: "missing_fake_twins_index" };
    }
    if (!prepared?.plan?.altLetter || !prepared.grid[twinIndex]?.altLetter) {
      return { ok: false, error: "missing_fake_twins_letter" };
    }
  }
  if (mode === "finale" && Number(prepared?.plan?.tileBonusMultiplier) !== 2) {
    return { ok: false, error: "invalid_finale_multiplier" };
  }
  if (
    (mode === TRAINING_MODE_SELF_SPECIALS_3 || mode === TRAINING_MODE_MASSIVE_BOGGLE) &&
    prepared?.plan?.disableBonuses !== true
  ) {
    return { ok: false, error: "invalid_bonus_policy" };
  }
  return { ok: true, error: null };
}

export function createTrainingPoolEntry(prepared, mode) {
  const validation = validatePreparedTrainingGrid(prepared, mode);
  if (!validation.ok) return { entry: null, signature: "", error: validation.error };
  const grid = prepared.grid.map(normalizeCell);
  const signature = getCanonicalTrainingGridSignature(grid);
  if (!signature) return { entry: null, signature: "", error: "invalid_signature" };
  const id = `tr-${mode}-${createHash("sha256")
    .update(`${mode}|${signature}`)
    .digest("hex")
    .slice(0, 16)}`;
  const entry = {
    id,
    grid,
    plan: sanitizeJsonValue(prepared.plan),
    quality: sanitizeJsonValue(prepared.quality),
    targetWord: String(prepared.targetWord || "") || null,
    targetLength: Number(prepared.targetLength) || null,
    targetPath: Array.isArray(prepared.targetPath) ? prepared.targetPath : null,
    solutions: sanitizeJsonValue(prepared.solutions),
  };
  return { entry, signature, error: null };
}

export function validateTrainingPoolCatalog(catalog) {
  if (!catalog || typeof catalog !== "object") return false;
  const mode = String(catalog.mode || "").trim();
  const entries = Array.isArray(catalog.entries) ? catalog.entries : [];
  if (!isTrainingPoolMode(mode) || Number(catalog.gridSize) !== TRAINING_GRID_SIZE) return false;
  if (!entries.length) return false;
  const ids = new Set();
  const signatures = new Set();
  for (const entry of entries) {
    if (!entry?.id || ids.has(entry.id) || !validateGrid(entry.grid)) return false;
    const signature = getCanonicalTrainingGridSignature(entry.grid);
    if (!signature || signatures.has(signature)) return false;
    ids.add(entry.id);
    signatures.add(signature);
  }
  return true;
}
