import React from "react";
import { DAILY_SPECIAL_MODE } from "../daily/dailyModes.js";
import {
  computeScore,
  findBestPathForWord,
  normalizeWord,
} from "../gameLogic.js";

export default function useResultsAwards(
  announcements,
  board,
  endStats,
  finalResults,
  isTargetRound,
  lastRoundWindowRef,
  phase,
  roundStartAtRef,
  serverEndsAt,
  serverRoundDurationMs,
  specialRound,
  specialScoreConfig,
  WEEKLY_RECORD_LABELS,
  weeklyStats,
) {
  const gobbleWordAwardsByNick = React.useMemo(() => {
    const map = new Map();
    const addAward = (nick, kind) => {
      if (!nick) return;
      const prev = map.get(nick) || { bestWord: false, longestWord: false };
      if (kind === "bestWord") prev.bestWord = true;
      if (kind === "longestWord") prev.longestWord = true;
      map.set(nick, prev);
    };

    if (endStats?.bestWord?.nick) addAward(endStats.bestWord.nick, "bestWord");
    if (endStats?.longestWord?.nick) addAward(endStats.longestWord.nick, "longestWord");

    if (Array.isArray(announcements)) {
      const startAt = roundStartAtRef.current || 0;
      announcements.forEach((entry) => {
        const nick = entry?.nick;
        const type = entry?.type;
        const rawTs = entry?.ts ?? entry?.id ?? 0;
        const ts = Number.isFinite(rawTs) ? rawTs : Number(rawTs) || 0;
        if (startAt && (!ts || ts < startAt)) return;
        if (!nick || !type) return;
        if (type === "best_possible_score") {
          addAward(nick, "bestWord");
        }
        if (type === "longest_possible") {
          addAward(nick, "longestWord");
        }
      });
    }

    return map;
  }, [endStats, announcements]);
  const gobbleAwardsForLive = phase === "playing" ? gobbleWordAwardsByNick : null;

  const weeklyRecordHighlights = React.useMemo(() => {
    if (phase !== "results") return [];
    if (!weeklyStats || !Array.isArray(finalResults) || finalResults.length === 0) return [];
    const boards = weeklyStats?.boards || {};
    if (!boards || typeof boards !== "object") return [];
    const lastWindow = lastRoundWindowRef.current || {};
    const roundEndAt = Number.isFinite(serverEndsAt)
      ? serverEndsAt
      : Number.isFinite(lastWindow.endAt)
      ? lastWindow.endAt
      : null;
    const roundStartAt =
      Number.isFinite(serverEndsAt) && Number.isFinite(serverRoundDurationMs)
        ? serverEndsAt - serverRoundDurationMs
        : Number.isFinite(lastWindow.startAt)
        ? lastWindow.startAt
        : null;
    if (!Number.isFinite(roundStartAt) || !Number.isFinite(roundEndAt)) return [];
    const timePadMs = 6000;
    const withinRound = (ts) =>
      Number.isFinite(ts) &&
      ts >= roundStartAt - timePadMs &&
      ts <= roundEndAt + timePadMs;
    const findBoardEntry = (key, nick) => {
      const list = Array.isArray(boards[key]) ? boards[key] : [];
      return list.find((entry) => entry?.nick === nick);
    };
    const findBoardRank = (key, nick) => {
      const list = Array.isArray(boards[key]) ? boards[key] : [];
      const idx = list.findIndex((entry) => entry?.nick === nick);
      return idx >= 0 ? idx + 1 : null;
    };
    const records = [];
    const seen = new Set();
    const pushRecord = (record) => {
      const id = `${record.categoryKey}:${record.nick}`;
      if (seen.has(id)) return;
      seen.add(id);
      records.push({ ...record, id });
    };

    if (isTargetRound) {
      const boardKey =
        specialRound?.type === "target_score" ? "bestTimeTargetScore" : "bestTimeTargetLong";
      const categoryLabel = WEEKLY_RECORD_LABELS[boardKey] || "Temps cible";
      for (const entry of finalResults) {
        if (!entry?.nick || entry?.isBot) continue;
        const timeMs = Number.isFinite(entry.targetFoundMs) ? entry.targetFoundMs : null;
        if (!Number.isFinite(timeMs)) continue;
        const weeklyEntry = findBoardEntry(boardKey, entry.nick);
        if (
          weeklyEntry &&
          withinRound(weeklyEntry.achievedAt) &&
          Math.abs((weeklyEntry.ms ?? 0) - timeMs) <= 5
        ) {
          pushRecord({
            section: "target",
            categoryKey: boardKey,
            categoryLabel,
            nick: entry.nick,
            rank: findBoardRank(boardKey, entry.nick),
            rankTotal: weeklyStats?.topN ?? null,
            timeMs,
            word: weeklyEntry?.word || "",
          });
        }
      }
      return records;
    }

    if (specialRound?.type === DAILY_SPECIAL_MODE) {
      for (const entry of finalResults) {
        if (!entry?.nick || entry?.isBot) continue;
        const weeklyEntry = findBoardEntry("bestSpecial3Score", entry.nick);
        if (
          weeklyEntry &&
          withinRound(weeklyEntry.achievedAt) &&
          Number.isFinite(weeklyEntry.pts) &&
          weeklyEntry.pts === (Number(entry.score) || 0)
        ) {
          pushRecord({
            section: "round",
            categoryKey: "bestSpecial3Score",
            categoryLabel: WEEKLY_RECORD_LABELS.bestSpecial3Score,
            nick: entry.nick,
            rank: findBoardRank("bestSpecial3Score", entry.nick),
            rankTotal: weeklyStats?.topN ?? null,
            pts: Number(entry.score) || 0,
          });
        }
      }
      return records;
    }

    if (!board || board.length === 0) return [];
    const perPlayerStats = new Map();
    for (const entry of finalResults) {
      if (!entry?.nick || entry?.isBot) continue;
      const words = Array.isArray(entry.words) ? entry.words : [];
      const stats = {
        wordsCount: words.length,
        bestWord: null,
        longestWord: null,
      };
      for (const raw of words) {
        const norm = normalizeWord(raw);
        const path = findBestPathForWord(board, norm, specialScoreConfig);
        if (!path) continue;
        const pts = computeScore(norm, path, board, specialScoreConfig);
        if (!stats.bestWord || pts > stats.bestWord.pts) {
          stats.bestWord = { word: raw, norm, pts };
        }
        if (!stats.longestWord || norm.length > stats.longestWord.len) {
          stats.longestWord = { word: raw, norm, len: norm.length };
        }
      }
      perPlayerStats.set(entry.nick, stats);
    }

    for (const [nick, stats] of perPlayerStats.entries()) {
      const roundResultEntry = finalResults.find((entry) => entry?.nick === nick);
      const roundScore = Number(roundResultEntry?.score) || 0;
      if (roundScore > 0) {
        const weeklyEntry = findBoardEntry("bestRoundScore", nick);
        if (
          weeklyEntry &&
          withinRound(weeklyEntry.achievedAt) &&
          Number.isFinite(weeklyEntry.pts) &&
          weeklyEntry.pts === roundScore
        ) {
          pushRecord({
            section: "round",
            categoryKey: "bestRoundScore",
            categoryLabel: WEEKLY_RECORD_LABELS.bestRoundScore,
            nick,
            rank: findBoardRank("bestRoundScore", nick),
            rankTotal: weeklyStats?.topN ?? null,
            pts: roundScore,
          });
        }
      }

      if (stats.wordsCount > 0) {
        const weeklyEntry = findBoardEntry("mostWordsInGame", nick);
        if (
          weeklyEntry &&
          withinRound(weeklyEntry.achievedAt) &&
          Number.isFinite(weeklyEntry.wordsCount) &&
          weeklyEntry.wordsCount === stats.wordsCount
        ) {
          pushRecord({
            section: "round",
            categoryKey: "mostWordsInGame",
            categoryLabel: WEEKLY_RECORD_LABELS.mostWordsInGame,
            nick,
            rank: findBoardRank("mostWordsInGame", nick),
            rankTotal: weeklyStats?.topN ?? null,
            wordsCount: stats.wordsCount,
          });
        }
      }

      if (stats.bestWord) {
        const weeklyEntry = findBoardEntry("bestWord", nick);
        const normWord = String(stats.bestWord.norm || "").toLowerCase();
        const weeklyWord = String(weeklyEntry?.word || "").toLowerCase();
        if (
          weeklyEntry &&
          withinRound(weeklyEntry.achievedAt) &&
          Number.isFinite(weeklyEntry.pts) &&
          weeklyEntry.pts === stats.bestWord.pts &&
          normWord &&
          normWord === weeklyWord
        ) {
          pushRecord({
            section: "round",
            categoryKey: "bestWord",
            categoryLabel: WEEKLY_RECORD_LABELS.bestWord,
            nick,
            rank: findBoardRank("bestWord", nick),
            rankTotal: weeklyStats?.topN ?? null,
            word: stats.bestWord.word,
          });
        }
      }

      if (stats.longestWord) {
        const weeklyEntry = findBoardEntry("longestWord", nick);
        const normWord = String(stats.longestWord.norm || "").toLowerCase();
        const weeklyWord = String(weeklyEntry?.word || "").toLowerCase();
        if (
          weeklyEntry &&
          withinRound(weeklyEntry.achievedAt) &&
          Number.isFinite(weeklyEntry.len) &&
          weeklyEntry.len === stats.longestWord.len &&
          normWord &&
          normWord === weeklyWord
        ) {
          pushRecord({
            section: "round",
            categoryKey: "longestWord",
            categoryLabel: WEEKLY_RECORD_LABELS.longestWord,
            nick,
            rank: findBoardRank("longestWord", nick),
            rankTotal: weeklyStats?.topN ?? null,
            word: stats.longestWord.word,
          });
        }
      }
    }

    return records;
  }, [
    phase,
    weeklyStats,
    finalResults,
    board,
    specialScoreConfig,
    serverEndsAt,
    serverRoundDurationMs,
    isTargetRound,
    specialRound,
  ]);

  return { gobbleAwardsForLive, gobbleWordAwardsByNick, weeklyRecordHighlights };
}
