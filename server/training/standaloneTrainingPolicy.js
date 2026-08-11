import { getTrainingPoolModeLabel, isTrainingPoolMode } from "./trainingPoolConfig.js";

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
    grid: entry.grid,
    plan: entry.plan,
    quality: entry.quality,
    targetWord: entry.targetWord || null,
    targetLength: Number(entry.targetLength) || null,
    targetPath: Array.isArray(entry.targetPath) ? entry.targetPath : null,
    solutions: Array.isArray(entry.solutions) ? entry.solutions : [],
  };
}
