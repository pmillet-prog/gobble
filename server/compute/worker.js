import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { parentPort } from "worker_threads";

import { generateGrid, solveGrid, normalizeWord } from "../../shared/gameLogic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_QUALITY_ATTEMPTS = 50;
const SPECIAL_QUALITY_ATTEMPTS = 220;
const TARGET_LONG_MIN_LEN = 11;
const TARGET_LONG_PREFERRED_LEN = 13;
const TARGET_LONG_BATCH_ATTEMPTS = 50;
const TARGET_LONG_BATCHES_PER_LEN = 2;
const TARGET_LONG_TOTAL_ATTEMPTS =
  TARGET_LONG_BATCH_ATTEMPTS *
  TARGET_LONG_BATCHES_PER_LEN *
  (TARGET_LONG_PREFERRED_LEN - TARGET_LONG_MIN_LEN + 1);
const TARGET_SCORE_MIN_PTS = 100;
const BONUS_LETTER_MIN_WORDS = 30;
const BONUS_LETTER_SCORE = 20;

let dictionary = null;
try {
  const raw = readFileSync(path.join(__dirname, "../../public/dico.txt"), "utf8");
  dictionary = new Set(
    raw
      .split(/\r?\n/)
      .map((w) => normalizeWord(w.trim()))
      .filter(Boolean)
  );
} catch (err) {
  dictionary = null;
}

function normalizeLetterKey(letter) {
  if (!letter) return "";
  if (letter === "Qu") return "qu";
  return String(letter).toLowerCase();
}

function pickBonusLetter(grid, solved, minWords) {
  if (!grid || !solved || solved.size === 0) return null;
  const entries = [];
  const seen = new Set();
  for (const cell of grid) {
    const key = normalizeLetterKey(cell.letter);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    entries.push({ key, letter: cell.letter });
  }
  if (entries.length === 0) return null;
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  for (const entry of entries) {
    let count = 0;
    for (const word of solved.keys()) {
      if (word.includes(entry.key)) {
        count += 1;
        if (count >= minWords) break;
      }
    }
    if (count >= minWords) return entry.letter;
  }
  return null;
}

function analyzeGridQualityFromSolved(solved, minWords = 0, opts = {}) {
  const hasSolved = solved && solved.size > 0;
  let maxLen = 0;
  let maxPts = 0;
  let totalPts = 0;
  let longWords = 0;
  const minLongWordLen = Math.max(0, opts?.minLongWordLen || 0);

  if (hasSolved) {
    for (const [word, data] of solved.entries()) {
      const len = word.length;
      const pts = data?.pts || 0;
      if (len > maxLen) maxLen = len;
      if (pts > maxPts) maxPts = pts;
      totalPts += pts;
      if (minLongWordLen > 0 && len >= minLongWordLen) {
        longWords++;
      }
    }
  }

  return {
    ok: minWords <= 0 || (hasSolved && solved.size >= minWords),
    words: hasSolved ? solved.size : 0,
    maxLen,
    maxPts,
    totalPts,
    longWords,
  };
}

function pickTargetFromSolved(solved, type, opts = {}) {
  if (!solved || solved.size === 0) return null;

  if (type === "target_long") {
    const minLongLen = Math.max(
      0,
      Number.isFinite(opts?.minLongLen) ? opts.minLongLen : TARGET_LONG_MIN_LEN
    );
    let maxLen = 0;
    for (const w of solved.keys()) {
      if (w.length > maxLen) maxLen = w.length;
    }
    if (maxLen < minLongLen) return null;
    const maxWords = [];
    for (const w of solved.keys()) {
      if (w.length === maxLen) maxWords.push(w);
      if (maxWords.length > 1) return null;
    }
    const word = maxWords[0];
    const path = solved.get(word)?.path || null;
    return { word, length: maxLen, path };
  }

  if (type === "target_score") {
    let maxPts = 0;
    for (const data of solved.values()) {
      const pts = data?.pts || 0;
      if (pts > maxPts) maxPts = pts;
    }
    if (maxPts < TARGET_SCORE_MIN_PTS) return null;
    const maxWords = [];
    for (const [w, data] of solved.entries()) {
      const pts = data?.pts || 0;
      if (pts === maxPts) maxWords.push(w);
      if (maxWords.length > 1) return null;
    }
    const word = maxWords[0];
    const path = solved.get(word)?.path || null;
    return { word, pts: maxPts, path };
  }

  return null;
}

function prepareNextGridJob({ roomConfig, roundPlan, roundNumber }) {
  const minWords = roundPlan?.minWords ?? roomConfig?.minWords ?? 0;
  const maxAttempts = Math.max(
    1,
    roundPlan?.qualityAttempts || roomConfig?.qualityAttempts || MAX_QUALITY_ATTEMPTS
  );
  const needsBonusLetter = roundPlan?.type === "bonus_letter";
  const maxAttemptsBase = needsBonusLetter
    ? Math.max(maxAttempts, SPECIAL_QUALITY_ATTEMPTS * 2, 300)
    : maxAttempts;
  const maxAttemptsTotal =
    roundPlan?.type === "target_long"
      ? Math.max(maxAttemptsBase, TARGET_LONG_TOTAL_ATTEMPTS)
      : maxAttemptsBase;
  const size = roomConfig?.gridSize || 4;
  const effectiveMinWords = dictionary ? minWords : 0;
  const qualityOpts = { minLongWordLen: roundPlan?.minLongWordLen || 0 };
  const isTargetLong = roundPlan?.type === "target_long";
  const targetLongMinLen = TARGET_LONG_MIN_LEN;
  const targetLongPreferredLen = Math.max(targetLongMinLen, TARGET_LONG_PREFERRED_LEN);
  const targetLongBatchSize = Math.max(1, Math.min(TARGET_LONG_BATCH_ATTEMPTS, maxAttemptsTotal));

  let bestCandidate = null;
  let fallbackCandidate = null;
  let targetLongThreshold = targetLongPreferredLen;
  let targetLongAttemptsInBatch = 0;
  let targetLongBatchesAtLen = 0;
  let targetLongBestAtThreshold = null;

  for (let attempt = 1; attempt <= maxAttemptsTotal; attempt++) {
    let grid = generateGrid(size);
    if (
      roundPlan?.type === "speed" ||
      roundPlan?.type === "target_long" ||
      roundPlan?.type === "bonus_letter"
    ) {
      grid = grid.map((cell) => ({ ...cell, bonus: null }));
    }

    const solved = dictionary ? solveGrid(grid, dictionary) : null;
    const quality = analyzeGridQualityFromSolved(solved, effectiveMinWords, qualityOpts);
    quality.possibleScore = roundPlan?.fixedWordScore
      ? (quality.words || 0) * roundPlan.fixedWordScore
      : quality.totalPts;

    const minLongWords = roundPlan?.minLongWordCount || 0;
    let ok = quality.ok;
    if (roundPlan?.type === "speed") {
      ok = ok && quality.words >= (roundPlan.minWords || 0);
    } else if (roundPlan?.type === "monstrous") {
      const minTotal = roundPlan?.minTotalScore || 0;
      const minLen = roundPlan?.minLongWordLen || 0;
      ok =
        ok &&
        quality.possibleScore >= minTotal &&
        quality.maxLen >= minLen &&
        quality.longWords >= minLongWords;
    } else if (
      roundPlan?.type === "target_long" ||
      roundPlan?.type === "target_score" ||
      roundPlan?.type === "bonus_letter"
    ) {
      ok = ok && !!dictionary;
    }
    quality.ok = ok;

    let targetWord = null;
    let targetLength = null;
    let targetPath = null;
    let fallbackTargetWord = null;
    let fallbackTargetLength = null;
    let fallbackTargetPath = null;
    let bonusLetter = null;

    if (
      solved &&
      (roundPlan?.type === "target_long" || roundPlan?.type === "target_score")
    ) {
      const target = pickTargetFromSolved(
        solved,
        roundPlan.type,
        isTargetLong ? { minLongLen: targetLongMinLen } : null
      );
      if (target?.word) {
        targetWord = target.word;
        targetLength = target.length || target.word.length;
        targetPath = Array.isArray(target.path) ? target.path : null;
      } else if (isTargetLong) {
        const fallbackTarget = pickTargetFromSolved(solved, roundPlan.type, { minLongLen: 0 });
        if (fallbackTarget?.word) {
          fallbackTargetWord = fallbackTarget.word;
          fallbackTargetLength = fallbackTarget.length || fallbackTarget.word.length;
          fallbackTargetPath = Array.isArray(fallbackTarget.path) ? fallbackTarget.path : null;
        }
      }
      quality.ok = quality.ok && !!targetWord;
    }

    if (solved && roundPlan?.type === "bonus_letter") {
      const minLetterWords = roundPlan?.bonusLetterMinWords || BONUS_LETTER_MIN_WORDS;
      bonusLetter = pickBonusLetter(grid, solved, minLetterWords);
      quality.ok = quality.ok && !!bonusLetter;
    }

    const planForRound = bonusLetter
      ? {
          ...roundPlan,
          bonusLetter,
          bonusLetterScore: roundPlan?.bonusLetterScore || BONUS_LETTER_SCORE,
          disableBonuses: true,
        }
      : roundPlan;

    const candidate = {
      grid,
      quality,
      plan: planForRound,
      roundNumber,
      targetWord,
      targetLength,
      targetPath,
    };
    const fallbackCandidateOverride =
      isTargetLong && !targetWord && fallbackTargetWord
        ? {
            ...candidate,
            targetWord: fallbackTargetWord,
            targetLength: fallbackTargetLength,
            targetPath: fallbackTargetPath,
          }
        : candidate;
    if (!isTargetLong || targetWord || fallbackTargetWord) {
      fallbackCandidate = fallbackCandidateOverride;
    }
    if (needsBonusLetter && !planForRound?.bonusLetter) {
      continue;
    }

    const currentScore =
      (quality?.words || 0) + (quality?.possibleScore || 0) / 500 + (quality?.longWords || 0);
    const bestScore =
      (bestCandidate?.quality?.words || 0) +
      (bestCandidate?.quality?.possibleScore || 0) / 500 +
      (bestCandidate?.quality?.longWords || 0);

    if (isTargetLong) {
      if (targetWord) {
        const candidateLen = Number.isFinite(targetLength) ? targetLength : 0;
        const bestLen = Number.isFinite(bestCandidate?.targetLength)
          ? bestCandidate.targetLength
          : 0;
        if (
          !bestCandidate ||
          candidateLen > bestLen ||
          (candidateLen === bestLen && currentScore > bestScore)
        ) {
          bestCandidate = candidate;
        }
        if (candidateLen >= targetLongThreshold) {
          const bestThresholdLen = Number.isFinite(targetLongBestAtThreshold?.targetLength)
            ? targetLongBestAtThreshold.targetLength
            : 0;
          const thresholdScore =
            (targetLongBestAtThreshold?.quality?.words || 0) +
            (targetLongBestAtThreshold?.quality?.possibleScore || 0) / 500 +
            (targetLongBestAtThreshold?.quality?.longWords || 0);
          if (
            !targetLongBestAtThreshold ||
            candidateLen > bestThresholdLen ||
            (candidateLen === bestThresholdLen && currentScore > thresholdScore)
          ) {
            targetLongBestAtThreshold = candidate;
          }
        }
      }
      targetLongAttemptsInBatch += 1;
      if (targetLongAttemptsInBatch >= targetLongBatchSize) {
        if (targetLongBestAtThreshold) {
          bestCandidate = targetLongBestAtThreshold;
          break;
        }
        targetLongAttemptsInBatch = 0;
        targetLongBatchesAtLen += 1;
        if (targetLongBatchesAtLen >= TARGET_LONG_BATCHES_PER_LEN) {
          if (targetLongThreshold > targetLongMinLen) {
            targetLongThreshold -= 1;
            targetLongBatchesAtLen = 0;
            targetLongBestAtThreshold = null;
          }
        }
      }
    } else {
      if (!bestCandidate || currentScore > bestScore) {
        bestCandidate = candidate;
      }

      if (quality.ok) {
        bestCandidate = candidate;
        break;
      }
    }
  }

  if (!bestCandidate && fallbackCandidate) {
    bestCandidate = fallbackCandidate;
  }

  return bestCandidate;
}

function analyzeGridJob({ grid, roundPlan, roomConfig, scoreConfig }) {
  if (!Array.isArray(grid) || grid.length === 0) {
    return { quality: null };
  }
  const minWords = roundPlan?.minWords ?? roomConfig?.minWords ?? 0;
  const effectiveMinWords = dictionary ? minWords : 0;
  const qualityOpts = { minLongWordLen: roundPlan?.minLongWordLen || 0 };
  const solved = dictionary ? solveGrid(grid, dictionary, scoreConfig || null) : null;
  const quality = analyzeGridQualityFromSolved(solved, effectiveMinWords, qualityOpts);
  quality.possibleScore = roundPlan?.fixedWordScore
    ? (quality.words || 0) * roundPlan.fixedWordScore
    : quality.totalPts;
  return { quality };
}

function respond(message) {
  if (!parentPort) return;
  parentPort.postMessage(message);
}

if (parentPort) {
  parentPort.on("message", async (message) => {
    const { id, type, payload } = message || {};
    if (!id) return;

    try {
      if (type === "prepareNextGrid") {
        const result = prepareNextGridJob(payload || {});
        respond({ id, ok: true, result });
        return;
      }
      if (type === "analyzeGrid") {
        const result = analyzeGridJob(payload || {});
        respond({ id, ok: true, result });
        return;
      }

      respond({ id, ok: false, error: "unknown_type" });
    } catch (err) {
      respond({ id, ok: false, error: err?.message || String(err) });
    }
  });
}
