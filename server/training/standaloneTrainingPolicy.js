import { getTrainingPoolModeLabel, isTrainingPoolMode } from "./trainingPoolConfig.js";
import { FAKE_TWINS_TYPE } from "../../shared/gameLogic.js";

export const TRAINING_DURATION_MIN_MS = 30 * 1000;
export const TRAINING_DURATION_MAX_MS = 10 * 60 * 1000;
export const TRAINING_RECENT_GRID_LIMIT = 30;

export function normalizeTrainingDurationMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 2 * 60 * 1000;
  return Math.min(
    TRAINING_DURATION_MAX_MS,
    Math.max(TRAINING_DURATION_MIN_MS, Math.round(numeric))
  );
}

export function normalizeTrainingMode(value) {
  const mode = String(value || "").trim();
  return isTrainingPoolMode(mode) ? mode : null;
}

export function appendRecentTrainingGridId(ids, gridId) {
  const clean = Array.isArray(ids)
    ? ids.filter((id) => typeof id === "string" && id && id !== gridId)
    : [];
  if (typeof gridId === "string" && gridId) clean.push(gridId);
  return clean.slice(-TRAINING_RECENT_GRID_LIMIT);
}

export function hydrateStandaloneTrainingGrid(entry) {
  const source = Array.isArray(entry?.grid) ? entry.grid : [];
  const grid = source.map((cell) => ({ ...cell }));
  if (entry?.plan?.type !== FAKE_TWINS_TYPE) return grid;

  const twinIndex = Number(entry?.plan?.twinIndex);
  if (!Number.isInteger(twinIndex) || twinIndex < 0 || twinIndex >= grid.length) {
    return grid;
  }
  const altLetter = String(
    grid[twinIndex]?.altLetter || entry?.plan?.altLetter || ""
  ).trim();
  if (!altLetter) return grid;
  grid[twinIndex] = {
    ...grid[twinIndex],
    altLetter,
    specialType: FAKE_TWINS_TYPE,
  };
  return grid;
}

export function buildStandaloneTrainingPayload({ entry, durationMs, sessionId, startedAt }) {
  if (!entry || typeof entry !== "object") return null;
  const mode = normalizeTrainingMode(entry?.plan?.type);
  if (!mode) return null;
  return {
    sessionId,
    gridId: entry.id,
    mode,
    label: entry?.plan?.label || getTrainingPoolModeLabel(mode),
    durationMs: normalizeTrainingDurationMs(durationMs),
    startedAt,
    grid: hydrateStandaloneTrainingGrid(entry),
    plan: entry.plan,
    quality: entry.quality,
    targetWord: entry.targetWord || null,
    targetLength: Number(entry.targetLength) || null,
    targetPath: Array.isArray(entry.targetPath) ? entry.targetPath : null,
    solutions: Array.isArray(entry.solutions) ? entry.solutions : [],
  };
}
