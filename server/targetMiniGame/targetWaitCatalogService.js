import { readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CATALOG_PATH = path.resolve(
  __dirname,
  "../../data/target-wait-puzzles.dev.json"
);
const MAX_DEV_PUZZLES = 2000;

let cachedCatalog = null;
let cachedMtimeMs = -1;

function isUppercaseLetter(value) {
  return typeof value === "string" && /^[A-Z]$/.test(value);
}

function getWordTileLength(word) {
  return String(word || "").replaceAll("QU", "Q").length;
}

export function validateTargetWaitPuzzle(value) {
  if (!value || typeof value !== "object") return false;
  const grid = String(value.grid || "");
  const blankIndex = Number(value.blankIndex);
  const choices = Array.isArray(value.choices) ? value.choices : [];
  const answer = String(value.answer || "");
  const word = String(value.word || "");
  const solutionPath = Array.isArray(value.path) ? value.path : [];
  return (
    grid.length === 16 &&
    /^[A-Z_]{16}$/.test(grid) &&
    Number.isInteger(blankIndex) &&
    blankIndex >= 0 &&
    blankIndex < 16 &&
    grid[blankIndex] === "_" &&
    choices.length >= 4 &&
    choices.length <= 5 &&
    new Set(choices).size === choices.length &&
    choices.every(isUppercaseLetter) &&
    isUppercaseLetter(answer) &&
    choices.includes(answer) &&
    /^[A-Z]{7,}$/.test(word) &&
    solutionPath.length === getWordTileLength(word) &&
    solutionPath.every(
      (index) => Number.isInteger(index) && index >= 0 && index < 16
    ) &&
    new Set(solutionPath).size === solutionPath.length &&
    solutionPath.includes(blankIndex)
  );
}

function readCatalog(catalogPath = DEFAULT_CATALOG_PATH) {
  const stats = statSync(catalogPath);
  if (cachedCatalog && cachedMtimeMs === stats.mtimeMs) return cachedCatalog;

  const parsed = JSON.parse(readFileSync(catalogPath, "utf8"));
  const puzzles = Array.isArray(parsed?.puzzles)
    ? parsed.puzzles.filter(validateTargetWaitPuzzle)
    : [];
  if (puzzles.length === 0) {
    throw new Error("target_wait_catalog_empty");
  }
  cachedCatalog = {
    schemaVersion: Number(parsed.schemaVersion) || 1,
    generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : "",
    generator: typeof parsed.generator === "string" ? parsed.generator : "",
    puzzles,
  };
  cachedMtimeMs = stats.mtimeMs;
  return cachedCatalog;
}

export function getTargetWaitDevCatalog({ limit = 1000 } = {}) {
  const catalog = readCatalog();
  const safeLimit = Math.min(
    MAX_DEV_PUZZLES,
    Math.max(1, Math.floor(Number(limit) || 1000))
  );
  return {
    ...catalog,
    puzzles: catalog.puzzles.slice(0, safeLimit),
  };
}

export const TARGET_WAIT_DEV_CATALOG_PATH = DEFAULT_CATALOG_PATH;
