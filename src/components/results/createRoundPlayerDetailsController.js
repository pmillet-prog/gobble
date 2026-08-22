import {
  computeScore,
  findBestPathForWord,
  normalizeWord,
} from "../../components/gameLogic.js";
import { applyDailySpecialPlacements } from "../daily/dailySpecialModel.js";
import { DAILY_SPECIAL_MODE } from "../daily/dailyModes.js";
import {
  MASSIVE_BOGGLE_TYPE,
  isRareBonusEnabledForSpecial,
} from "../../game/specialRoundTypes.js";
import { clampValue } from "../../utils/numbers.js";

const WEEKLY_RECORD_LABELS = {
  bestWord: "Meilleur mot",
  longestWord: "Mot le plus long",
  bestSpecial3Score: "3 mots",
  mostWordsInGame: "Mots par manche",
  bestTimeTargetLong: "Temps mot long",
  bestTimeTargetScore: "Temps meilleur mot",
};

export function createRoundPlayerDetailsController(
  allWords,
  allWordsMap,
  board,
  dedupeWeeklyEntries,
  finalRanking,
  finalResults,
  gobbleCandidates,
  isCurrentCultureThemeWord,
  isTargetRound,
  nicknameRef,
  playCloseSound,
  recordBadgesByNickForRound,
  roundPlayerAnchorElementRef,
  roundPlayerAnchorNickRef,
  roundPlayerModal,
  roundStats,
  setRoundPlayerModal,
  specialRound,
  specialScoreConfig,
  weeklyStats
) {

function buildRoundWordsForPlayer(nick) {
  const cleanNick = String(nick || "").trim();
  if (!cleanNick) return [];
  const entry = Array.isArray(finalResults)
    ? finalResults.find((row) => String(row?.nick || "").trim() === cleanNick)
    : null;
  if (!entry || !Array.isArray(entry.words)) return [];
  const isSpeedRound = specialRound?.type === "speed";
  const isSpecial3Round = specialRound?.type === DAILY_SPECIAL_MODE;
  const isMassiveBoggleRound = specialRound?.type === MASSIVE_BOGGLE_TYPE;
  const rareBonusAllowed = isRareBonusEnabledForSpecial(specialRound);
  const wordMetaByNorm =
    entry?.wordMeta && typeof entry.wordMeta === "object" ? entry.wordMeta : {};
  const wordScoresByNorm =
    entry?.wordScores && typeof entry.wordScores === "object" ? entry.wordScores : {};
  const scoreAllowed = !isSpeedRound && !isTargetRound && !isSpecial3Round;
  const scoreGobbleAllowed = scoreAllowed && !isMassiveBoggleRound;
  const scoreCache = new Map();
  const getStats = (rawWord) => {
    const word = String(rawWord || "").trim();
    const norm = normalizeWord(word);
    if (!norm) return { pts: null, len: word.length };
    if (scoreCache.has(norm)) return scoreCache.get(norm);
    const path = findBestPathForWord(board, norm, specialScoreConfig);
    if (!path) {
      const fallback = { pts: null, len: norm.length };
      scoreCache.set(norm, fallback);
      return fallback;
    }
    const stats = {
      pts: scoreAllowed ? computeScore(norm, path, board, specialScoreConfig) : null,
      len: norm.length,
    };
    scoreCache.set(norm, stats);
    return stats;
  };

  let maxPts = null;
  if (scoreAllowed && Array.isArray(allWords) && allWords.length) {
    allWords.forEach((item) => {
      if (Number.isFinite(item?.pts)) {
        maxPts = Number.isFinite(maxPts) ? Math.max(maxPts, item.pts) : item.pts;
      }
    });
  }
  if (!Number.isFinite(maxPts) || maxPts <= 0) {
    maxPts =
      scoreAllowed && Number.isFinite(roundStats?.maxPts) && roundStats.maxPts > 0
        ? roundStats.maxPts
        : null;
  }
  let maxLen =
    Number.isFinite(roundStats?.maxLen) && roundStats.maxLen > 0
      ? roundStats.maxLen
      : 0;
  if (!Number.isFinite(maxPts) || maxPts <= 0 || !maxLen) {
    if (Array.isArray(finalResults)) {
      finalResults.forEach((row) => {
        if (!Array.isArray(row?.words)) return;
        row.words.forEach((word) => {
          const stats = getStats(word);
          if (scoreAllowed && Number.isFinite(stats.pts)) {
            maxPts = Number.isFinite(maxPts) ? Math.max(maxPts, stats.pts) : stats.pts;
          }
          if (Number.isFinite(stats.len)) {
            maxLen = Math.max(maxLen, stats.len);
          }
        });
      });
    }
  }

  const unique = new Set();
  const list = [];
  entry.words.forEach((raw) => {
    const word = String(raw || "").trim();
    if (!word) return;
    const key = word.toLowerCase();
    if (unique.has(key)) return;
    unique.add(key);
    const stats = getStats(word);
    const norm = normalizeWord(word);
    const allWordMeta = allWordsMap.get(norm) || allWordsMap.get(word) || {};
    const submittedPts = Number(wordScoresByNorm?.[norm]);
    const metaForWord = wordMetaByNorm?.[norm] || allWordMeta || {};
    const fallbackRareBonus = rareBonusAllowed ? Number(metaForWord?.rareBonusPoints) || 0 : 0;
    const userPts =
      scoreAllowed && Number.isFinite(submittedPts)
        ? submittedPts
        : scoreAllowed && Number.isFinite(stats.pts)
        ? stats.pts + fallbackRareBonus
        : null;
    const hasBestScore =
      scoreGobbleAllowed &&
      Number.isFinite(userPts) &&
      Number.isFinite(maxPts) &&
      userPts === maxPts;
    const hasLongest = Number.isFinite(stats.len) && maxLen > 0 && stats.len === maxLen;
    const gobbleCount = isSpecial3Round
      ? hasLongest
        ? 1
        : 0
      : (hasBestScore ? 1 : 0) + (hasLongest ? 1 : 0);
    const gobbleActive = isSpeedRound ? hasLongest : gobbleCount > 0;
    list.push({
      word,
      pts: userPts,
      len: Number.isFinite(stats.len) ? stats.len : 0,
      isGobble: !!gobbleActive,
      gobbleCount,
      usedFakeTwins: !!metaForWord?.usedFakeTwins,
      fakeTwinsCompletionWord: !!metaForWord?.fakeTwinsCompletionWord,
      fakeTwinsBonusOnly: !!metaForWord?.fakeTwinsBonusOnly,
      rareBonusWord: rareBonusAllowed && !!metaForWord?.rareBonusWord,
      rareBonusPoints: rareBonusAllowed ? Number(metaForWord?.rareBonusPoints) || 0 : 0,
      rarityBucket: rareBonusAllowed ? String(metaForWord?.rarityBucket || "") : "",
      cultureThemeWord: !!metaForWord?.cultureThemeWord || isCurrentCultureThemeWord(word),
    });
  });
  list.sort((a, b) => {
    if (isMassiveBoggleRound) {
      const lenDiff = (Number(b?.len) || 0) - (Number(a?.len) || 0);
      if (lenDiff !== 0) return lenDiff;
      return String(a?.word || "").localeCompare(String(b?.word || ""), "fr", {
        sensitivity: "base",
      });
    }
    if (scoreAllowed) {
      const ptsDiff = (Number(b?.pts) || 0) - (Number(a?.pts) || 0);
      if (ptsDiff !== 0) return ptsDiff;
    }
    const lenDiff = (Number(b?.len) || 0) - (Number(a?.len) || 0);
    if (lenDiff !== 0) return lenDiff;
    return String(a?.word || "").localeCompare(String(b?.word || ""), "fr", {
      sensitivity: "base",
    });
  });
  return list;
}

function buildRoundSpecial3ForPlayer(nick) {
  const cleanNick = String(nick || "").trim();
  if (!cleanNick || !Array.isArray(finalResults) || !Array.isArray(board) || !board.length) {
    return null;
  }
  const entry = finalResults.find((row) => String(row?.nick || "").trim() === cleanNick);
  if (!entry) return null;
  const placements =
    entry?.specialPlacements && typeof entry.specialPlacements === "object"
      ? entry.specialPlacements
      : {};
  const scoringBoard = applyDailySpecialPlacements(board, placements);
  const slots = (Array.isArray(entry?.specialWordSlots) ? entry.specialWordSlots : [])
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
    board: scoringBoard,
    slots,
  };
}

function getRoundRecordsForPlayer(nick) {
  const cleanNick = String(nick || "").trim();
  if (!cleanNick || !recordBadgesByNickForRound) return [];
  if (typeof recordBadgesByNickForRound.get === "function") {
    return recordBadgesByNickForRound.get(cleanNick) || [];
  }
  return recordBadgesByNickForRound[cleanNick] || [];
}

function canOpenRoundPlayerDetails(entry) {
  const nick = String(entry?.nick || "").trim();
  if (!nick) return false;
  if (!isTargetRound) return true;
  return getRoundRecordsForPlayer(nick).length > 0;
}

function buildRoundPlayerModalPayload(nick, anchorRect = null) {
  const cleanNick = String(nick || "").trim();
  if (!cleanNick) return null;
  const resultEntry = Array.isArray(finalResults)
    ? finalResults.find((row) => String(row?.nick || "").trim() === cleanNick)
    : null;
  const rankingEntry = Array.isArray(finalRanking)
    ? finalRanking.find((row) => String(row?.nick || "").trim() === cleanNick)
    : null;
  const profileSource = resultEntry || rankingEntry || {};
  const profileTarget = {
    userId: profileSource?.userId,
    installId: profileSource?.installId,
    playerKey: profileSource?.playerKey,
    nick: cleanNick,
  };
  const records = getRoundRecordsForPlayer(cleanNick);
  let targetBoardKey = "";
  let targetBoardLabel = "";
  let targetBoardEntries = [];
  if (isTargetRound) {
    if (!records.length) return null;
    const recordBoardKey =
      records.find(
        (record) =>
          record?.categoryKey === "bestTimeTargetLong" ||
          record?.categoryKey === "bestTimeTargetScore"
      )?.categoryKey || "";
    targetBoardKey =
      specialRound?.type === "target_score"
        ? "bestTimeTargetScore"
        : specialRound?.type === "target_long"
        ? "bestTimeTargetLong"
        : recordBoardKey;
    targetBoardLabel = WEEKLY_RECORD_LABELS[targetBoardKey] || "Classement hebdo";
    targetBoardEntries = buildTargetWeeklyLeaderboard(targetBoardKey);
  }
  return {
    open: true,
    nick: cleanNick,
    words: isTargetRound ? [] : buildRoundWordsForPlayer(cleanNick),
    special3:
      specialRound?.type === DAILY_SPECIAL_MODE
        ? buildRoundSpecial3ForPlayer(cleanNick)
        : null,
    allWords: isTargetRound
      ? []
      : Array.isArray(allWords)
      ? allWords.map((item) => {
          const word = String(item?.word || "").trim();
          const gobbleMeta =
            typeof gobbleCandidates?.get === "function" ? gobbleCandidates.get(word) : null;
          const gobbleCount = gobbleMeta
            ? (gobbleMeta.best ? 1 : 0) + (gobbleMeta.long ? 1 : 0)
            : 0;
          return {
            word,
            pts: Number.isFinite(item?.pts) ? item.pts : null,
            isGobble: gobbleCount > 0,
            gobbleCount,
            usedFakeTwins: !!item?.usedFakeTwins,
            fakeTwinsCompletionWord: !!item?.fakeTwinsCompletionWord,
            fakeTwinsBonusOnly: !!item?.fakeTwinsBonusOnly,
            rareBonusWord: isRareBonusEnabledForSpecial(specialRound) && !!item?.rareBonusWord,
            rareBonusPoints:
              isRareBonusEnabledForSpecial(specialRound) ? Number(item?.rareBonusPoints) || 0 : 0,
            rarityBucket:
              isRareBonusEnabledForSpecial(specialRound) ? String(item?.rarityBucket || "") : "",
            cultureThemeWord: !!item?.cultureThemeWord || isCurrentCultureThemeWord(word),
          };
        })
      : [],
    records,
    profileTarget,
    anchorRect: anchorRect || null,
    targetBoardKey,
    targetBoardLabel,
    targetBoardEntries,
  };
}

function buildTargetWeeklyLeaderboard(boardKey) {
  if (!boardKey) return [];
  const boards = weeklyStats?.boards && typeof weeklyStats.boards === "object" ? weeklyStats.boards : {};
  const source = Array.isArray(boards[boardKey]) ? boards[boardKey] : [];
  const cap = Math.max(Number(weeklyStats?.topN) || 50, 50);
  const ranked = dedupeWeeklyEntries(boardKey, source, cap);
  return ranked.map((item, index) => ({
    rank: index + 1,
    nick: item?.nick || `Joueur ${index + 1}`,
    ms: Number.isFinite(item?.ms) ? item.ms : null,
    isSelf:
      String(item?.nick || "").trim().toLowerCase() ===
      String(nicknameRef.current || "").trim().toLowerCase(),
  }));
}

function getRoundPlayerAnchorRectFromElement(anchorElement, expectedNick = "") {
  if (!(anchorElement instanceof HTMLElement)) return null;
  if (typeof document === "undefined") return null;
  if (!anchorElement.isConnected) return null;
  const expected = String(expectedNick || "").trim();
  const elementNick = String(anchorElement.dataset?.roundPlayerNick || "").trim();
  if (expected && elementNick && elementNick !== expected) return null;
  const rect = anchorElement.getBoundingClientRect?.();
  if (
    !rect ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height)
  ) {
    return null;
  }
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function findRoundPlayerAnchorRectByNick(nick, preferredRect = null) {
  const cleanNick = String(nick || "").trim();
  if (!cleanNick || typeof document === "undefined") return null;
  const nodes = document.querySelectorAll("[data-round-player-anchor='1']");
  if (!nodes || !nodes.length) return null;
  const viewportHeight =
    Number.isFinite(window?.innerHeight) && window.innerHeight > 0
      ? window.innerHeight
      : Number.POSITIVE_INFINITY;
  const viewportWidth =
    Number.isFinite(window?.innerWidth) && window.innerWidth > 0
      ? window.innerWidth
      : Number.POSITIVE_INFINITY;
  const preferredCenterX =
    Number.isFinite(preferredRect?.left) && Number.isFinite(preferredRect?.width)
      ? preferredRect.left + preferredRect.width / 2
      : null;
  const preferredCenterY =
    Number.isFinite(preferredRect?.top) && Number.isFinite(preferredRect?.height)
      ? preferredRect.top + preferredRect.height / 2
      : null;
  const maxAllowedDistance =
    Number.isFinite(preferredCenterX) && Number.isFinite(preferredCenterY)
      ? Math.max(120, Math.min(viewportWidth, viewportHeight) * 0.45)
      : Number.POSITIVE_INFINITY;
  let best = null;
  nodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const nodeNick = String(node.dataset?.roundPlayerNick || "").trim();
    if (!nodeNick || nodeNick !== cleanNick) return;
    const rect = node.getBoundingClientRect?.();
    if (
      !rect ||
      !Number.isFinite(rect.left) ||
      !Number.isFinite(rect.top) ||
      !Number.isFinite(rect.width) ||
      !Number.isFinite(rect.height)
    ) {
      return;
    }
    if (rect.width <= 0 || rect.height <= 0) return;
    const visible =
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < viewportHeight &&
      rect.left < viewportWidth;
    const area = rect.width * rect.height;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance =
      Number.isFinite(preferredCenterX) && Number.isFinite(preferredCenterY)
        ? Math.hypot(centerX - preferredCenterX, centerY - preferredCenterY)
        : Number.POSITIVE_INFINITY;
    if (Number.isFinite(distance) && distance > maxAllowedDistance) return;
    if (!best) {
      best = { rect, area, visible, distance };
      return;
    }
    if (visible && !best.visible) {
      best = { rect, area, visible, distance };
      return;
    }
    if (visible === best.visible) {
      if (Number.isFinite(distance) && Number.isFinite(best.distance)) {
        if (distance < best.distance - 0.5) {
          best = { rect, area, visible, distance };
          return;
        }
        if (Math.abs(distance - best.distance) <= 0.5 && area > best.area) {
          best = { rect, area, visible, distance };
        }
        return;
      }
      if (area > best.area) {
        best = { rect, area, visible, distance };
      }
    }
  });
  if (!best?.rect) return null;
  return {
    left: best.rect.left,
    top: best.rect.top,
    width: best.rect.width,
    height: best.rect.height,
  };
}

function openRoundPlayerModal(entry, anchorElement = null, clickPoint = null) {
  const nick = String(entry?.nick || "").trim();
  if (!nick) return;
  const anchorFromElement = getRoundPlayerAnchorRectFromElement(anchorElement, nick);
  const hasPoint =
    clickPoint &&
    Number.isFinite(clickPoint.clientX) &&
    Number.isFinite(clickPoint.clientY);
  const anchorRect =
    hasPoint
      ? {
          left: clickPoint.clientX,
          top: clickPoint.clientY,
          width: 0,
          height: 0,
        }
      : anchorFromElement || null;
  const payload = buildRoundPlayerModalPayload(nick, anchorRect);
  if (!payload) return;
  roundPlayerAnchorElementRef.current =
    anchorElement instanceof HTMLElement ? anchorElement : null;
  roundPlayerAnchorNickRef.current = nick;
  setRoundPlayerModal(payload);
}

function navigateRoundPlayerModal(step = 1) {
  if (!roundPlayerModal?.open) return;
  const currentNick = String(roundPlayerModal?.nick || "").trim();
  if (!currentNick) return;
  const navEntries = Array.isArray(finalRanking)
    ? finalRanking.filter((entry) => canOpenRoundPlayerDetails(entry))
    : [];
  if (!navEntries.length) return;
  const currentIndex = navEntries.findIndex(
    (entry) => String(entry?.nick || "").trim() === currentNick
  );
  if (currentIndex < 0) return;
  const direction = Number(step) < 0 ? -1 : 1;
  const nextIndex = clampValue(currentIndex + direction, 0, navEntries.length - 1);
  if (nextIndex === currentIndex) return;
  const nextNick = String(navEntries[nextIndex]?.nick || "").trim();
  if (!nextNick) return;
  const nextAnchorRect =
    findRoundPlayerAnchorRectByNick(nextNick, roundPlayerModal.anchorRect) ||
    roundPlayerModal.anchorRect ||
    null;
  const payload = buildRoundPlayerModalPayload(nextNick, nextAnchorRect);
  if (!payload) return;
  roundPlayerAnchorElementRef.current = null;
  roundPlayerAnchorNickRef.current = nextNick;
  setRoundPlayerModal(payload);
}

function closeRoundPlayerModal({ withSound = true } = {}) {
  if (withSound) playCloseSound();
  setRoundPlayerModal((prev) => {
    if (!prev.open) return prev;
    const anchorFromElement = getRoundPlayerAnchorRectFromElement(
      roundPlayerAnchorElementRef.current,
      roundPlayerAnchorNickRef.current || prev.nick
    );
    const liveAnchorRect =
      anchorFromElement || findRoundPlayerAnchorRectByNick(prev.nick, prev.anchorRect);
    return {
      ...prev,
      open: false,
      anchorRect: liveAnchorRect || prev.anchorRect || null,
    };
  });
  roundPlayerAnchorElementRef.current = null;
  roundPlayerAnchorNickRef.current = "";
}


  return [
    canOpenRoundPlayerDetails,
    closeRoundPlayerModal,
    getRoundRecordsForPlayer,
    navigateRoundPlayerModal,
    openRoundPlayerModal,
  ];
}
