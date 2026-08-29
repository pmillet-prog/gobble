import { SFX_KEYS } from "../assets/assetKeys.js";
import {
  DAILY_SPECIAL_WORD_TARGET,
  applyDailySpecialPlacements,
  createDailyWordSlots,
  getDailySpecialWordBlockedReason,
} from "../components/daily/dailySpecialModel.js";
import { DAILY_SPECIAL_MODE } from "../components/daily/dailyModes.js";
import {
  FAKE_TWINS_TYPE,
  OCID_TYPE,
  buildPathWordVariants,
  computeScore,
  findBestPathForWord,
  normalizeWord,
  scoreWordOnGridWithPath,
  summarizeBonuses,
} from "../components/gameLogic.js";
import {
  queuePendingSubmissionWords,
  restorePendingSubmissionState,
  takeInFlightSubmissionWords,
} from "../network/liveSubmissionRecovery.js";
import { recordPerfEvent } from "../perf/renderPerfProbe.js";
import { clampValue } from "../utils/numbers.js";
import { resolveScoreFlightPoints } from "../utils/scoreFlightPoints.js";
import { patchFirstMatchingFeedEntry } from "./liveFeedReconciliation.js";
import {
  MASSIVE_BOGGLE_TYPE,
  isRareBonusEnabledForSpecial,
} from "./specialRoundTypes.js";

export function createWordSubmissionEngine(
  acceptedBestPtsRef,
  acceptedRef,
  acceptedScoresRef,
  acceptedWordMetaRef,
  acceptedWordSetRef,
  activeTraceStartedAtRef,
  allWordsMap,
  appViewRef,
  areStringArraysEqual,
  attemptSilentReconnectRef,
  batchSeqRef,
  batchTimerRef,
  batchUnsupportedRef,
  bestGridMaxLenRef,
  bestGridMaxRef,
  board,
  clearSelection,
  currentTilesRef,
  dailyAcceptedPathsRef,
  dailyActiveSlot,
  dailySpecialPlacements,
  dailyWordSlots,
  dictionary,
  draggingRef,
  dragGridMetricsRef,
  error,
  finishStandaloneTraining,
  foundTargetThisRound,
  getMassiveBoggleFeedbackPoints,
  getNextLiveFeedTs,
  handleForeground,
  highlightPathRef,
  inFlightBatchesRef,
  inputLockedRef,
  isCurrentCultureThemeWord,
  isDailyPlayRef,
  isLiveSpecial3WordsMode,
  isLoggedIn,
  isLoggedInRef,
  isMobileLayoutRef,
  isSpecial3WordsMode,
  isTouchDeviceRef,
  keyboardRecallSubmittedWordRef,
  lastInputModeRef,
  liveSessionReadyRef,
  maybeAnnounceBestWord,
  nickname,
  ocidLatestProposalRef,
  pendingQueueRef,
  pendingWordsRef,
  playAlreadyPlayedSound,
  playDoubleGobbleVoice,
  playGobbleVoice,
  playOneShotAudio,
  playScoreSound,
  pushWordHistory,
  registerAcceptedWordRuntime,
  resetDragMovePipeline,
  roundId,
  roundIdRef,
  roundStats,
  scheduleForegroundRetry,
  serverSolutionsReadyRef,
  setAccepted,
  setDailyActiveSlot,
  setDailyInvalidPulseKey,
  setDailyInvalidSlot,
  setDailySpecialPlacements,
  setDailyWordSlots,
  setFoundTargetThisRound,
  setFoundTargetWord,
  setHighlightPath,
  setLastWords,
  setOcidProposal,
  setOcidProposalPath,
  setOcidProposalSubmitted,
  setOcidStatusMessage,
  setScore,
  setStatusMessageWithHold,
  showToast,
  socket,
  solutionsRef,
  SPECIAL_TUTORIAL_SPEED_SCORE_FALLBACK,
  specialRound,
  specialScoreConfig,
  standaloneTrainingSessionRef,
  submissionStatusRef,
  touchSubmissionState,
  triggerConfettiBurst,
  triggerPraiseFlash,
  triggerScoreFlight,
  WORD_BATCH_ACK_TIMEOUT_MS,
  WORD_BATCH_FLUSH_MS,
  WORD_BATCH_MAX,
) {

  function markRejectedWord(word, reason = "") {
    if (!word) return;
    const meta = submissionStatusRef.current.get(word) || {};
    if (meta.optimisticApplied) {
      revertOptimisticWord(word, meta);
    }
    submissionStatusRef.current.set(word, {
      ...meta,
      status: "rejected",
      reason,
      ts: meta.ts || Date.now(),
    });
    pendingWordsRef.current.delete(word);
    touchSubmissionState();
    const cleanupDelay = 2500;
    setTimeout(() => {
      const current = submissionStatusRef.current.get(word);
      if (current?.status === "rejected") {
        submissionStatusRef.current.delete(word);
        touchSubmissionState();
      }
    }, cleanupDelay);
  }

  function revertOptimisticWord(word, meta = {}) {
    if (!word) return;
    const optimisticPts = Number.isFinite(meta?.optimisticPts) ? Number(meta.optimisticPts) : 0;
    acceptedWordSetRef.current.delete(word);
    acceptedScoresRef.current.delete(word);
    acceptedBestPtsRef.current.delete(word);
    acceptedWordMetaRef.current.delete(word);
    dailyAcceptedPathsRef.current.delete(word);
    setAccepted((prev) => {
      const updated = Array.isArray(prev) ? prev.filter((entry) => entry !== word) : [];
      acceptedRef.current = updated;
      acceptedWordSetRef.current = new Set(updated);
      return updated;
    });
    if (optimisticPts > 0) {
      setScore((prev) => Math.max(0, prev - optimisticPts));
    }
    setLastWords((prev) =>
      Array.isArray(prev)
        ? prev.filter((entry) => normalizeWord(entry?.display || "") !== word)
        : []
    );
  }

  function applyServerWordResult(word, result) {
    if (!word) return;
    const meta = submissionStatusRef.current.get(word) || {};
    const reason = result?.reason || result?.error || "";
    const acceptedByServer = !!result?.ok || reason === "already_played";
    if (!acceptedByServer) {
      if (meta.optimisticApplied) {
        revertOptimisticWord(word, meta);
        submissionStatusRef.current.delete(word);
        pendingWordsRef.current.delete(word);
        touchSubmissionState();
        return;
      }
      if (reason === "not_target") {
        setStatusMessageWithHold("Pas le mot cible", 1400);
      } else if (reason === "already_found") {
        setStatusMessageWithHold("Déjà trouvé", 1200);
        playAlreadyPlayedSound();
      }
      markRejectedWord(word, reason || "error");
      return;
    }

    const pts =
      Number.isFinite(result?.points)
        ? result.points
        : Number.isFinite(result?.wordScore)
        ? result.wordScore
        : meta.optimisticPts;
    const usedFakeTwins =
      !!result?.usedFakeTwins ||
      !!meta?.usedFakeTwins ||
      !!allWordsMap.get(word)?.usedFakeTwins;
    const fakeTwinsCompletionWord =
      usedFakeTwins &&
      (result?.fakeTwinsCompletionWord ??
        meta?.fakeTwinsCompletionWord ??
        allWordsMap.get(word)?.fakeTwinsCompletionWord ??
        true);
    const fakeTwinsBonusOnly =
      usedFakeTwins &&
      (result?.fakeTwinsBonusOnly ??
        meta?.fakeTwinsBonusOnly ??
        allWordsMap.get(word)?.fakeTwinsBonusOnly ??
        !fakeTwinsCompletionWord);
    const rareBonusEnabledNow = isRareBonusEnabledForSpecial(specialRound);
    const rareBonusWord =
      rareBonusEnabledNow &&
      (!!result?.rareBonusWord || !!meta?.rareBonusWord || !!allWordsMap.get(word)?.rareBonusWord);
    const rareBonusPoints = rareBonusEnabledNow
      ? Number(result?.rareBonusPoints) ||
        Number(meta?.rareBonusPoints) ||
        Number(allWordsMap.get(word)?.rareBonusPoints) ||
        0
      : 0;
    const rarityBucket = rareBonusEnabledNow
      ? String(result?.rarityBucket || meta?.rarityBucket || allWordsMap.get(word)?.rarityBucket || "")
      : "";
    const cultureThemeWord =
      !!result?.cultureThemeWord ||
      !!meta?.cultureThemeWord ||
      !!allWordsMap.get(word)?.cultureThemeWord ||
      isCurrentCultureThemeWord(word);
    const totalScore =
      Number.isFinite(result?.totalScore)
        ? result.totalScore
        : Number.isFinite(result?.score)
        ? result.score
        : null;
    const safePts = Number.isFinite(pts) ? pts : 0;
    const display = meta.display || word.toUpperCase();
    const path =
      Array.isArray(meta.path) && meta.path.length > 0
        ? meta.path
        : findBestPathForWord(board, word, specialScoreConfig);

    const isTargetRoundNow =
      specialRound?.type === "target_long" || specialRound?.type === "target_score";

    const alreadyAccepted = acceptedWordSetRef.current.has(word);
    if (meta.optimisticApplied) {
      submissionStatusRef.current.delete(word);
    } else {
      submissionStatusRef.current.set(word, {
        ...meta,
        status: "accepted",
        reason: "",
        usedFakeTwins,
        fakeTwinsCompletionWord,
        fakeTwinsBonusOnly,
        rareBonusWord,
        rareBonusPoints,
        rarityBucket,
        cultureThemeWord,
        ts: meta.ts || Date.now(),
      });
    }
    pendingWordsRef.current.delete(word);
    touchSubmissionState({ deferDuringTrace: !!meta.optimisticApplied });

    const computedBestPts =
      Array.isArray(path) && path.length > 0
        ? computeScore(word, path, board, specialScoreConfig)
        : safePts;
    if (meta.optimisticApplied) {
      const optimisticPts = Number.isFinite(meta?.optimisticPts) ? Number(meta.optimisticPts) : 0;
      if (Number.isFinite(totalScore)) {
        setScore(totalScore);
      } else if (Number.isFinite(safePts) && safePts !== optimisticPts) {
        setScore((prev) => Math.max(0, prev - optimisticPts + safePts));
      }
      registerAcceptedWordRuntime(word, {
        score: Number.isFinite(pts) ? pts : null,
        bestPts: computedBestPts,
        usedFakeTwins,
        fakeTwinsCompletionWord,
        fakeTwinsBonusOnly,
        rareBonusWord,
        rareBonusPoints,
        rarityBucket,
        cultureThemeWord,
      });
      setLastWords((prev) =>
        patchFirstMatchingFeedEntry(
          prev,
          (entry) => normalizeWord(entry?.display || "") === word,
          {
            pts: safePts,
            display,
            usedFakeTwins,
            fakeTwinsCompletionWord,
            fakeTwinsBonusOnly,
            rareBonusWord,
            rareBonusPoints,
            rarityBucket,
            cultureThemeWord,
          }
        )
      );
      return;
    }
    if (Number.isFinite(totalScore)) {
      setScore(totalScore);
    } else if (!alreadyAccepted && Number.isFinite(safePts)) {
      setScore((s) => s + safePts);
    }
    registerAcceptedWordRuntime(word, {
      score: Number.isFinite(pts) ? pts : null,
      bestPts: computedBestPts,
      usedFakeTwins,
      fakeTwinsCompletionWord,
      fakeTwinsBonusOnly,
      rareBonusWord,
      rareBonusPoints,
      rarityBucket,
      cultureThemeWord,
    });
    pushWordHistory(word);

    if (!alreadyAccepted) {
      const wordBonuses = path ? summarizeBonuses(path, board) : null;
      const feedTs = getNextLiveFeedTs();
      const feedItemId = `word-${feedTs}`;
      setLastWords((prev) => {
        const feedLabel = isTargetRoundNow ? "gobble" : null;
        const next = [
          {
            id: feedTs,
            ts: feedTs,
            display,
            pts: safePts,
            label: feedLabel,
            bonuses: wordBonuses,
            usedFakeTwins,
            fakeTwinsCompletionWord,
            fakeTwinsBonusOnly,
            rareBonusWord,
            rareBonusPoints,
            rarityBucket,
            cultureThemeWord,
          },
          ...prev,
        ];
        return next.slice(0, 24);
      });
      if (!isTargetRoundNow) {
        triggerScoreFlight({ feedItemId, path, points: safePts });
      }

      const wordLen = normalizeWord(display || word || "").length || 3;
      const isMassiveBoggleRoundNow = specialRound?.type === MASSIVE_BOGGLE_TYPE;
      const feedbackPts = isMassiveBoggleRoundNow
        ? getMassiveBoggleFeedbackPoints(safePts, display || word)
        : safePts;
      if (isTargetRoundNow) {
        setFoundTargetThisRound(true);
        setFoundTargetWord(word);
        triggerConfettiBurst("target");
        showToast("Trouv\u00e9 !");
      } else {
        maybeAnnounceBestWord(nickname.trim() || "Moi", display || word, safePts);
        playScoreSound(feedbackPts);
      }

      const isSpeedRound = specialRound?.type === "speed";
      const maxPossiblePts = bestGridMaxRef.current || 0;
      const maxPossibleLen = bestGridMaxLenRef.current || 0;
      const allowScoreGobble =
        !isSpeedRound &&
        !isMassiveBoggleRoundNow &&
        specialRound?.type !== DAILY_SPECIAL_MODE;
      const allowLenGobble = true;
      const isScoreGobbleNow =
        allowScoreGobble && maxPossiblePts > 0 && safePts === maxPossiblePts;
      const isLenGobbleNow =
        allowLenGobble && maxPossibleLen > 0 && wordLen === maxPossibleLen;
      const isGobbleNow = isScoreGobbleNow || isLenGobbleNow;
      const isDoubleGobbleNow = isScoreGobbleNow && isLenGobbleNow;

      if (!isTargetRoundNow) {
        if (isGobbleNow) {
          if (isDoubleGobbleNow) playDoubleGobbleVoice();
          else playGobbleVoice();
          triggerPraiseFlash(isDoubleGobbleNow ? "DOUBLE GOBBLE !" : "GOBBLE !", {
            kind: isDoubleGobbleNow ? "doubleGobble" : "gobble",
            shakeGrid: true,
            force: isDoubleGobbleNow,
          });
        } else if (!isSpeedRound) {
          if (feedbackPts > 29) {
            triggerPraiseFlash("EPIQUE !", { kind: "epic", shakeGrid: true });
          } else if (feedbackPts > 19) {
            triggerPraiseFlash("ENORME !", { kind: "gold", shakeGrid: true });
          } else if (feedbackPts > 9) {
            triggerPraiseFlash("FABULEUX !", { kind: "purple" });
          } else if (feedbackPts > 5) {
            triggerPraiseFlash("EXCELLENT !", { kind: "blue" });
          }
        }
      }
    }

    setAccepted((prev) => {
      if (prev.includes(word)) {
        acceptedRef.current = prev;
        acceptedWordSetRef.current = new Set(prev);
        return prev;
      }
      const updated = [...prev, word];
      acceptedRef.current = updated;
      acceptedWordSetRef.current = new Set(updated);
      return updated;
    });

    if (!alreadyAccepted) {
      setStatusMessageWithHold(isTargetRoundNow ? "Trouv\u00e9 !" : `+${safePts} pts`);
    }
    setTimeout(() => {
      const current = submissionStatusRef.current.get(word);
      if (current?.status === "accepted") {
        submissionStatusRef.current.delete(word);
        touchSubmissionState();
      }
    }, 0);
  }

  function queuePendingWordsForRetry(words) {
    queuePendingSubmissionWords({
      words,
      pendingQueue: pendingQueueRef.current,
      pendingWords: pendingWordsRef.current,
      statusMap: submissionStatusRef.current,
    });
    touchSubmissionState();
  }

  function requeueInFlightSubmissions() {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    const words = takeInFlightSubmissionWords(inFlightBatchesRef.current);
    queuePendingWordsForRetry(words);
  }

  function restorePendingSubmissionEntries(entries, activeRoundId) {
    const restored = restorePendingSubmissionState({
      entries,
      activeRoundId,
      statusMap: submissionStatusRef.current,
      pendingWords: pendingWordsRef.current,
      pendingQueue: pendingQueueRef.current,
    });
    touchSubmissionState();
    return restored;
  }

  function sendFallbackWords(words, roundIdValue) {
    if (!Array.isArray(words) || words.length === 0) return;
    if (
      !socket.connected ||
      !isLoggedInRef.current ||
      !liveSessionReadyRef.current ||
      !roundIdValue
    ) {
      queuePendingWordsForRetry(words);
      return;
    }
    for (const word of words) {
      if (!word) continue;
      const meta = submissionStatusRef.current.get(word) || {};
      const path =
        Array.isArray(meta.path) && meta.path.length > 0
          ? meta.path
          : findBestPathForWord(board, word, specialScoreConfig);
      if (!path || path.length === 0) {
        applyServerWordResult(word, { ok: false, reason: "invalid_word" });
        continue;
      }
      const sentAt = Date.now();
      socket.emit(
        "submitWord",
        {
          roundId: roundIdValue,
          word,
          path,
          traceStartedAt: meta.traceStartedAt ?? null,
        },
        (res) => {
          recordPerfEvent("word-ack", {
            count: 1,
            latencyMs: Math.max(0, Date.now() - sentAt),
            ok: !!res?.ok,
          });
          if (res?.error === "not_logged_in") {
            liveSessionReadyRef.current = false;
            queuePendingWordsForRetry([word]);
            attemptSilentReconnectRef.current?.("submit_session_lost");
            return;
          }
          applyServerWordResult(word, res);
          if (res?.ok && Array.isArray(res.extraWords)) {
            res.extraWords.forEach((extra) => {
              const extraWord = normalizeWord(extra?.word || "");
              if (!extraWord) return;
              applyServerWordResult(extraWord, {
                ...extra,
                ok: true,
                word: extraWord,
                points: extra?.points ?? extra?.wordScore,
                totalScore: extra?.totalScore ?? res.totalScore ?? res.score,
              });
            });
          }
        }
      );
    }
  }

  function handleBatchTimeout(clientSeq) {
    const inFlight = inFlightBatchesRef.current.get(clientSeq);
    if (!inFlight) return;
    inFlightBatchesRef.current.delete(clientSeq);
    const pending = inFlight.words.filter(
      (word) => submissionStatusRef.current.get(word)?.status === "pending"
    );
    if (!pending.length) return;
    if (!socket.connected || !liveSessionReadyRef.current) {
      queuePendingWordsForRetry(pending);
      return;
    }
    batchUnsupportedRef.current = true;
    sendFallbackWords(pending, roundIdRef.current);
  }

  function handleBatchAck(clientSeq, res) {
    const inFlight = inFlightBatchesRef.current.get(clientSeq);
    if (!inFlight) return;
    recordPerfEvent("word-ack", {
      count: Array.isArray(inFlight.words) ? inFlight.words.length : 0,
      latencyMs: Math.max(0, Date.now() - (Number(inFlight.sentAt) || Date.now())),
      ok: !!res?.ok,
    });
    if (inFlight.timeoutId) clearTimeout(inFlight.timeoutId);
    inFlightBatchesRef.current.delete(clientSeq);
    if (res?.error === "not_logged_in") {
      liveSessionReadyRef.current = false;
      queuePendingWordsForRetry(inFlight.words);
      attemptSilentReconnectRef.current?.("batch_session_lost");
      return;
    }
    if (res?.ok) {
      batchUnsupportedRef.current = false;
    }
    const results = Array.isArray(res?.results) ? res.results : [];
    const byWord = new Map();
    let authoritativeTotalScore = null;
    results.forEach((entry) => {
      const norm = normalizeWord(entry?.word || "");
      if (norm) byWord.set(norm, entry);
      const totalScore = Number.isFinite(entry?.totalScore)
        ? Number(entry.totalScore)
        : Number.isFinite(entry?.score)
        ? Number(entry.score)
        : null;
      if (Number.isFinite(totalScore)) {
        authoritativeTotalScore = totalScore;
      }
    });
    inFlight.words.forEach((word) => {
      const result = byWord.get(word) || { word, ok: false, reason: "no_response" };
      applyServerWordResult(word, result);
      if (result?.ok && Array.isArray(result.extraWords)) {
        result.extraWords.forEach((extra) => {
          const extraWord = normalizeWord(extra?.word || "");
          if (!extraWord || byWord.has(extraWord)) return;
          applyServerWordResult(extraWord, {
            ...extra,
            ok: true,
            word: extraWord,
            points: extra?.points ?? extra?.wordScore,
            totalScore: extra?.totalScore ?? result.totalScore ?? result.score,
          });
        });
      }
    });
    if (Number.isFinite(authoritativeTotalScore)) {
      let remainingOptimisticScore = 0;
      submissionStatusRef.current.forEach((meta) => {
        if (
          meta?.status === "pending" &&
          meta?.optimisticApplied &&
          Number.isFinite(meta?.optimisticPts)
        ) {
          remainingOptimisticScore += Number(meta.optimisticPts);
        }
      });
      setScore(authoritativeTotalScore + remainingOptimisticScore);
    }
  }

  function flushPendingBatch() {
    if (
      !socket.connected ||
      !isLoggedInRef.current ||
      !liveSessionReadyRef.current
    ) return;
    const activeRoundId = roundIdRef.current;
    if (!activeRoundId) return;
    const queue = pendingQueueRef.current;
    if (!Array.isArray(queue) || queue.length === 0) return;

    const unique = [];
    const seen = new Set();
    for (const word of queue) {
      if (!word || seen.has(word)) continue;
      seen.add(word);
      unique.push(word);
    }
    pendingQueueRef.current = [];
    if (unique.length === 0) return;

    if (batchUnsupportedRef.current) {
      sendFallbackWords(unique, activeRoundId);
      return;
    }

    const clientSeq = batchSeqRef.current++;
    const timeoutId = setTimeout(
      () => handleBatchTimeout(clientSeq),
      WORD_BATCH_ACK_TIMEOUT_MS
    );
    inFlightBatchesRef.current.set(clientSeq, {
      words: unique,
      timeoutId,
      sentAt: Date.now(),
    });

    const items = unique.map((word) => {
      const meta = submissionStatusRef.current.get(word) || {};
      const path =
        Array.isArray(meta.path) && meta.path.length > 0
          ? meta.path
          : findBestPathForWord(board, word, specialScoreConfig);
      return {
        word,
        path,
        traceStartedAt: meta.traceStartedAt ?? null,
      };
    });
    const payload = {
      roundId: activeRoundId,
      items,
      clientSeq,
    };
    socket.emit("submitWordsBatch", payload, (res) => {
      handleBatchAck(clientSeq, res);
    });
  }

  function scheduleBatchFlush({ immediate = false } = {}) {
    if (immediate || pendingQueueRef.current.length >= WORD_BATCH_MAX) {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
      flushPendingBatch();
      return;
    }
    if (batchTimerRef.current) return;
    batchTimerRef.current = setTimeout(() => {
      batchTimerRef.current = null;
      flushPendingBatch();
    }, WORD_BATCH_FLUSH_MS);
  }

  function enqueuePendingWord(word, meta = {}) {
    if (!word) return;
    if (pendingWordsRef.current.has(word)) return;
    pendingWordsRef.current.add(word);
    submissionStatusRef.current.set(word, {
      status: "pending",
      ts: Date.now(),
      ...meta,
      roundId: meta?.roundId ?? roundIdRef.current ?? null,
      cultureThemeWord: !!meta?.cultureThemeWord || isCurrentCultureThemeWord(word),
    });
    pendingQueueRef.current.push(word);
    touchSubmissionState();
    scheduleBatchFlush();
  }

  function applyLocalWordScoring({
    raw,
    display,
    path,
    usedFakeTwins = false,
    fakeTwinsCompletionWord = false,
    fakeTwinsBonusOnly = false,
    rareBonusWord = false,
    rareBonusPoints = 0,
    rarityBucket = "",
    cultureThemeWord = false,
    ptsOverride = null,
    scoreFlightPoints = null,
  }) {
    recordPerfEvent("word-local", {
      length: String(raw || "").length,
      pathLength: Array.isArray(path) ? path.length : 0,
    });
    const computedPts = computeScore(raw, path, board, specialScoreConfig);
    const pts = Number.isFinite(ptsOverride) ? Number(ptsOverride) : computedPts;
    const flightPoints = resolveScoreFlightPoints({
      awardedPoints: pts,
      candidatePoints: scoreFlightPoints,
      specialRound,
      speedFallback: SPECIAL_TUTORIAL_SPEED_SCORE_FALLBACK,
    });
    const rareBonusEnabledNow = isRareBonusEnabledForSpecial(specialRound);
    const effectiveRareBonusWord = rareBonusEnabledNow && !!rareBonusWord;
    const effectiveRareBonusPoints = rareBonusEnabledNow ? Number(rareBonusPoints) || 0 : 0;
    const effectiveRarityBucket = rareBonusEnabledNow ? String(rarityBucket || "") : "";
    const effectiveCultureThemeWord = !!cultureThemeWord || isCurrentCultureThemeWord(raw);
    const displayStr = display || raw.toUpperCase();
    const now = getNextLiveFeedTs();
    const normalizedPath = Array.isArray(path)
      ? path
          .map((idx) => Number(idx))
          .filter((idx) => Number.isInteger(idx) && idx >= 0)
      : [];

    setScore((s) => s + pts);
    registerAcceptedWordRuntime(raw, {
      score: pts,
      bestPts: pts,
      usedFakeTwins,
      fakeTwinsCompletionWord,
      fakeTwinsBonusOnly,
      rareBonusWord: effectiveRareBonusWord,
      rareBonusPoints: effectiveRareBonusPoints,
      rarityBucket: effectiveRarityBucket,
      cultureThemeWord: effectiveCultureThemeWord,
    });
    dailyAcceptedPathsRef.current.set(raw, {
      word: raw,
      path: normalizedPath,
    });
    pushWordHistory(raw);

    const wordBonuses = summarizeBonuses(path, board);
    const isTargetRoundNow =
      specialRound?.type === "target_long" || specialRound?.type === "target_score";
    if (isTargetRoundNow) {
      setFoundTargetThisRound(true);
      setFoundTargetWord(raw);
      triggerConfettiBurst("target");
    }
    setLastWords((prev) => {
      const feedLabel = isTargetRoundNow ? "gobble" : null;
      const next = [
        {
          id: now,
          ts: now,
          display: displayStr,
          pts,
          label: feedLabel,
          bonuses: wordBonuses,
          usedFakeTwins: !!usedFakeTwins,
          fakeTwinsCompletionWord: !!fakeTwinsCompletionWord,
          fakeTwinsBonusOnly: !!fakeTwinsBonusOnly,
          rareBonusWord: effectiveRareBonusWord,
          rareBonusPoints: effectiveRareBonusPoints,
          rarityBucket: effectiveRarityBucket,
          cultureThemeWord: effectiveCultureThemeWord,
        },
        ...prev,
      ];
      return next.slice(0, 24);
    });
    if (!isTargetRoundNow) {
      triggerScoreFlight({
        feedItemId: `word-${now}`,
        path: normalizedPath,
        points: flightPoints,
      });
    }

    const wordLen = normalizeWord(displayStr || raw || "").length || 3;
    const isMassiveBoggleRoundNow = specialRound?.type === MASSIVE_BOGGLE_TYPE;
    const feedbackPts = isMassiveBoggleRoundNow
      ? getMassiveBoggleFeedbackPoints(pts, displayStr || raw)
      : pts;

    if (isTargetRoundNow) {
      showToast("Trouvé !");
    } else {
      playScoreSound(feedbackPts);
      maybeAnnounceBestWord(nickname.trim() || "Moi", displayStr || raw, pts);
    }
    const isSpeedRound = specialRound?.type === "speed";
    const maxPossiblePts = bestGridMaxRef.current || 0;
    const maxPossibleLen = bestGridMaxLenRef.current || 0;
    const allowScoreGobble =
      !isSpeedRound &&
      !isMassiveBoggleRoundNow &&
      specialRound?.type !== DAILY_SPECIAL_MODE;
    const allowLenGobble = true;
    const isScoreGobbleNow =
      allowScoreGobble && maxPossiblePts > 0 && pts === maxPossiblePts;
    const isLenGobbleNow =
      allowLenGobble && maxPossibleLen > 0 && wordLen === maxPossibleLen;
    const isGobbleNow = isScoreGobbleNow || isLenGobbleNow;
    const isDoubleGobbleNow = isScoreGobbleNow && isLenGobbleNow;

    if (!isTargetRoundNow && isGobbleNow) {
      if (isDoubleGobbleNow) playDoubleGobbleVoice();
      else playGobbleVoice();
      triggerPraiseFlash(isDoubleGobbleNow ? "DOUBLE GOBBLE !" : "GOBBLE !", {
        kind: isDoubleGobbleNow ? "doubleGobble" : "gobble",
        shakeGrid: true,
        force: isDoubleGobbleNow,
      });
    } else if (!isTargetRoundNow && !isSpeedRound) {
      if (feedbackPts > 29) {
        triggerPraiseFlash("EPIQUE !", { kind: "epic", shakeGrid: true });
      } else if (feedbackPts > 19) {
        triggerPraiseFlash("ENORME !", { kind: "gold", shakeGrid: true });
      } else if (feedbackPts > 9) {
        triggerPraiseFlash("FABULEUX !", { kind: "purple" });
      } else if (feedbackPts > 5) {
        triggerPraiseFlash("EXCELLENT !", { kind: "blue" });
      }
    }

    setAccepted((prev) => {
      const updated = [...prev, raw];
      acceptedRef.current = updated;
      acceptedWordSetRef.current = new Set(updated);
      return updated;
    });

    setStatusMessageWithHold(isTargetRoundNow ? "Trouvé !" : `+${pts} pts`);
    clearSelection();
    if (isTargetRoundNow && standaloneTrainingSessionRef.current) {
      finishStandaloneTraining({ skipAutoSubmit: true });
    }
  }

  function getSubmissionTraceStartedAt() {
    const traceStartedAt = Number(activeTraceStartedAtRef.current);
    return Number.isFinite(traceStartedAt) ? Math.max(0, Math.round(traceStartedAt)) : null;
  }

  function getPathPreviewScoreConfig() {
    if (
      specialScoreConfig?.type === FAKE_TWINS_TYPE &&
      Number.isFinite(specialScoreConfig?.minWordLength) &&
      specialScoreConfig.minWordLength > 2
    ) {
      return {
        ...specialScoreConfig,
        minWordLength: 2,
      };
    }
    return specialScoreConfig;
  }

  function getLivePreviewLabelForCell(cell) {
    const letter = String(cell?.letter || "").trim();
    const altLetter = String(cell?.altLetter || "").trim();
    if (
      specialScoreConfig?.type === FAKE_TWINS_TYPE &&
      cell?.specialType === FAKE_TWINS_TYPE &&
      letter &&
      altLetter &&
      normalizeWord(altLetter) !== normalizeWord(letter)
    ) {
      return `${letter}/${altLetter}`;
    }
    return letter;
  }

  function buildPathWordCandidates(path) {
    return buildPathWordVariants(board, path, specialScoreConfig);
  }

  function hasServerSubmissionSolution(rawWord) {
    const word = normalizeWord(rawWord || "");
    return !!word && solutionsRef.current instanceof Map && solutionsRef.current.has(word);
  }

  function hasClientDictionaryWord(rawWord) {
    const word = normalizeWord(rawWord || "");
    return !!word && !!dictionary && dictionary.has(word);
  }

  function isKnownSubmissionWord(rawWord) {
    if (serverSolutionsReadyRef.current) return hasServerSubmissionSolution(rawWord);
    return hasClientDictionaryWord(rawWord);
  }

  function isTargetSubmissionRound() {
    return specialRound?.type === "target_long" || specialRound?.type === "target_score";
  }

  function getTargetSubmissionErrorMessage(rawWord) {
    if (!serverSolutionsReadyRef.current && dictionary && !hasClientDictionaryWord(rawWord)) {
      return "INVALIDE";
    }
    return "Pas le mot cible";
  }

  function getMissingSubmissionPathMessage(rawWord) {
    if (specialRound?.type === OCID_TYPE) return "Mot absent de la grille";
    if (isTargetSubmissionRound()) {
      return getTargetSubmissionErrorMessage(rawWord);
    }
    if (serverSolutionsReadyRef.current && !hasServerSubmissionSolution(rawWord)) return "INVALIDE";
    if (!serverSolutionsReadyRef.current && dictionary && !hasClientDictionaryWord(rawWord)) {
      return "INVALIDE";
    }
    if (!serverSolutionsReadyRef.current && !dictionary) return "INVALIDE";
    return "Mot absent de la grille";
  }

  function resolveSubmissionCandidatesFromPath(path, preferredDisplay = "") {
    if (!Array.isArray(path) || path.length === 0) return null;
    const preferredRaw = normalizeWord(preferredDisplay || "");
    const serverSolutionsReady = !!serverSolutionsReadyRef.current;
    const serverSolutions = solutionsRef.current instanceof Map ? solutionsRef.current : new Map();
    const candidates = buildPathWordCandidates(path)
      .filter((candidate) => candidate?.raw)
      .map((candidate) => ({
        ...candidate,
        scored: (() => {
          const hasServerSolution = serverSolutions.has(candidate.raw);
          if (serverSolutionsReady && !hasServerSolution) return null;
          if (!serverSolutionsReady && !hasClientDictionaryWord(candidate.raw)) return null;
          const scored = scoreWordOnGridWithPath(candidate.raw, board, path, specialScoreConfig);
          const serverMeta = hasServerSolution ? serverSolutions.get(candidate.raw) : null;
          if (!scored) return null;
          if (serverMeta && Number.isFinite(serverMeta.pts)) {
            const rareBonusAllowed = isRareBonusEnabledForSpecial(specialRound);
            return {
              ...scored,
              tracedPathPts: scored.pts,
              pts: serverMeta.pts,
              usedFakeTwins: !!scored.usedFakeTwins || !!serverMeta.usedFakeTwins,
              fakeTwinsCompletionWord: !!serverMeta.fakeTwinsCompletionWord,
              fakeTwinsBonusOnly: !!serverMeta.fakeTwinsBonusOnly,
              rareBonusWord: rareBonusAllowed && !!serverMeta.rareBonusWord,
              rareBonusPoints: rareBonusAllowed ? Number(serverMeta.rareBonusPoints) || 0 : 0,
              rarityBucket: rareBonusAllowed ? String(serverMeta.rarityBucket || "") : "",
              cultureThemeWord: !!serverMeta.cultureThemeWord || isCurrentCultureThemeWord(candidate.raw),
            };
          }
          return { ...scored, cultureThemeWord: isCurrentCultureThemeWord(candidate.raw) };
        })(),
      }))
      .filter((candidate) => candidate?.scored);
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
      const aPreferred = a.raw === preferredRaw ? 1 : 0;
      const bPreferred = b.raw === preferredRaw ? 1 : 0;
      if (aPreferred !== bPreferred) return bPreferred - aPreferred;
      const aPrimary = a.usedFakeTwins ? 0 : 1;
      const bPrimary = b.usedFakeTwins ? 0 : 1;
      if (aPrimary !== bPrimary) return bPrimary - aPrimary;
      const ptsDiff = (Number(b?.scored?.pts) || 0) - (Number(a?.scored?.pts) || 0);
      if (ptsDiff !== 0) return ptsDiff;
      return String(a.raw || "").localeCompare(String(b.raw || ""), "fr", {
        sensitivity: "base",
      });
    });
    return candidates;
  }

  function resolveSubmissionCandidateFromPath(path, preferredDisplay = "") {
    return resolveSubmissionCandidatesFromPath(path, preferredDisplay)?.[0] || null;
  }

  function getDailyActiveSlotIndex(slots, preferredIndex = 0) {
    const list = Array.isArray(slots) ? slots : [];
    const safePreferred = clampValue(
      Number.isFinite(preferredIndex) ? preferredIndex : 0,
      0,
      Math.max(0, DAILY_SPECIAL_WORD_TARGET - 1)
    );
    if (list[safePreferred] && !list[safePreferred].word) {
      return safePreferred;
    }
    const firstEmpty = list.findIndex((slot) => !String(slot?.word || "").trim());
    return firstEmpty >= 0 ? firstEmpty : safePreferred;
  }

  function markDailySlotInvalid(slotIndex, message = "INVALIDE") {
    setDailyInvalidSlot(slotIndex);
    setDailyInvalidPulseKey((prev) => prev + 1);
    playOneShotAudio(SFX_KEYS.invalidWord, {
      cooldownKey: "dailyInvalid",
      eqKey: "invalidWord",
    });
    setStatusMessageWithHold(message, 900);
    clearSelection();
  }

  function syncLiveSpecial3WordsState(nextSlots = dailyWordSlots, nextPlacements = dailySpecialPlacements) {
    if (!isLiveSpecial3WordsMode || !socket.connected || !roundIdRef.current) return;
    const payload = {
      roundId: roundIdRef.current,
      wordSlots: (Array.isArray(nextSlots) ? nextSlots : []).map((slot, idx) => ({
        id: Number.isFinite(slot?.id) ? slot.id : idx,
        word: String(slot?.word || "").trim(),
        display: String(slot?.display || slot?.word || "").trim(),
        path: Array.isArray(slot?.path) ? slot.path : [],
      })),
      specialPlacements: nextPlacements && typeof nextPlacements === "object" ? nextPlacements : {},
    };
    socket.emit("special3Words:update", payload, (res) => {
      if (!res || res.ok === false) return;
      if (Array.isArray(res.wordSlots)) {
        setDailyWordSlots((prev) => {
          const next = res.wordSlots.map((slot, idx) => ({
            id: Number.isFinite(slot?.id) ? slot.id : idx,
            word: String(slot?.word || "").trim(),
            display: String(slot?.display || slot?.word || "").trim(),
            path: Array.isArray(slot?.path) ? slot.path : [],
            pts: Number.isFinite(slot?.pts) ? slot.pts : null,
          }));
          return areStringArraysEqual(
            next.map((slot) => slot.word),
            (Array.isArray(prev) ? prev : []).map((slot) => String(slot?.word || "").trim())
          )
            ? prev
            : next;
        });
      }
      if (res.specialPlacements && typeof res.specialPlacements === "object") {
        setDailySpecialPlacements((prev) => {
          const next = res.specialPlacements;
          const prevKey = JSON.stringify(prev || {});
          const nextKey = JSON.stringify(next || {});
          return prevKey === nextKey ? prev : next;
        });
      }
    });
  }

  function submitDailySpecialWord() {
    const slots = Array.isArray(dailyWordSlots) ? dailyWordSlots : createDailyWordSlots();
    let targetSlot = getDailyActiveSlotIndex(slots, dailyActiveSlot);
    if (targetSlot < 0) targetSlot = 0;
    if (slots.every((slot) => String(slot?.word || "").trim())) {
      return error("3 mots déjà validés");
    }

    const display = currentTilesRef.current.join("");
    const raw = normalizeWord(display);
    if (
      raw &&
      keyboardRecallSubmittedWordRef.current &&
      !isMobileLayoutRef.current &&
      lastInputModeRef.current === "keyboard"
    ) {
      pushWordHistory(raw);
    }
    if (!raw || raw.length < 2) {
      markDailySlotInvalid(targetSlot, "Mot trop court");
      return;
    }
    if (!isKnownSubmissionWord(raw)) {
      markDailySlotInvalid(targetSlot, "INVALIDE");
      return;
    }
    const alreadyUsed = slots.some((slot, idx) => idx !== targetSlot && slot?.word === raw);
    if (alreadyUsed) {
      markDailySlotInvalid(targetSlot, "Déjà saisi");
      return;
    }
    const scoringBoard = applyDailySpecialPlacements(board, dailySpecialPlacements);
    let path;
    const touchContext =
      lastInputModeRef.current === "touch" ||
      (isTouchDeviceRef.current && lastInputModeRef.current !== "keyboard");
    const usesManualPath = touchContext || lastInputModeRef.current === "mouse";
    if (usesManualPath) {
      path = Array.isArray(highlightPathRef.current) ? highlightPathRef.current : [];
      if (!path || path.length === 0) {
        markDailySlotInvalid(targetSlot, "Mot absent de la grille");
        return;
      }
    } else {
      path = findBestPathForWord(scoringBoard, raw, specialScoreConfig);
      if (!path || path.length === 0) {
        markDailySlotInvalid(targetSlot, "Mot absent de la grille");
        return;
      }
      setHighlightPath(path);
    }
    const normalizedPath = path
      .map((idx) => Number(idx))
      .filter((idx) => Number.isInteger(idx) && idx >= 0);
    if (!normalizedPath.length || normalizedPath.length !== path.length) {
      markDailySlotInvalid(targetSlot, "Chemin invalide");
      return;
    }
    const blockedReason = getDailySpecialWordBlockedReason(
      raw,
      normalizedPath,
      slots,
      targetSlot
    );
    if (blockedReason) {
      markDailySlotInvalid(targetSlot, blockedReason);
      return;
    }

    const scored = scoreWordOnGridWithPath(raw, scoringBoard, normalizedPath, specialScoreConfig);
    if (!scored) {
      markDailySlotInvalid(targetSlot, "Mot absent de la grille");
      return;
    }
    const pts = scored.pts || 0;
    const wordLen = normalizeWord(display || raw || "").length || 0;
    const special3MaxPossibleLen =
      Number.isFinite(roundStats?.maxLen) && roundStats.maxLen > 0
        ? Number(roundStats.maxLen)
        : bestGridMaxLenRef.current || 0;
    const isSpecial3LenGobbleNow =
      special3MaxPossibleLen > 0 && wordLen > 0 && wordLen === special3MaxPossibleLen;
    const nextSlots = slots.map((slot) => ({ ...slot }));
    if (!nextSlots[targetSlot]) {
      nextSlots[targetSlot] = { id: targetSlot, word: "", display: "", path: [] };
    }
    nextSlots[targetSlot] = {
      ...nextSlots[targetSlot],
      word: raw,
      display: (display || raw).toUpperCase(),
      path: normalizedPath,
    };
    const nextSlot = getDailyActiveSlotIndex(nextSlots, targetSlot + 1);
    setDailyWordSlots(nextSlots);
    setDailyActiveSlot(nextSlot);
    setDailyInvalidSlot((prev) => (prev === targetSlot ? null : prev));
    if (isLiveSpecial3WordsMode) {
      syncLiveSpecial3WordsState(nextSlots, dailySpecialPlacements);
    }
    playScoreSound(pts);
    if (isSpecial3LenGobbleNow) {
      playGobbleVoice();
      triggerPraiseFlash("GOBBLE !", {
        kind: "gobble",
        shakeGrid: true,
      });
      triggerConfettiBurst("gobble");
    }
    setStatusMessageWithHold(`+${pts} pts`, 700);
    clearSelection();
  }

  function queueLiveSubmissionCandidates(playableCandidates, fallbackPath, { flush = true } = {}) {
    const isTargetRoundNow =
      specialRound?.type === "target_long" || specialRound?.type === "target_score";
    const rareBonusAllowedNow = isRareBonusEnabledForSpecial(specialRound);
    const canOptimisticallyApply = !isTargetRoundNow;

    playableCandidates.forEach((candidate) => {
      const candidateScored = candidate.scored;
      const candidatePath =
        Array.isArray(candidateScored?.path) && candidateScored.path.length > 0
          ? candidateScored.path
          : fallbackPath;
      const optimisticPts = isTargetRoundNow
        ? 0
        : specialRound?.type === "speed" && Number.isFinite(specialRound?.fixedWordScore)
        ? specialRound.fixedWordScore
        : candidateScored.pts;
      const scoreFlightPoints = resolveScoreFlightPoints({
        awardedPoints: optimisticPts,
        candidatePoints: candidate?.scoreFlightPoints,
        specialRound,
        speedFallback: SPECIAL_TUTORIAL_SPEED_SCORE_FALLBACK,
      });
      enqueuePendingWord(candidate.raw, {
        display: candidate.display,
        path: candidatePath,
        roundId: roundIdRef.current,
        optimisticPts,
        usedFakeTwins: !!candidateScored?.usedFakeTwins,
        fakeTwinsCompletionWord: !!candidateScored?.fakeTwinsCompletionWord,
        fakeTwinsBonusOnly: !!candidateScored?.fakeTwinsBonusOnly,
        rareBonusWord: rareBonusAllowedNow && !!candidateScored?.rareBonusWord,
        rareBonusPoints: rareBonusAllowedNow ? Number(candidateScored?.rareBonusPoints) || 0 : 0,
        rarityBucket: rareBonusAllowedNow ? String(candidateScored?.rarityBucket || "") : "",
        traceStartedAt: getSubmissionTraceStartedAt(),
        optimisticApplied: canOptimisticallyApply,
      });
      if (!canOptimisticallyApply) return;
      applyLocalWordScoring({
        raw: candidate.raw,
        display: candidate.display,
        path: candidatePath,
        usedFakeTwins: !!candidateScored?.usedFakeTwins,
        fakeTwinsCompletionWord: !!candidateScored?.fakeTwinsCompletionWord,
        fakeTwinsBonusOnly: !!candidateScored?.fakeTwinsBonusOnly,
        rareBonusWord: rareBonusAllowedNow && !!candidateScored?.rareBonusWord,
        rareBonusPoints: rareBonusAllowedNow ? Number(candidateScored?.rareBonusPoints) || 0 : 0,
        rarityBucket: rareBonusAllowedNow ? String(candidateScored?.rarityBucket || "") : "",
        ptsOverride: optimisticPts,
        scoreFlightPoints,
      });
    });

    if (flush && !isMobileLayoutRef.current) {
      scheduleBatchFlush({ immediate: true });
    }
  }

  function submit()  {
  if (inputLockedRef.current) return;
  if (
    !isDailyPlayRef.current &&
    appViewRef.current !== "live" &&
    !standaloneTrainingSessionRef.current
  ) return;
  if (typeof window !== "undefined") {
    window.scrollTo(0, 0);
  }

  if (isSpecial3WordsMode) {
    submitDailySpecialWord();
    return;
  }

  if (foundTargetThisRound) {
    return error("Tu as déjà trouvé !");
  }
    
    const display = currentTilesRef.current.join("");
    const preferredRaw = normalizeWord(display);
    if (
      preferredRaw &&
      keyboardRecallSubmittedWordRef.current &&
      !isMobileLayoutRef.current &&
      lastInputModeRef.current === "keyboard"
    ) {
      pushWordHistory(preferredRaw);
    }
    const minimumWordLength =
      Number.isFinite(specialScoreConfig?.minWordLength) && specialScoreConfig.minWordLength > 0
        ? Math.trunc(specialScoreConfig.minWordLength)
        : 2;

    if (!preferredRaw || preferredRaw.length < minimumWordLength) {
      return error(
        minimumWordLength > 2
          ? `Mot trop court (${minimumWordLength} lettres min)`
          : "Mot trop court"
      );
    }
    let path;
    const touchContext =
      lastInputModeRef.current === "touch" ||
      (isTouchDeviceRef.current && lastInputModeRef.current !== "keyboard");
    const usesManualPath = touchContext || lastInputModeRef.current === "mouse";
    const liveHighlightPath = Array.isArray(highlightPathRef.current)
      ? highlightPathRef.current
      : [];
    const liveScored =
      liveHighlightPath.length > 0
        ? scoreWordOnGridWithPath(preferredRaw, board, liveHighlightPath, specialScoreConfig)
        : null;

    if (usesManualPath) {
      path =
        Array.isArray(liveScored?.path) && liveScored.path.length > 0
          ? liveScored.path
          : liveHighlightPath;
      if (!path || path.length === 0) return error(getMissingSubmissionPathMessage(preferredRaw));
    } else {
      path =
        Array.isArray(liveScored?.path) && liveScored.path.length > 0
          ? liveScored.path
          : findBestPathForWord(board, preferredRaw, specialScoreConfig);
      if (!path) return error(getMissingSubmissionPathMessage(preferredRaw));
      highlightPathRef.current = path;
      setHighlightPath(path);
    }

    if (specialRound?.type === OCID_TYPE) {
      const scored = scoreWordOnGridWithPath(preferredRaw, board, path, null);
      if (!scored?.path) return error("Mot absent de la grille");
      const displayLabel = String(display || preferredRaw || "").toUpperCase();
      const proposalPath = Array.isArray(scored.path) ? scored.path : path;
      ocidLatestProposalRef.current = {
        roundId,
        word: displayLabel,
        path: proposalPath,
      };
      setOcidProposal(displayLabel);
      setOcidProposalPath(proposalPath);
      setOcidProposalSubmitted("");
      setOcidStatusMessage("Mot prêt à envoyer.");
      if (roundId && socket.connected && isLoggedIn) {
        socket.emit(
          "ocid:propose",
          { roundId, word: displayLabel, path: proposalPath },
          (res) => {
            if (res?.ok) {
              setOcidProposalSubmitted(String(res?.proposal || displayLabel).trim());
              setOcidStatusMessage("Proposition retenue.");
              return;
            }
            setOcidProposalSubmitted("");
            setOcidStatusMessage(
              res?.error === "proposal_closed"
                ? "Les propositions sont fermées."
                : res?.error === "not_traceable"
                ? "Ce mot n'est pas traçable sur la grille."
                : "Proposition refusée."
            );
          }
        );
      }
      clearSelection();
      return;
    }

    const resolvedCandidatesForPath = resolveSubmissionCandidatesFromPath(path, display) || [];
    const standaloneTargetWord = normalizeWord(
      standaloneTrainingSessionRef.current?.targetWord || ""
    );
    const resolvedCandidates =
      standaloneTargetWord && isTargetSubmissionRound()
        ? resolvedCandidatesForPath.filter(
            (candidate) => normalizeWord(candidate?.raw) === standaloneTargetWord
          )
        : resolvedCandidatesForPath;
    const resolvedCandidate = resolvedCandidates[0] || null;
    if (!resolvedCandidate) {
      const serverSolutionsReady = !!serverSolutionsReadyRef.current;
      const knownByServer =
        solutionsRef.current instanceof Map && solutionsRef.current.has(preferredRaw);
      if (isTargetSubmissionRound()) {
        return error(getTargetSubmissionErrorMessage(preferredRaw));
      }
      if (serverSolutionsReady && !knownByServer) return error("INVALIDE");
      if (!serverSolutionsReady && dictionary && !hasClientDictionaryWord(preferredRaw)) {
        return error("INVALIDE");
      }
      if (!serverSolutionsReady && !dictionary) return error("INVALIDE");
      return error("Mot absent de la grille");
    }
    const raw = resolvedCandidate.raw;
    if (!usesManualPath) {
      const bestResolvedPath = findBestPathForWord(board, raw, specialScoreConfig);
      if (Array.isArray(bestResolvedPath) && bestResolvedPath.length > 0) {
        path = bestResolvedPath;
        highlightPathRef.current = bestResolvedPath;
        setHighlightPath(bestResolvedPath);
      }
    }
    const scored =
      usesManualPath &&
      resolvedCandidate.scored &&
      Array.isArray(resolvedCandidate.scored.path) &&
      resolvedCandidate.scored.path.length > 0
        ? resolvedCandidate.scored
        : Array.isArray(path) && path.length > 0
        ? scoreWordOnGridWithPath(raw, board, path, specialScoreConfig)
        : null;
    if (!scored) {
      return error(isTargetSubmissionRound() ? getTargetSubmissionErrorMessage(raw) : "Mot absent de la grille");
    }
    path = Array.isArray(scored.path) && scored.path.length > 0 ? scored.path : path;
    const resolvedDisplay = String(
      resolvedCandidate.display || display || raw || ""
    ).toUpperCase();

    const candidatesToSubmit =
      specialScoreConfig?.type === FAKE_TWINS_TYPE ? resolvedCandidates : [resolvedCandidate];
    const playableCandidates = candidatesToSubmit
      .map((candidate) => {
        const candidateRaw = candidate?.raw;
        if (!candidateRaw) return null;
        const candidateScored =
          candidate?.scored &&
          Array.isArray(candidate.scored.path) &&
          candidate.scored.path.length > 0
            ? candidate.scored
            : scoreWordOnGridWithPath(candidateRaw, board, path, specialScoreConfig);
        if (!candidateScored) return null;
        return {
          ...candidate,
          scored: candidateScored,
          scoreFlightPoints:
            usesManualPath && Number.isFinite(candidateScored.tracedPathPts)
              ? Number(candidateScored.tracedPathPts)
              : Number(candidateScored.pts),
          display: String(candidate.display || candidateRaw || "").toUpperCase(),
        };
      })
      .filter((candidate) => {
        const candidateRaw = candidate?.raw;
        if (!candidateRaw) return false;
        if (acceptedRef.current.includes(candidateRaw)) return false;
        if (pendingWordsRef.current.has(candidateRaw)) return false;
        if (submissionStatusRef.current.get(candidateRaw)?.status === "rejected") return false;
        return true;
      });

    if (!playableCandidates.length && acceptedRef.current.includes(raw)) return error("Déjà trouvé");
    if (!playableCandidates.length && pendingWordsRef.current.has(raw)) return error("Déjà envoyé");
    if (!playableCandidates.length && submissionStatusRef.current.get(raw)?.status === "rejected") {
      return error("Déjà tenté");
    }
    if (!playableCandidates.length) return error("Déjà trouvé");

    // Mode en ligne : envoi optimiste + batch une fois la session rattachee.
    if (roundId && socket.connected && isLoggedIn && liveSessionReadyRef.current) {
      queueLiveSubmissionCandidates(playableCandidates, path, { flush: true });
      return;
    }

    if (
      roundId &&
      (!socket.connected || !isLoggedIn || !liveSessionReadyRef.current)
    ) {
      queueLiveSubmissionCandidates(playableCandidates, path, { flush: false });
      handleForeground("submit_disconnected");
      scheduleForegroundRetry("submit_retry", 1200);
      setStatusMessageWithHold("Mot conservé hors ligne", 1200);
      return;
    }

    // Mode solo local : on garde le scoring existant
    const rareBonusAllowedNow = isRareBonusEnabledForSpecial(specialRound);
    playableCandidates.forEach((candidate) => {
      applyLocalWordScoring({
        raw: candidate.raw,
        display: candidate.display,
        path: candidate.scored.path,
        usedFakeTwins: !!candidate.scored?.usedFakeTwins,
        fakeTwinsCompletionWord: !!candidate.scored?.fakeTwinsCompletionWord,
        fakeTwinsBonusOnly: !!candidate.scored?.fakeTwinsBonusOnly,
        rareBonusWord: rareBonusAllowedNow && !!candidate.scored?.rareBonusWord,
        rareBonusPoints: rareBonusAllowedNow ? Number(candidate.scored?.rareBonusPoints) || 0 : 0,
        rarityBucket: rareBonusAllowedNow ? String(candidate.scored?.rarityBucket || "") : "",
        scoreFlightPoints: candidate.scoreFlightPoints,
      });
    });
  }

  function tryAutoSubmitCurrentWordAtRoundEnd() {
    if (isSpecial3WordsMode) return false;
    if (specialRound?.type === OCID_TYPE) return false;
    if (foundTargetThisRound) return false;

    const display = currentTilesRef.current.join("");
    const preferredRaw = normalizeWord(display);
    const minimumWordLength =
      Number.isFinite(specialScoreConfig?.minWordLength) && specialScoreConfig.minWordLength > 0
        ? Math.trunc(specialScoreConfig.minWordLength)
        : 2;
    if (!preferredRaw || preferredRaw.length < minimumWordLength) return false;

    const liveHighlightPath = Array.isArray(highlightPathRef.current)
      ? highlightPathRef.current
      : [];
    const inputMode = lastInputModeRef.current;
    const touchContext =
      inputMode === "touch" || (isTouchDeviceRef.current && inputMode !== "keyboard");
    const usesManualPath = touchContext || inputMode === "mouse";
    let path = null;
    if (usesManualPath) {
      if (!liveHighlightPath.length) return false;
      const liveScored = scoreWordOnGridWithPath(
        preferredRaw,
        board,
        liveHighlightPath,
        specialScoreConfig
      );
      path = Array.isArray(liveScored?.path) && liveScored.path.length > 0 ? liveScored.path : null;
    } else {
      path = findBestPathForWord(board, preferredRaw, specialScoreConfig);
      if ((!Array.isArray(path) || path.length === 0) && liveHighlightPath.length > 0) {
        const liveScored = scoreWordOnGridWithPath(
          preferredRaw,
          board,
          liveHighlightPath,
          specialScoreConfig
        );
        path = Array.isArray(liveScored?.path) && liveScored.path.length > 0 ? liveScored.path : null;
      }
    }
    if (!Array.isArray(path) || path.length === 0) return false;
    const resolvedCandidatesForPath = resolveSubmissionCandidatesFromPath(path, display) || [];
    const standaloneTargetWord = normalizeWord(
      standaloneTrainingSessionRef.current?.targetWord || ""
    );
    const resolvedCandidates =
      standaloneTargetWord && isTargetSubmissionRound()
        ? resolvedCandidatesForPath.filter(
            (candidate) => normalizeWord(candidate?.raw) === standaloneTargetWord
          )
        : resolvedCandidatesForPath;
    const resolvedCandidate = resolvedCandidates[0] || null;
    if (!resolvedCandidate) return false;
    const raw = resolvedCandidate.raw;
    if (!usesManualPath) {
      const bestResolvedPath = findBestPathForWord(board, raw, specialScoreConfig);
      if (Array.isArray(bestResolvedPath) && bestResolvedPath.length > 0) {
        path = bestResolvedPath;
      }
    }
    const scored =
      usesManualPath &&
      resolvedCandidate.scored &&
      Array.isArray(resolvedCandidate.scored.path) &&
      resolvedCandidate.scored.path.length > 0
        ? resolvedCandidate.scored
        : Array.isArray(path) && path.length > 0
        ? scoreWordOnGridWithPath(raw, board, path, specialScoreConfig)
        : null;
    if (!scored) return false;
    const candidatesToSubmit =
      specialScoreConfig?.type === FAKE_TWINS_TYPE ? resolvedCandidates : [resolvedCandidate];
    const playableCandidates = candidatesToSubmit
      .map((candidate) => {
        const candidateRaw = candidate?.raw;
        if (!candidateRaw) return null;
        const candidateScored =
          candidate?.scored &&
          Array.isArray(candidate.scored.path) &&
          candidate.scored.path.length > 0
            ? candidate.scored
            : scoreWordOnGridWithPath(candidateRaw, board, path, specialScoreConfig);
        if (!candidateScored) return null;
        return {
          ...candidate,
          scored: candidateScored,
          scoreFlightPoints:
            usesManualPath && Number.isFinite(candidateScored.tracedPathPts)
              ? Number(candidateScored.tracedPathPts)
              : Number(candidateScored.pts),
          display: String(candidate.display || candidateRaw || "").toUpperCase(),
        };
      })
      .filter((candidate) => {
        const candidateRaw = candidate?.raw;
        if (!candidateRaw) return false;
        if (acceptedRef.current.includes(candidateRaw)) return false;
        if (pendingWordsRef.current.has(candidateRaw)) return false;
        if (submissionStatusRef.current.get(candidateRaw)?.status === "rejected") return false;
        return true;
      });
    if (!playableCandidates.length) return false;
    path = Array.isArray(scored.path) && scored.path.length > 0 ? scored.path : path;
    highlightPathRef.current = path;
    setHighlightPath(path);

    draggingRef.current = false;
    dragGridMetricsRef.current = null;
    resetDragMovePipeline();

    const rareBonusAllowedNow = isRareBonusEnabledForSpecial(specialRound);
    if (roundId && socket.connected && isLoggedIn && liveSessionReadyRef.current) {
      queueLiveSubmissionCandidates(playableCandidates, path, { flush: true });
      return true;
    }

    if (
      roundId &&
      (!socket.connected || !isLoggedIn || !liveSessionReadyRef.current)
    ) {
      queueLiveSubmissionCandidates(playableCandidates, path, { flush: false });
      handleForeground("round_end_submit_disconnected");
      return true;
    }

    playableCandidates.forEach((candidate) => {
      applyLocalWordScoring({
        raw: candidate.raw,
        display: candidate.display,
        path: candidate.scored.path,
        usedFakeTwins: !!candidate.scored?.usedFakeTwins,
        fakeTwinsCompletionWord: !!candidate.scored?.fakeTwinsCompletionWord,
        fakeTwinsBonusOnly: !!candidate.scored?.fakeTwinsBonusOnly,
        rareBonusWord: rareBonusAllowedNow && !!candidate.scored?.rareBonusWord,
        rareBonusPoints: rareBonusAllowedNow ? Number(candidate.scored?.rareBonusPoints) || 0 : 0,
        rarityBucket: rareBonusAllowedNow ? String(candidate.scored?.rarityBucket || "") : "",
        scoreFlightPoints: candidate.scoreFlightPoints,
      });
    });
    return true;
  }

  return {
    getLivePreviewLabelForCell,
    requeueInFlightSubmissions,
    restorePendingSubmissionEntries,
    scheduleBatchFlush,
    submit,
    syncLiveSpecial3WordsState,
    tryAutoSubmitCurrentWordAtRoundEnd,
  };
}
