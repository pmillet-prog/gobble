import React from "react";
import { DAILY_SPECIAL_MODE } from "../daily/dailyModes.js";
import { applyDailySpecialPlacements } from "../daily/dailySpecialModel.js";
import {
  computeScore,
  findBestPathForWord,
  normalizeWord,
} from "../gameLogic.js";
import { MASSIVE_BOGGLE_TYPE } from "../../game/specialRoundTypes.js";

export default function useEndStats(
  allWords,
  board,
  finalResults,
  roundStats,
  specialRound,
  specialScoreConfig,
) {
  return React.useMemo(() => {
    if (!Array.isArray(finalResults) || finalResults.length === 0) return null;
    if (!Array.isArray(board) || board.length === 0) return null;

    const isSpeedRoundNow = specialRound?.type === "speed";
    const isMassiveBoggleRoundNow = specialRound?.type === MASSIVE_BOGGLE_TYPE;
    const isSpecial3RoundNow = specialRound?.type === DAILY_SPECIAL_MODE;
    const allowScoreGobble =
      !isSpeedRoundNow && !isMassiveBoggleRoundNow && !isSpecial3RoundNow;
    const winner = [...finalResults].sort((a, b) => (b?.score || 0) - (a?.score || 0))[0];

    const solverEntriesByNorm = new Map();
    (Array.isArray(allWords) ? allWords : []).forEach((entry) => {
      const rawWord = String(entry?.word || "").trim();
      const norm = normalizeWord(rawWord);
      if (!norm) return;
      const pts = Number.isFinite(entry?.pts) ? entry.pts : null;
      const current = solverEntriesByNorm.get(norm);
      if (!current || (Number.isFinite(pts) && pts > (current.pts ?? -Infinity))) {
        solverEntriesByNorm.set(norm, {
          word: rawWord || norm,
          norm,
          pts,
          len: norm.length,
        });
      }
    });

    const maxPossiblePtsFromSolver = allowScoreGobble
      ? Array.from(solverEntriesByNorm.values()).reduce((max, entry) => {
          if (!Number.isFinite(entry?.pts)) return max;
          return Math.max(max, entry.pts);
        }, 0)
      : 0;
    const maxPossibleLenFromSolver = Array.from(solverEntriesByNorm.values()).reduce((max, entry) => {
      if (!Number.isFinite(entry?.len)) return max;
      return Math.max(max, entry.len);
    }, 0);
    const maxPossiblePts = allowScoreGobble
      ? Number.isFinite(roundStats?.maxPts) && roundStats.maxPts > 0
        ? roundStats.maxPts
        : maxPossiblePtsFromSolver > 0
        ? maxPossiblePtsFromSolver
        : null
      : null;
    const maxPossibleLen =
      Number.isFinite(roundStats?.maxLen) && roundStats.maxLen > 0
        ? roundStats.maxLen
        : maxPossibleLenFromSolver > 0
        ? maxPossibleLenFromSolver
        : null;

    const wordStatsCache = new Map();
    const getWordTime = (entry, norm) => {
      const map = entry?.wordTimes;
      if (!map || typeof map !== "object") return null;
      const direct = map[norm];
      if (Number.isFinite(direct)) return direct;
      const matchKey = Object.keys(map).find((key) => normalizeWord(key) === norm);
      if (!matchKey) return null;
      const fallback = map[matchKey];
      return Number.isFinite(fallback) ? fallback : null;
    };
    const getWordStats = (rawWord, normWord) => {
      const norm = normWord || normalizeWord(rawWord);
      if (!norm) return { pts: null, len: 0 };
      if (wordStatsCache.has(norm)) return wordStatsCache.get(norm);
      const fromSolver = solverEntriesByNorm.get(norm);
      if (fromSolver && Number.isFinite(fromSolver?.pts)) {
        const cached = { pts: fromSolver.pts, len: norm.length };
        wordStatsCache.set(norm, cached);
        return cached;
      }
      const path = findBestPathForWord(board, norm, specialScoreConfig);
      if (!path || path.length === 0) {
        const fallback = { pts: null, len: norm.length };
        wordStatsCache.set(norm, fallback);
        return fallback;
      }
      const computed = {
        pts: computeScore(norm, path, board, specialScoreConfig),
        len: norm.length,
      };
      wordStatsCache.set(norm, computed);
      return computed;
    };
    const collectFinders = (norm) => {
      if (!norm) return [];
      const finders = [];
      finalResults.forEach((entry) => {
        const nick = String(entry?.nick || "").trim();
        if (!nick) return;
        const words = Array.isArray(entry?.words) ? entry.words : [];
        const found = words.some((raw) => normalizeWord(raw) === norm);
        if (!found) return;
        finders.push({
          nick,
          timeMs: getWordTime(entry, norm),
        });
      });
      finders.sort((a, b) => {
        const aFinite = Number.isFinite(a?.timeMs);
        const bFinite = Number.isFinite(b?.timeMs);
        if (aFinite && bFinite && a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
        if (aFinite && !bFinite) return -1;
        if (!aFinite && bFinite) return 1;
        return String(a?.nick || "").localeCompare(String(b?.nick || ""), "fr", {
          sensitivity: "base",
        });
      });
      return finders;
    };

    let bestWord = null; // { nick, word, norm, pts, ts, rankTs }
    let longestWord = null; // { nick, word, norm, len, ts, rankTs }
    let mostWords = null; // { nick, count }

    for (const entry of finalResults) {
      const words = Array.isArray(entry?.words) ? entry.words : [];
      if (!mostWords || words.length > mostWords.count) {
        mostWords = { nick: entry?.nick, count: words.length };
      }
      const seenByPlayer = new Set();
      for (const rawWord of words) {
        const raw = String(rawWord || "").trim();
        const norm = normalizeWord(raw);
        if (!norm || seenByPlayer.has(norm)) continue;
        seenByPlayer.add(norm);
        const stats = getWordStats(raw, norm);
        const wordTs = getWordTime(entry, norm);
        const rankTs = Number.isFinite(wordTs) ? wordTs : Number.POSITIVE_INFINITY;

        if (Number.isFinite(stats?.pts)) {
          const shouldReplaceBest =
            !bestWord ||
            stats.pts > bestWord.pts ||
            (stats.pts === bestWord.pts &&
              (rankTs < bestWord.rankTs ||
                (rankTs === bestWord.rankTs &&
                  raw.localeCompare(String(bestWord.word || ""), "fr", {
                    sensitivity: "base",
                  }) < 0)));
          if (shouldReplaceBest) {
            bestWord = {
              nick: entry?.nick,
              word: raw,
              norm,
              pts: stats.pts,
              len: stats.len,
              ts: Number.isFinite(wordTs) ? wordTs : null,
              rankTs,
            };
          }
        }

        const shouldReplaceLongest =
          !longestWord ||
          stats.len > longestWord.len ||
          (stats.len === longestWord.len &&
            (rankTs < longestWord.rankTs ||
              (rankTs === longestWord.rankTs &&
                raw.localeCompare(String(longestWord.word || ""), "fr", {
                  sensitivity: "base",
                }) < 0)));
        if (shouldReplaceLongest) {
          longestWord = {
            nick: entry?.nick,
            word: raw,
            norm,
            len: stats.len,
            pts: stats.pts,
            ts: Number.isFinite(wordTs) ? wordTs : null,
            rankTs,
          };
        }
      }
    }

    const scoreGobbleNormSet = new Set();
    const longGobbleNormSet = new Set();
    const possibleScoreWords = [];
    const possibleLongestWords = [];

    if (allowScoreGobble && Number.isFinite(maxPossiblePts) && maxPossiblePts > 0) {
      solverEntriesByNorm.forEach((entry) => {
        if (!Number.isFinite(entry?.pts) || entry.pts !== maxPossiblePts) return;
        scoreGobbleNormSet.add(entry.norm);
        possibleScoreWords.push(entry);
      });
      if (
        !possibleScoreWords.length &&
        bestWord &&
        Number.isFinite(bestWord?.pts) &&
        bestWord.pts === maxPossiblePts
      ) {
        scoreGobbleNormSet.add(bestWord.norm);
        possibleScoreWords.push({
          word: bestWord.word,
          norm: bestWord.norm,
          pts: bestWord.pts,
          len: bestWord.len,
        });
      }
    }

    if (Number.isFinite(maxPossibleLen) && maxPossibleLen > 0) {
      solverEntriesByNorm.forEach((entry) => {
        if (!Number.isFinite(entry?.len) || entry.len !== maxPossibleLen) return;
        longGobbleNormSet.add(entry.norm);
        possibleLongestWords.push(entry);
      });
      if (
        !possibleLongestWords.length &&
        longestWord &&
        Number.isFinite(longestWord?.len) &&
        longestWord.len === maxPossibleLen
      ) {
        longGobbleNormSet.add(longestWord.norm);
        possibleLongestWords.push({
          word: longestWord.word,
          norm: longestWord.norm,
          pts: longestWord.pts,
          len: longestWord.len,
        });
      }
    }

    const compareWordEntries = (a, b) =>
      String(a?.word || "").localeCompare(String(b?.word || ""), "fr", {
        sensitivity: "base",
      });
    possibleScoreWords.sort(compareWordEntries);
    possibleLongestWords.sort(compareWordEntries);

    const getScoreGobbleCount = (norm) =>
      norm && allowScoreGobble && scoreGobbleNormSet.has(norm) ? 1 : 0;
    const getLongGobbleCount = (norm) =>
      norm && longGobbleNormSet.has(norm) ? 1 : 0;
    const getGobbleCount = (norm) => getScoreGobbleCount(norm) + getLongGobbleCount(norm);

    const bestWordFinders = bestWord ? collectFinders(bestWord.norm) : [];
    const longestWordFinders = longestWord ? collectFinders(longestWord.norm) : [];

    const bestWordHasScoreGobble =
      !!bestWord && allowScoreGobble && getGobbleCount(bestWord.norm) > 0 && scoreGobbleNormSet.has(bestWord.norm);
    const longestWordHasLengthGobble =
      !!longestWord && getGobbleCount(longestWord.norm) > 0 && longGobbleNormSet.has(longestWord.norm);

    const possibleBestWords =
      bestWord &&
      allowScoreGobble &&
      Number.isFinite(maxPossiblePts) &&
      maxPossiblePts > 0 &&
      !bestWordHasScoreGobble
        ? possibleScoreWords
            .filter((entry) => entry.norm !== bestWord.norm)
            .map((entry) => ({ ...entry, gobbleCount: getGobbleCount(entry.norm) }))
        : [];
    const possibleLongestGobbleWords =
      longestWord &&
      Number.isFinite(maxPossibleLen) &&
      maxPossibleLen > 0 &&
      !longestWordHasLengthGobble
        ? possibleLongestWords
            .filter((entry) => entry.norm !== longestWord.norm)
            .map((entry) => ({ ...entry, gobbleCount: getGobbleCount(entry.norm) }))
        : [];

    const special3Leader =
      specialRound?.type === DAILY_SPECIAL_MODE && winner
        ? (() => {
            const placements =
              winner?.specialPlacements && typeof winner.specialPlacements === "object"
                ? winner.specialPlacements
                : {};
            const scoringBoard = applyDailySpecialPlacements(board, placements);
            const slots = (Array.isArray(winner?.specialWordSlots) ? winner.specialWordSlots : [])
              .map((slot, idx) => {
                const word = String(slot?.word || "").trim();
                if (!word) return null;
                const path = Array.isArray(slot?.path) ? slot.path : [];
                const pts =
                  Number.isFinite(slot?.pts) && slot.pts >= 0
                    ? Number(slot.pts)
                    : path.length
                    ? computeScore(word, path, scoringBoard, null)
                    : null;
                return {
                  id: Number.isFinite(slot?.id) ? slot.id : idx,
                  word,
                  display: String(slot?.display || word).trim() || word,
                  path,
                  pts,
                };
              })
              .filter(Boolean);
            if (!slots.length) return null;
            return {
              nick: winner.nick,
              score: Number(winner?.score) || 0,
              board: scoringBoard,
              slots,
            };
          })()
        : null;

    return {
      winner,
      special3Leader,
      bestWord: bestWord
        ? {
            nick: bestWord.nick,
            word: bestWord.word,
            pts: bestWord.pts,
            ts: bestWord.ts,
            len: bestWord.len,
            finders: bestWordFinders,
            scoreGobbleCount: getScoreGobbleCount(bestWord.norm),
            longGobbleCount: getLongGobbleCount(bestWord.norm),
            gobbleCount: getGobbleCount(bestWord.norm),
          }
        : null,
      longestWord: longestWord
        ? {
            nick: longestWord.nick,
            word: longestWord.word,
            len: longestWord.len,
            ts: longestWord.ts,
            pts: longestWord.pts,
            finders: longestWordFinders,
            scoreGobbleCount: getScoreGobbleCount(longestWord.norm),
            longGobbleCount: getLongGobbleCount(longestWord.norm),
            gobbleCount: getGobbleCount(longestWord.norm),
          }
        : null,
      mostWords,
      maxPossiblePts,
      maxPossibleLen,
      possibleBestWords,
      possibleLongestGobbleWords,
    };
  }, [
    allWords,
    board,
    finalResults,
    roundStats?.maxLen,
    roundStats?.maxPts,
    specialRound?.type,
    specialScoreConfig,
  ]);
}
