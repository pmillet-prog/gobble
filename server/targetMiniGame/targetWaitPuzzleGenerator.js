import { LETTER_BAG, normalizeWord } from "../../shared/gameLogic.js";

export const TARGET_WAIT_GRID_SIZE = 4;
export const TARGET_WAIT_GRID_CELLS = TARGET_WAIT_GRID_SIZE * TARGET_WAIT_GRID_SIZE;
export const TARGET_WAIT_SCHEMA_VERSION = 1;

const QU_TOKEN_CODE = 26;
const LETTER_CODES = Object.freeze(
  Array.from({ length: 26 }, (_, index) => String.fromCharCode(97 + index))
);
const REPLACEMENT_LETTERS = Object.freeze(
  Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index))
);

function toPositiveInt(value, fallback) {
  const parsed = Math.trunc(Number(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function hashTargetWaitSeed(value) {
  const input = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createTargetWaitRandom(seed) {
  let state = Number(seed) >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(random, maxExclusive) {
  return Math.floor(random() * maxExclusive);
}

function shuffleInPlace(values, random) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(random, index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

export function tokenizeTargetWaitWord(rawWord) {
  const word = normalizeWord(String(rawWord || ""));
  if (!word || !/^[a-z]+$/.test(word)) return null;
  const tokens = [];
  for (let index = 0; index < word.length; index += 1) {
    const character = word[index];
    if (character === "q") {
      if (word[index + 1] !== "u") return null;
      tokens.push("qu");
      index += 1;
    } else {
      tokens.push(character);
    }
  }
  return tokens.length ? tokens : null;
}

function tokenToCode(token) {
  const normalized = String(token || "").trim().toLowerCase();
  if (normalized === "qu" || normalized === "q") return QU_TOKEN_CODE;
  if (!/^[a-z]$/.test(normalized)) return -1;
  return normalized.charCodeAt(0) - 97;
}

function codeToCellLetter(code) {
  return code === QU_TOKEN_CODE ? "Qu" : String.fromCharCode(65 + code);
}

function normalizeBoardCell(cell) {
  const raw =
    cell && typeof cell === "object" && !Array.isArray(cell) ? cell.letter : cell;
  const value = String(raw || "").trim();
  if (!value || value === "_") return "";
  const code = tokenToCode(value);
  return code >= 0 ? codeToCellLetter(code) : "";
}

function buildNeighbors(size = TARGET_WAIT_GRID_SIZE) {
  const total = size * size;
  return Array.from({ length: total }, (_, index) => {
    const row = Math.floor(index / size);
    const column = index % size;
    const neighbors = [];
    for (let rowDelta = -1; rowDelta <= 1; rowDelta += 1) {
      for (let columnDelta = -1; columnDelta <= 1; columnDelta += 1) {
        if (rowDelta === 0 && columnDelta === 0) continue;
        const nextRow = row + rowDelta;
        const nextColumn = column + columnDelta;
        if (
          nextRow >= 0 &&
          nextRow < size &&
          nextColumn >= 0 &&
          nextColumn < size
        ) {
          neighbors.push(nextRow * size + nextColumn);
        }
      }
    }
    return neighbors;
  });
}

const NEIGHBORS_BY_INDEX = buildNeighbors();

export function buildTargetWaitPath(length, random, maxRestarts = 250) {
  const safeLength = toPositiveInt(length, 0);
  if (!safeLength || safeLength > TARGET_WAIT_GRID_CELLS) return null;
  for (let restart = 0; restart < maxRestarts; restart += 1) {
    const path = [randomInt(random, TARGET_WAIT_GRID_CELLS)];
    let usedMask = 1 << path[0];
    while (path.length < safeLength) {
      const current = path[path.length - 1];
      const choices = NEIGHBORS_BY_INDEX[current].filter(
        (index) => (usedMask & (1 << index)) === 0
      );
      if (!choices.length) break;
      const nextIndex = choices[randomInt(random, choices.length)];
      path.push(nextIndex);
      usedMask |= 1 << nextIndex;
    }
    if (path.length === safeLength) return path;
  }
  return null;
}

function randomCellLetter(random) {
  const letter = LETTER_BAG[randomInt(random, LETTER_BAG.length)];
  return letter === "Q" ? "Qu" : letter;
}

export function buildAnchoredTargetWaitBoard(word, path, random) {
  const tokens = tokenizeTargetWaitWord(word);
  if (
    !tokens ||
    !Array.isArray(path) ||
    tokens.length !== path.length ||
    new Set(path).size !== path.length
  ) {
    return null;
  }
  const board = Array.from({ length: TARGET_WAIT_GRID_CELLS }, () => "");
  for (let tokenIndex = 0; tokenIndex < path.length; tokenIndex += 1) {
    const cellIndex = path[tokenIndex];
    if (
      !Number.isInteger(cellIndex) ||
      cellIndex < 0 ||
      cellIndex >= TARGET_WAIT_GRID_CELLS
    ) {
      return null;
    }
    const token = tokens[tokenIndex];
    board[cellIndex] = token === "qu" ? "Qu" : token.toUpperCase();
  }
  for (let index = 0; index < board.length; index += 1) {
    if (!board[index]) board[index] = randomCellLetter(random);
  }
  return board;
}

export function buildCompactTargetWaitTrie(rawWords, options = {}) {
  const minLength = Math.max(2, toPositiveInt(options.minLength, 2));
  const maxLength = Math.max(minLength, toPositiveInt(options.maxLength, 18));
  const words = [];
  const firstChild = [-1];
  const nextSibling = [-1];
  const tokenCode = [-1];
  const terminalWordIndex = [-1];
  const seen = new Set();

  function createNode(code) {
    const index = firstChild.length;
    firstChild.push(-1);
    nextSibling.push(-1);
    tokenCode.push(code);
    terminalWordIndex.push(-1);
    return index;
  }

  function findOrCreateChild(parentIndex, code) {
    let childIndex = firstChild[parentIndex];
    while (childIndex >= 0) {
      if (tokenCode[childIndex] === code) return childIndex;
      childIndex = nextSibling[childIndex];
    }
    const createdIndex = createNode(code);
    nextSibling[createdIndex] = firstChild[parentIndex];
    firstChild[parentIndex] = createdIndex;
    return createdIndex;
  }

  for (const rawWord of rawWords || []) {
    const word = normalizeWord(String(rawWord || ""));
    if (
      !word ||
      seen.has(word) ||
      word.length < minLength ||
      word.length > maxLength
    ) {
      continue;
    }
    const tokens = tokenizeTargetWaitWord(word);
    if (!tokens || tokens.length > TARGET_WAIT_GRID_CELLS) continue;
    let nodeIndex = 0;
    for (const token of tokens) {
      nodeIndex = findOrCreateChild(nodeIndex, tokenToCode(token));
    }
    seen.add(word);
    terminalWordIndex[nodeIndex] = words.length;
    words.push(word);
  }

  return Object.freeze({
    firstChild: Int32Array.from(firstChild),
    nextSibling: Int32Array.from(nextSibling),
    tokenCode: Int8Array.from(tokenCode),
    terminalWordIndex: Int32Array.from(terminalWordIndex),
    words: Object.freeze(words),
    minLength,
    maxLength,
    nodeCount: firstChild.length,
  });
}

function findTrieChild(trie, parentIndex, code) {
  let childIndex = trie.firstChild[parentIndex];
  while (childIndex >= 0) {
    if (trie.tokenCode[childIndex] === code) return childIndex;
    childIndex = trie.nextSibling[childIndex];
  }
  return -1;
}

export function solveTargetWaitBoard(boardInput, trie) {
  if (
    !trie ||
    !Array.isArray(boardInput) ||
    boardInput.length !== TARGET_WAIT_GRID_CELLS
  ) {
    return new Map();
  }
  const board = boardInput.map(normalizeBoardCell);
  if (board.some((letter) => !letter)) return new Map();
  const codes = board.map(tokenToCode);
  if (codes.some((code) => code < 0)) return new Map();
  const found = new Map();
  const path = [];

  function visit(cellIndex, trieNodeIndex, usedMask) {
    const childIndex = findTrieChild(trie, trieNodeIndex, codes[cellIndex]);
    if (childIndex < 0) return;
    const nextMask = usedMask | (1 << cellIndex);
    path.push(cellIndex);
    const wordIndex = trie.terminalWordIndex[childIndex];
    if (wordIndex >= 0 && !found.has(wordIndex)) {
      found.set(wordIndex, path.slice());
    }
    for (const neighborIndex of NEIGHBORS_BY_INDEX[cellIndex]) {
      if ((nextMask & (1 << neighborIndex)) !== 0) continue;
      visit(neighborIndex, childIndex, nextMask);
    }
    path.pop();
  }

  for (let startIndex = 0; startIndex < TARGET_WAIT_GRID_CELLS; startIndex += 1) {
    visit(startIndex, 0, 0);
  }
  return found;
}

export function analyzeTargetWaitSolution(
  solved,
  trie,
  blankIndex,
  commonWordSet = null,
  excludedWord = ""
) {
  const excluded = normalizeWord(String(excludedWord || ""));
  let maxLength = 0;
  let maxBlankWordLength = 0;
  let blankWordCount = 0;
  const longestWords = [];
  const commonBlankWords = [];

  for (const [wordIndex, path] of solved.entries()) {
    const word = trie.words[wordIndex] || "";
    const length = word.length;
    if (length > maxLength) {
      maxLength = length;
      longestWords.length = 0;
      longestWords.push(word);
    } else if (length === maxLength) {
      longestWords.push(word);
    }
    if (!Array.isArray(path) || !path.includes(blankIndex)) continue;
    blankWordCount += 1;
    if (length > maxBlankWordLength) maxBlankWordLength = length;
    if (
      word !== excluded &&
      length >= 4 &&
      (!commonWordSet || commonWordSet.has(word))
    ) {
      commonBlankWords.push(word);
    }
  }

  commonBlankWords.sort((first, second) => {
    const lengthDiff = second.length - first.length;
    return lengthDiff || first.localeCompare(second);
  });

  return {
    wordCount: solved.size,
    maxLength,
    longestWords,
    blankWordCount,
    maxBlankWordLength,
    commonBlankWords,
  };
}

function getBoardTransformIndex(index, transform, size = TARGET_WAIT_GRID_SIZE) {
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

export function getCanonicalTargetWaitSignature(boardInput, blankIndex) {
  if (
    !Array.isArray(boardInput) ||
    boardInput.length !== TARGET_WAIT_GRID_CELLS ||
    !Number.isInteger(blankIndex) ||
    blankIndex < 0 ||
    blankIndex >= TARGET_WAIT_GRID_CELLS
  ) {
    return "";
  }
  const board = boardInput.map(normalizeBoardCell);
  board[blankIndex] = "_";
  const signatures = [];
  for (let transform = 0; transform < 8; transform += 1) {
    const transformed = Array.from({ length: TARGET_WAIT_GRID_CELLS }, () => "");
    for (let sourceIndex = 0; sourceIndex < board.length; sourceIndex += 1) {
      transformed[getBoardTransformIndex(sourceIndex, transform)] = board[sourceIndex];
    }
    signatures.push(transformed.map((letter) => letter || "_").join(","));
  }
  signatures.sort();
  return signatures[0] || "";
}

function chooseTargetWord(targetWords, targetUsage, maxPerTarget, random) {
  if (!targetWords.length) return null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = targetWords[randomInt(random, targetWords.length)];
    if ((targetUsage.get(candidate.word) || 0) < maxPerTarget) return candidate;
  }
  const available = targetWords.filter(
    (candidate) => (targetUsage.get(candidate.word) || 0) < maxPerTarget
  );
  return available.length ? available[randomInt(random, available.length)] : null;
}

function encodeBoard(board, blankIndex) {
  return board
    .map((letter, index) => {
      if (index === blankIndex) return "_";
      return normalizeBoardCell(letter) === "Qu" ? "Q" : normalizeBoardCell(letter);
    })
    .join("");
}

function buildReplacementAnalysis({
  board,
  blankIndex,
  trie,
  commonWordSet,
  excludedWord,
}) {
  const replacements = [];
  for (const letter of REPLACEMENT_LETTERS) {
    const completedBoard = board.slice();
    completedBoard[blankIndex] = letter === "Q" ? "Qu" : letter;
    const solved = solveTargetWaitBoard(completedBoard, trie);
    const analysis = analyzeTargetWaitSolution(
      solved,
      trie,
      blankIndex,
      commonWordSet,
      excludedWord
    );
    replacements.push({ letter, ...analysis });
  }
  return replacements;
}

function scoreDecoy(analysis, targetLength) {
  const closeness = Math.max(0, targetLength - analysis.maxLength);
  return (
    analysis.maxBlankWordLength * 1000 +
    Math.min(12, analysis.commonBlankWords.length) * 100 +
    Math.min(50, analysis.blankWordCount) * 5 +
    Math.min(500, analysis.wordCount) -
    closeness * 40
  );
}

function pickDecoys(candidates, count, targetLength, random) {
  const randomized = shuffleInPlace(candidates.slice(), random);
  randomized.sort(
    (first, second) =>
      scoreDecoy(second, targetLength) - scoreDecoy(first, targetLength)
  );
  const shortlist = randomized.slice(0, Math.max(count, Math.min(10, randomized.length)));
  shuffleInPlace(shortlist, random);
  shortlist.sort(
    (first, second) =>
      scoreDecoy(second, targetLength) - scoreDecoy(first, targetLength)
  );
  return shortlist.slice(0, count);
}

export function generateTargetWaitPuzzles({
  trie,
  targetWords,
  commonWordSet = null,
  count = 100,
  maxAttempts = 100000,
  seed = 0x4757424c,
  choices = 4,
  minTargetLength = 7,
  maxTargetLength = 11,
  minCorrectOtherWords = 2,
  minDecoyCommonWords = 2,
  minDecoyBlankWords = 3,
  minDecoyMaxLength = 4,
  maxPerTarget = 4,
  requireGlobalUniqueness = false,
  onProgress = null,
} = {}) {
  if (!trie || !Array.isArray(targetWords) || !targetWords.length) {
    throw new Error("target_wait_generator_missing_inputs");
  }
  const requestedCount = toPositiveInt(count, 100);
  const attemptsLimit = toPositiveInt(maxAttempts, 100000);
  const choiceCount = Math.max(2, Math.min(8, toPositiveInt(choices, 4)));
  const decoyCount = choiceCount - 1;
  const random = createTargetWaitRandom(seed);
  const eligibleTargets = targetWords
    .map((entry) => {
      const word = normalizeWord(String(entry?.word ?? entry ?? ""));
      const tokens = tokenizeTargetWaitWord(word);
      return word && tokens ? { ...(typeof entry === "object" ? entry : {}), word, tokens } : null;
    })
    .filter(
      (entry) =>
        entry &&
        entry.word.length >= minTargetLength &&
        entry.word.length <= maxTargetLength &&
        entry.tokens.length <= TARGET_WAIT_GRID_CELLS
    );
  if (!eligibleTargets.length) {
    throw new Error("target_wait_generator_no_eligible_targets");
  }

  const puzzles = [];
  const signatures = new Set();
  const targetUsage = new Map();
  const rejectionCounts = new Map();
  const acceptedByLength = new Map();
  const correctLetters = new Map();
  let attempts = 0;
  let totalCompetingLetters = 0;

  function reject(reason) {
    rejectionCounts.set(reason, (rejectionCounts.get(reason) || 0) + 1);
  }

  while (puzzles.length < requestedCount && attempts < attemptsLimit) {
    attempts += 1;
    const target = chooseTargetWord(eligibleTargets, targetUsage, maxPerTarget, random);
    if (!target) {
      reject("target_pool_exhausted");
      break;
    }
    const path = buildTargetWaitPath(target.tokens.length, random);
    if (!path) {
      reject("path_unavailable");
      continue;
    }
    const blankTokenCandidates = target.tokens
      .map((token, index) => ({ token, index }))
      .filter(({ token }) => token !== "qu");
    if (!blankTokenCandidates.length) {
      reject("no_single_letter_blank");
      continue;
    }
    const blankToken =
      blankTokenCandidates[randomInt(random, blankTokenCandidates.length)];
    const blankIndex = path[blankToken.index];
    const answer = blankToken.token.toUpperCase();
    const board = buildAnchoredTargetWaitBoard(target.word, path, random);
    if (!board) {
      reject("board_unavailable");
      continue;
    }

    const replacementAnalyses = buildReplacementAnalysis({
      board,
      blankIndex,
      trie,
      commonWordSet,
      excludedWord: target.word,
    });
    const correct = replacementAnalyses.find((entry) => entry.letter === answer);
    if (
      !correct ||
      correct.maxLength !== target.word.length ||
      correct.longestWords.length !== 1 ||
      correct.longestWords[0] !== target.word
    ) {
      reject("target_not_unique_longest");
      continue;
    }
    if (correct.commonBlankWords.length < minCorrectOtherWords) {
      reject("correct_letter_lacks_other_words");
      continue;
    }
    const competingLetters = replacementAnalyses.filter(
      (entry) => entry.letter !== answer && entry.maxLength >= target.word.length
    );
    if (requireGlobalUniqueness && competingLetters.length) {
      reject("global_letter_competition");
      continue;
    }
    const decoyCandidates = replacementAnalyses.filter(
      (entry) =>
        entry.letter !== answer &&
        entry.maxLength < target.word.length &&
        entry.commonBlankWords.length >= minDecoyCommonWords &&
        entry.blankWordCount >= minDecoyBlankWords &&
        entry.maxBlankWordLength >= minDecoyMaxLength
    );
    if (decoyCandidates.length < decoyCount) {
      reject("insufficient_decoys");
      continue;
    }
    const decoys = pickDecoys(decoyCandidates, decoyCount, target.word.length, random);
    const optionLetters = shuffleInPlace(
      [answer, ...decoys.map((entry) => entry.letter)],
      random
    );
    const signature = getCanonicalTargetWaitSignature(board, blankIndex);
    if (!signature || signatures.has(signature)) {
      reject("duplicate_board");
      continue;
    }

    signatures.add(signature);
    targetUsage.set(target.word, (targetUsage.get(target.word) || 0) + 1);
    acceptedByLength.set(
      target.word.length,
      (acceptedByLength.get(target.word.length) || 0) + 1
    );
    correctLetters.set(answer, (correctLetters.get(answer) || 0) + 1);
    totalCompetingLetters += competingLetters.length;
    const puzzleIndex = puzzles.length + 1;
    puzzles.push({
      id: `tw-${String(puzzleIndex).padStart(6, "0")}`,
      grid: encodeBoard(board, blankIndex),
      blankIndex,
      choices: optionLetters,
      answer,
      word: target.word.toUpperCase(),
      path,
      difficulty: Math.max(
        1,
        Math.min(
          5,
          target.word.length -
            6 +
            (decoys.some((entry) => entry.maxLength === target.word.length - 1) ? 1 : 0)
        )
      ),
      quality: {
        targetLength: target.word.length,
        targetPlayersFound: Number(target.playersFound) || 0,
        correctOtherWords: correct.commonBlankWords.slice(0, 8),
        decoys: Object.fromEntries(
          decoys.map((entry) => [
            entry.letter,
            {
              maxLength: entry.maxLength,
              blankWordCount: entry.blankWordCount,
              commonWords: entry.commonBlankWords.slice(0, 8),
            },
          ])
        ),
        competingLetterCount: competingLetters.length,
      },
    });

    if (typeof onProgress === "function") {
      onProgress({
        accepted: puzzles.length,
        attempts,
        requested: requestedCount,
      });
    }
  }

  return {
    puzzles,
    report: {
      schemaVersion: TARGET_WAIT_SCHEMA_VERSION,
      requested: requestedCount,
      accepted: puzzles.length,
      attempts,
      acceptanceRate: attempts > 0 ? puzzles.length / attempts : 0,
      exhausted: puzzles.length < requestedCount,
      seed: Number(seed) >>> 0,
      choices: choiceCount,
      requireGlobalUniqueness: !!requireGlobalUniqueness,
      averageCompetingLetters:
        puzzles.length > 0 ? totalCompetingLetters / puzzles.length : 0,
      acceptedByLength: Object.fromEntries(
        Array.from(acceptedByLength.entries()).sort((a, b) => a[0] - b[0])
      ),
      correctLetters: Object.fromEntries(
        Array.from(correctLetters.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      ),
      targetUsage: Object.fromEntries(
        Array.from(targetUsage.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      ),
      rejections: Object.fromEntries(
        Array.from(rejectionCounts.entries()).sort((a, b) => b[1] - a[1])
      ),
    },
  };
}

export function stripTargetWaitPuzzleDiagnostics(puzzle) {
  if (!puzzle || typeof puzzle !== "object") return null;
  const {
    id,
    grid,
    blankIndex,
    choices,
    answer,
    word,
    path,
    difficulty,
  } = puzzle;
  return {
    id,
    grid,
    blankIndex,
    choices,
    answer,
    word,
    path,
    difficulty,
  };
}

export function createTargetWaitCatalogPayload(puzzles, metadata = {}) {
  return {
    schemaVersion: TARGET_WAIT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    ...metadata,
    puzzles: (puzzles || []).map(stripTargetWaitPuzzleDiagnostics).filter(Boolean),
  };
}

export function getTargetWaitReplacementLetters() {
  return REPLACEMENT_LETTERS.slice();
}

export function getTargetWaitLetterCodes() {
  return LETTER_CODES.slice();
}
