import { LETTER_BAG } from "../../shared/gameLogic.js";

export const TARGET_LONG_ANCHOR_BUCKETS = Object.freeze([
  { key: "10-11", weight: 0.5, minLen: 10, maxLen: 11 },
  { key: "12-13", weight: 0.4, minLen: 12, maxLen: 13 },
  { key: "14plus", weight: 0.1, minLen: 14 },
]);

export const MONSTROUS_ANCHOR_BUCKETS = Object.freeze([
  { key: "10plus", weight: 1, minLen: 10 },
]);

const POOL_CACHE = new WeakMap();

export function randomLetterFromBag(rand = Math.random) {
  const letter = LETTER_BAG[Math.floor(rand() * LETTER_BAG.length)];
  return letter === "Q" ? "Qu" : letter;
}

export function pickWeightedBucket(rand = Math.random, buckets = TARGET_LONG_ANCHOR_BUCKETS) {
  const safeBuckets = Array.isArray(buckets) && buckets.length ? buckets : TARGET_LONG_ANCHOR_BUCKETS;
  const totalWeight = safeBuckets.reduce((sum, bucket) => sum + Math.max(0, bucket.weight || 0), 0);
  if (totalWeight <= 0) return safeBuckets[0];
  const roll = rand() * totalWeight;
  let acc = 0;
  for (const bucket of safeBuckets) {
    acc += Math.max(0, bucket.weight || 0);
    if (roll <= acc) return bucket;
  }
  return safeBuckets[safeBuckets.length - 1];
}

export function tokenizeBoggleWord(word) {
  const source = String(word || "");
  const tokens = [];
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === "q") {
      if (source[i + 1] !== "u") return null;
      tokens.push("qu");
      i += 1;
    } else {
      tokens.push(char);
    }
  }
  return tokens.length ? tokens : null;
}

function tokenToCellLetter(token) {
  return token === "qu" ? "Qu" : String(token || "").toUpperCase();
}

function buildNeighborsByIndex(size) {
  const total = size * size;
  return Array.from({ length: total }, (_, index) => {
    const row = Math.floor(index / size);
    const col = index % size;
    const out = [];
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const rr = row + dr;
        const cc = col + dc;
        if (rr >= 0 && rr < size && cc >= 0 && cc < size) {
          out.push(rr * size + cc);
        }
      }
    }
    return out;
  });
}

function randomInt(rand, maxExclusive) {
  return Math.floor(rand() * maxExclusive);
}

export function buildRandomPath(length, size = 4, rand = Math.random, maxRestarts = 250) {
  const total = size * size;
  if (length <= 0 || length > total) return null;
  const neighborsByIndex = buildNeighborsByIndex(size);
  for (let restart = 0; restart < maxRestarts; restart += 1) {
    const path = [randomInt(rand, total)];
    const used = new Set(path);
    while (path.length < length) {
      const current = path[path.length - 1];
      const choices = neighborsByIndex[current].filter((idx) => !used.has(idx));
      if (!choices.length) break;
      const next = choices[randomInt(rand, choices.length)];
      path.push(next);
      used.add(next);
    }
    if (path.length === length) return path;
  }
  return null;
}

export function buildAnchoredGrid(word, path, size = 4, rand = Math.random) {
  const tokens = tokenizeBoggleWord(word);
  const total = size * size;
  if (!tokens || !Array.isArray(path) || path.length !== tokens.length) return null;
  if (path.some((idx) => !Number.isInteger(idx) || idx < 0 || idx >= total)) return null;
  const grid = Array.from({ length: total }, () => null);
  path.forEach((cellIndex, tokenIndex) => {
    grid[cellIndex] = { letter: tokenToCellLetter(tokens[tokenIndex]), bonus: null };
  });
  for (let idx = 0; idx < grid.length; idx += 1) {
    if (!grid[idx]) grid[idx] = { letter: randomLetterFromBag(rand), bonus: null };
  }
  return grid;
}

function wordMatchesBucket(word, bucket) {
  const len = String(word || "").length;
  return len >= (bucket.minLen || 0) && (!bucket.maxLen || len <= bucket.maxLen);
}

export function getAnchorWordPools(dictionary, buckets, size = 4) {
  if (!dictionary || !(dictionary instanceof Set)) return new Map();
  let bySize = POOL_CACHE.get(dictionary);
  if (!bySize) {
    bySize = new Map();
    POOL_CACHE.set(dictionary, bySize);
  }
  const key = `${size}|${(buckets || [])
    .map((bucket) => `${bucket.key}:${bucket.minLen || 0}:${bucket.maxLen || ""}`)
    .join(",")}`;
  if (bySize.has(key)) return bySize.get(key);

  const pools = new Map((buckets || []).map((bucket) => [bucket.key, []]));
  const maxTiles = size * size;
  for (const word of dictionary) {
    const tokens = tokenizeBoggleWord(word);
    if (!tokens || tokens.length > maxTiles) continue;
    for (const bucket of buckets || []) {
      if (wordMatchesBucket(word, bucket)) pools.get(bucket.key)?.push(word);
    }
  }
  bySize.set(key, pools);
  return pools;
}

export function pickAnchorWord(dictionary, bucket, buckets, size = 4, rand = Math.random) {
  const pools = getAnchorWordPools(dictionary, buckets, size);
  const pool = pools.get(bucket?.key) || [];
  if (!pool.length) return null;
  return pool[randomInt(rand, pool.length)];
}

export function buildAnchoredGridCandidate({
  dictionary,
  buckets,
  size = 4,
  rand = Math.random,
  maxPathRestarts = 250,
} = {}) {
  const bucket = pickWeightedBucket(rand, buckets);
  const word = pickAnchorWord(dictionary, bucket, buckets, size, rand);
  const tokens = tokenizeBoggleWord(word);
  const path = tokens ? buildRandomPath(tokens.length, size, rand, maxPathRestarts) : null;
  const grid = word && path ? buildAnchoredGrid(word, path, size, rand) : null;
  if (!grid) return null;
  return {
    bucket,
    word,
    path,
    grid,
  };
}

export function pickUniqueLongestTarget(solved, requiredWord = "") {
  if (!solved || solved.size === 0 || !requiredWord) return null;
  let maxLen = 0;
  for (const word of solved.keys()) {
    if (word.length > maxLen) maxLen = word.length;
  }
  if (maxLen !== requiredWord.length) return null;
  const maxWords = [];
  for (const word of solved.keys()) {
    if (word.length === maxLen) maxWords.push(word);
    if (maxWords.length > 1) return null;
  }
  const word = maxWords[0];
  if (word !== requiredWord) return null;
  const path = solved.get(word)?.path || null;
  return { word, length: maxLen, path };
}
