#!/usr/bin/env node
import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";
import { performance } from "perf_hooks";

import {
  applySeededBonuses,
  LETTER_BAG,
  MOVABLE_BONUS_KEYS,
  normalizeWord,
  solveGrid,
} from "../shared/gameLogic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GRID_SIZE = 4;
const GRID_CELLS = GRID_SIZE * GRID_SIZE;
const TARGET_BUCKETS = [
  { key: "10-11", weight: 0.5, minLen: 10, maxLen: 11 },
  { key: "12-13", weight: 0.4, minLen: 12, maxLen: 13 },
  { key: "14plus", weight: 0.1, minLen: 14 },
];
const MONSTROUS_BUCKETS = [
  { key: "10plus", weight: 1, minLen: 10 },
];
const MONSTROUS_MIN_WORDS = 200;
const MONSTROUS_MIN_TOTAL_SCORE = 4000;
const MONSTROUS_MIN_LONG_LEN = 10;
const MONSTROUS_MIN_LONG_WORDS = 3;

function parseArgs(argv) {
  const args = {
    count: 5,
    maxAttempts: 600,
    maxAnchors: 60,
    maxFills: 20,
    mode: "all",
    seed: 0xdecafbad,
    strategy: "both",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const raw = argv[i] || "";
    const [key, inlineValue] = raw.split("=");
    const value = inlineValue ?? argv[i + 1];
    if (inlineValue == null && value && !String(value).startsWith("--")) i += 1;
    if (key === "--count") args.count = Math.max(1, Math.trunc(Number(value) || args.count));
    else if (key === "--max-attempts") {
      args.maxAttempts = Math.max(1, Math.trunc(Number(value) || args.maxAttempts));
    } else if (key === "--max-anchors") {
      args.maxAnchors = Math.max(1, Math.trunc(Number(value) || args.maxAnchors));
    } else if (key === "--max-fills") {
      args.maxFills = Math.max(1, Math.trunc(Number(value) || args.maxFills));
    } else if (key === "--mode") {
      args.mode = ["all", "target", "monstrous"].includes(value) ? value : args.mode;
    } else if (key === "--seed") {
      args.seed = hashString(value || args.seed);
    } else if (key === "--strategy") {
      args.strategy = ["both", "baseline", "anchored"].includes(value)
        ? value
        : args.strategy;
    }
  }
  return args;
}

function hashString(input) {
  const str = String(input ?? "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = Number(seed) >>> 0;
  return function rand() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rand, maxExclusive) {
  return Math.floor(rand() * maxExclusive);
}

function pickWeightedBucket(rand, buckets) {
  const roll = rand();
  let acc = 0;
  for (const bucket of buckets) {
    acc += bucket.weight;
    if (roll <= acc) return bucket;
  }
  return buckets[buckets.length - 1];
}

function randomLetterFromBag(rand) {
  const letter = LETTER_BAG[randomInt(rand, LETTER_BAG.length)];
  return letter === "Q" ? "Qu" : letter;
}

function generatePlainGrid(rand) {
  return Array.from({ length: GRID_CELLS }, () => ({
    letter: randomLetterFromBag(rand),
    bonus: null,
  }));
}

function neighbors(index) {
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const out = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const rr = row + dr;
      const cc = col + dc;
      if (rr >= 0 && rr < GRID_SIZE && cc >= 0 && cc < GRID_SIZE) {
        out.push(rr * GRID_SIZE + cc);
      }
    }
  }
  return out;
}

const NEIGHBORS_BY_INDEX = Array.from({ length: GRID_CELLS }, (_, idx) => neighbors(idx));

function shuffleInPlace(list, rand) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = randomInt(rand, i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function buildRandomPath(length, rand, maxRestarts = 250) {
  if (length <= 0 || length > GRID_CELLS) return null;
  for (let restart = 0; restart < maxRestarts; restart += 1) {
    const path = [randomInt(rand, GRID_CELLS)];
    const used = new Set(path);
    while (path.length < length) {
      const current = path[path.length - 1];
      const choices = NEIGHBORS_BY_INDEX[current].filter((idx) => !used.has(idx));
      if (!choices.length) break;
      const next = choices[randomInt(rand, choices.length)];
      path.push(next);
      used.add(next);
    }
    if (path.length === length) return path;
  }
  return null;
}

function tokenizeBoggleWord(word) {
  const tokens = [];
  for (let i = 0; i < word.length; i += 1) {
    const char = word[i];
    if (char === "q") {
      if (word[i + 1] !== "u") return null;
      tokens.push("qu");
      i += 1;
    } else {
      tokens.push(char);
    }
  }
  return tokens.length ? tokens : null;
}

function tokenToCellLetter(token) {
  return token === "qu" ? "Qu" : token.toUpperCase();
}

function buildAnchoredGrid(word, path, rand) {
  const tokens = tokenizeBoggleWord(word);
  if (!tokens || !Array.isArray(path) || path.length !== tokens.length) return null;
  const grid = Array.from({ length: GRID_CELLS }, () => null);
  path.forEach((cellIndex, tokenIndex) => {
    grid[cellIndex] = { letter: tokenToCellLetter(tokens[tokenIndex]), bonus: null };
  });
  for (let idx = 0; idx < grid.length; idx += 1) {
    if (!grid[idx]) grid[idx] = { letter: randomLetterFromBag(rand), bonus: null };
  }
  return grid;
}

function summarizeSolved(solved, minLongLen = 0) {
  let maxLen = 0;
  let maxPts = 0;
  let totalPts = 0;
  let longWords = 0;
  for (const [word, data] of solved.entries()) {
    const len = word.length;
    const pts = Number(data?.pts) || 0;
    if (len > maxLen) maxLen = len;
    if (pts > maxPts) maxPts = pts;
    totalPts += pts;
    if (minLongLen > 0 && len >= minLongLen) longWords += 1;
  }
  return { words: solved.size, maxLen, maxPts, totalPts, longWords };
}

function validateTargetLong(solved, bucket, requiredWord = "") {
  if (!(solved instanceof Map) || solved.size === 0) return null;
  const summary = summarizeSolved(solved);
  if (bucket.maxLen && summary.maxLen > bucket.maxLen) return null;
  if (bucket.minLen && summary.maxLen < bucket.minLen) return null;
  const maxWords = [];
  for (const word of solved.keys()) {
    if (word.length === summary.maxLen) maxWords.push(word);
    if (maxWords.length > 1) return null;
  }
  const targetWord = maxWords[0] || "";
  if (requiredWord && targetWord !== requiredWord) return null;
  return {
    targetWord,
    targetLength: targetWord.length,
    quality: summary,
  };
}

function validateMonstrous(solved) {
  const summary = summarizeSolved(solved, MONSTROUS_MIN_LONG_LEN);
  const valid =
    summary.words >= MONSTROUS_MIN_WORDS &&
    summary.totalPts >= MONSTROUS_MIN_TOTAL_SCORE &&
    summary.maxLen >= MONSTROUS_MIN_LONG_LEN &&
    summary.longWords >= MONSTROUS_MIN_LONG_WORDS;
  return { valid, quality: summary };
}

function buildWordPools(dictionary) {
  const target = new Map(TARGET_BUCKETS.map((bucket) => [bucket.key, []]));
  const monstrous = new Map(MONSTROUS_BUCKETS.map((bucket) => [bucket.key, []]));
  for (const word of dictionary) {
    const tokens = tokenizeBoggleWord(word);
    if (!tokens || tokens.length > GRID_CELLS) continue;
    for (const bucket of TARGET_BUCKETS) {
      if (
        word.length >= (bucket.minLen || 0) &&
        (!bucket.maxLen || word.length <= bucket.maxLen)
      ) {
        target.get(bucket.key).push(word);
      }
    }
    for (const bucket of MONSTROUS_BUCKETS) {
      if (
        word.length >= (bucket.minLen || 0) &&
        (!bucket.maxLen || word.length <= bucket.maxLen)
      ) {
        monstrous.get(bucket.key).push(word);
      }
    }
  }
  return { target, monstrous };
}

function pickAnchorWord(poolMap, bucket, rand) {
  const pool = poolMap.get(bucket.key) || [];
  if (!pool.length) return null;
  return pool[randomInt(rand, pool.length)];
}

function runBaselineTarget(dictionary, rand, maxAttempts) {
  const bucket = pickWeightedBucket(rand, TARGET_BUCKETS);
  const startedAt = performance.now();
  let best = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const grid = generatePlainGrid(rand);
    const solved = solveGrid(grid, dictionary);
    const result = validateTargetLong(solved, bucket);
    const summary = summarizeSolved(solved);
    if (!best || summary.maxLen > best.quality.maxLen || summary.words > best.quality.words) {
      best = { quality: summary };
    }
    if (result) {
      return {
        ok: true,
        bucket: bucket.key,
        attempts: attempt,
        ms: performance.now() - startedAt,
        ...result,
      };
    }
  }
  return {
    ok: false,
    bucket: bucket.key,
    attempts: maxAttempts,
    ms: performance.now() - startedAt,
    quality: best?.quality || null,
  };
}

function runAnchoredTarget(dictionary, pools, rand, maxAttempts) {
  const bucket = pickWeightedBucket(rand, TARGET_BUCKETS);
  const startedAt = performance.now();
  let best = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const word = pickAnchorWord(pools.target, bucket, rand);
    const tokens = word ? tokenizeBoggleWord(word) : null;
    const path = tokens ? buildRandomPath(tokens.length, rand) : null;
    if (!word || !path) continue;
    const grid = buildAnchoredGrid(word, path, rand);
    const solved = solveGrid(grid, dictionary);
    const result = validateTargetLong(solved, bucket, word);
    const summary = summarizeSolved(solved);
    if (!best || summary.maxLen > best.quality.maxLen || summary.words > best.quality.words) {
      best = { quality: summary, targetWord: word };
    }
    if (result) {
      return {
        ok: true,
        bucket: bucket.key,
        attempts: attempt,
        ms: performance.now() - startedAt,
        anchorWord: word,
        anchorPath: path,
        ...result,
      };
    }
  }
  return {
    ok: false,
    bucket: bucket.key,
    attempts: maxAttempts,
    ms: performance.now() - startedAt,
    quality: best?.quality || null,
    anchorWord: best?.targetWord || null,
  };
}

function runBaselineMonstrous(dictionary, rand, maxAttempts) {
  const startedAt = performance.now();
  let best = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const seed = randomInt(rand, 0xffffffff);
    const grid = applySeededBonuses(generatePlainGrid(rand), seed, MOVABLE_BONUS_KEYS);
    const solved = solveGrid(grid, dictionary);
    const result = validateMonstrous(solved);
    if (
      !best ||
      result.quality.words > best.quality.words ||
      result.quality.longWords > best.quality.longWords
    ) {
      best = result;
    }
    if (result.valid) {
      return {
        ok: true,
        attempts: attempt,
        ms: performance.now() - startedAt,
        quality: result.quality,
      };
    }
  }
  return {
    ok: false,
    attempts: maxAttempts,
    ms: performance.now() - startedAt,
    quality: best?.quality || null,
  };
}

function runAnchoredMonstrous(dictionary, pools, rand, maxAnchors, maxFills) {
  const startedAt = performance.now();
  let solveAttempts = 0;
  let best = null;
  for (let anchorAttempt = 1; anchorAttempt <= maxAnchors; anchorAttempt += 1) {
    const bucket = pickWeightedBucket(rand, MONSTROUS_BUCKETS);
    const word = pickAnchorWord(pools.monstrous, bucket, rand);
    const tokens = word ? tokenizeBoggleWord(word) : null;
    const path = tokens ? buildRandomPath(tokens.length, rand) : null;
    if (!word || !path) continue;
    for (let fillAttempt = 1; fillAttempt <= maxFills; fillAttempt += 1) {
      const seed = randomInt(rand, 0xffffffff);
      const plain = buildAnchoredGrid(word, path, rand);
      const grid = applySeededBonuses(plain, seed, MOVABLE_BONUS_KEYS);
      const solved = solveGrid(grid, dictionary);
      solveAttempts += 1;
      const result = validateMonstrous(solved);
      if (
        !best ||
        result.quality.words > best.quality.words ||
        result.quality.longWords > best.quality.longWords
      ) {
        best = { ...result, anchorWord: word, anchorPath: path };
      }
      if (result.valid) {
        return {
          ok: true,
          anchorAttempts: anchorAttempt,
          fillAttempts: fillAttempt,
          attempts: solveAttempts,
          ms: performance.now() - startedAt,
          anchorWord: word,
          anchorPath: path,
          quality: result.quality,
        };
      }
    }
  }
  return {
    ok: false,
    anchorAttempts: maxAnchors,
    fillAttempts: maxFills,
    attempts: solveAttempts,
    ms: performance.now() - startedAt,
    anchorWord: best?.anchorWord || null,
    quality: best?.quality || null,
  };
}

function aggregate(results) {
  const count = results.length || 1;
  const successes = results.filter((entry) => entry.ok);
  const average = (selector, list = results) =>
    list.length
      ? list.reduce((sum, entry) => sum + (Number(selector(entry)) || 0), 0) / list.length
      : 0;
  return {
    runs: results.length,
    success: successes.length,
    successRate: successes.length / count,
    avgAttempts: average((entry) => entry.attempts),
    avgMs: average((entry) => entry.ms),
    avgSuccessAttempts: average((entry) => entry.attempts, successes),
    avgSuccessMs: average((entry) => entry.ms, successes),
    avgWords: average((entry) => entry.quality?.words),
    avgMaxLen: average((entry) => entry.quality?.maxLen),
    avgLongWords: average((entry) => entry.quality?.longWords),
  };
}

function printBlock(title, results) {
  const stats = aggregate(results);
  console.log(`\n${title}`);
  console.log(
    `  success=${stats.success}/${stats.runs} (${Math.round(stats.successRate * 100)}%) ` +
      `avgAttempts=${stats.avgAttempts.toFixed(1)} avgMs=${stats.avgMs.toFixed(1)} ` +
      `avgWords=${stats.avgWords.toFixed(1)} avgMaxLen=${stats.avgMaxLen.toFixed(1)} ` +
      `avgLongWords=${stats.avgLongWords.toFixed(1)}`
  );
  const examples = results
    .filter((entry) => entry.ok)
    .slice(0, 3)
    .map((entry) => entry.targetWord || entry.anchorWord)
    .filter(Boolean);
  if (examples.length) console.log(`  examples=${examples.join(", ")}`);
}

async function readDictionary() {
  const dictPath = path.join(__dirname, "../public/dico.txt");
  const raw = await fs.readFile(dictPath, "utf8");
  return new Set(
    raw
      .split(/\r?\n/)
      .map((word) => normalizeWord(word.trim()))
      .filter(Boolean)
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const dictionary = await readDictionary();
  const pools = buildWordPools(dictionary);
  const rand = mulberry32(args.seed);

  console.log(
    `[anchor-benchmark] dictionary=${dictionary.size} count=${args.count} ` +
      `maxAttempts=${args.maxAttempts} maxAnchors=${args.maxAnchors} maxFills=${args.maxFills}`
  );
  console.log(
    `[anchor-benchmark] target pools: 10-11=${pools.target.get("10-11")?.length || 0} ` +
      `12-13=${pools.target.get("12-13")?.length || 0} 14+=${pools.target.get("14plus")?.length || 0}`
  );
  console.log(
    `[anchor-benchmark] monstrous pools: 10+=${pools.monstrous.get("10plus")?.length || 0}`
  );

  if (args.mode === "all" || args.mode === "target") {
    const baseline = [];
    const anchored = [];
    for (let i = 0; i < args.count; i += 1) {
      if (args.strategy === "both" || args.strategy === "baseline") {
        baseline.push(runBaselineTarget(dictionary, rand, args.maxAttempts));
      }
      if (args.strategy === "both" || args.strategy === "anchored") {
        anchored.push(runAnchoredTarget(dictionary, pools, rand, args.maxAttempts));
      }
    }
    if (baseline.length) printBlock("target_long baseline random", baseline);
    if (anchored.length) printBlock("target_long anchored word/path", anchored);
  }

  if (args.mode === "all" || args.mode === "monstrous") {
    const baseline = [];
    const anchored = [];
    for (let i = 0; i < args.count; i += 1) {
      if (args.strategy === "both" || args.strategy === "baseline") {
        baseline.push(runBaselineMonstrous(dictionary, rand, args.maxAttempts));
      }
      if (args.strategy === "both" || args.strategy === "anchored") {
        anchored.push(runAnchoredMonstrous(dictionary, pools, rand, args.maxAnchors, args.maxFills));
      }
    }
    if (baseline.length) printBlock("monstrous baseline random", baseline);
    if (anchored.length) printBlock("monstrous anchored word/path", anchored);
  }
}

main().catch((err) => {
  console.error("[anchor-benchmark] failed", err);
  process.exit(1);
});
