import React from "react";
import useRoundLifecycle from "../../hooks/useRoundLifecycle.js";
import {
  computeScore,
  findBestPathForWord,
  normalizeWord,
} from "../../components/gameLogic";
import {
  createDailySpecialPlacements,
  createDailyWordSlots,
} from "../../components/daily/dailySpecialModel.js";
import { DAILY_SPECIAL_MODE } from "../../components/daily/dailyModes.js";
import {
  MASSIVE_BOGGLE_TYPE,
  isRareBonusEnabledForSpecial,
} from "../../game/specialRoundTypes.js";
import { hydrateServerSolutionsPayload } from "../../utils/roundSolutions";

function createRef(current) {
  return { current };
}

function createRoundSessionRefs() {
  return {
    blackHoleOverlayRef: createRef(null),
    gameplaySessionTokenRef: createRef(0),
    implodeFallbackRef: createRef(false),
    implodePhaseTimerRef: createRef(null),
    implodeRoundRef: createRef(null),
    implodeTimerRef: createRef(null),
    outroInFlightRef: createRef(false),
    outroRoundRef: createRef(null),
    pendingBreakStartRef: createRef(null),
    pendingRoundEndRef: createRef(null),
    playOutroThenResultsRef: createRef(null),
    processBreakStartedRef: createRef(null),
    processRoundEndedRef: createRef(null),
    roundHandlersRef: createRef({
      onBreakStarted: null,
      onCultureThemeChallenge: null,
      onRoundEnded: null,
      onRoundPreparing: null,
      onRoundStarted: null,
      onSpecialHint: null,
      onSpecialSolved: null,
      onTournamentLobbyUpdate: null,
    }),
    startGameFromServerRef: createRef(null),
    tileIntroTimerRef: createRef(null),
  };
}

export default function useRoundSessionController() {
  const configRef = React.useRef({});
  const refsContainer = React.useRef(null);
  if (!refsContainer.current) {
    refsContainer.current = createRoundSessionRefs();
  }
  const refs = refsContainer.current;

  const configure = React.useCallback((nextConfig = {}) => {
    configRef.current = nextConfig;
  }, []);

  const invalidateGameplaySession = React.useCallback(() => {
    const {
      blackHoleAuxStopRef,
      blackHoleChebHandleRef,
      blackHoleClavierFadeRef,
      blackHoleClavierHandleRef,
      blackHoleHandleRef,
      blackHoleSourisLoopRef,
      blackHoleSyncTokenRef,
      gridRef,
    } = configRef.current;
    refs.gameplaySessionTokenRef.current += 1;
    refs.pendingRoundEndRef.current = null;
    refs.pendingBreakStartRef.current = null;
    refs.implodeFallbackRef.current = false;
    refs.outroInFlightRef.current = false;
    refs.outroRoundRef.current = null;
    if (blackHoleSyncTokenRef) blackHoleSyncTokenRef.current += 1;
    if (blackHoleSourisLoopRef?.current?.intervalId) {
      clearInterval(blackHoleSourisLoopRef.current.intervalId);
      blackHoleSourisLoopRef.current.intervalId = null;
    }
    if (blackHoleSourisLoopRef?.current?.stopTimer) {
      clearTimeout(blackHoleSourisLoopRef.current.stopTimer);
      blackHoleSourisLoopRef.current.stopTimer = null;
    }
    if (blackHoleClavierFadeRef?.current) {
      clearTimeout(blackHoleClavierFadeRef.current);
      blackHoleClavierFadeRef.current = null;
    }
    if (blackHoleAuxStopRef?.current) {
      clearTimeout(blackHoleAuxStopRef.current);
      blackHoleAuxStopRef.current = null;
    }
    blackHoleHandleRef?.current?.stop?.();
    blackHoleChebHandleRef?.current?.stop?.();
    blackHoleClavierHandleRef?.current?.stop?.();
    if (blackHoleHandleRef) blackHoleHandleRef.current = null;
    if (blackHoleChebHandleRef) blackHoleChebHandleRef.current = null;
    if (blackHoleClavierHandleRef) blackHoleClavierHandleRef.current = null;
    refs.blackHoleOverlayRef.current?.remove?.();
    refs.blackHoleOverlayRef.current = null;
    const gridEl = gridRef?.current;
    if (gridEl?.style) {
      gridEl.style.opacity = "";
      gridEl.style.transition = "";
    }
  }, [refs]);

  const disposeGameplayRuntimeResources = React.useCallback(() => {
    const {
      cancelAllWordsCompute,
      clearQueuedRankingUpdate,
      clearResultsSlideTimers,
      clearSelection,
      clearWordListFlipArtifacts,
      clockFeature,
      resetSubmissionQueue,
      roundStartPendingRef,
      roundStartRetryRef,
      stopImplodePhase,
      stopMobileRoundIntro,
      stopRoundEndTickSound,
      stopRoundStartSound,
      stopVocabOverlayAnimation,
      vocabBaselineRoundRef,
      vocabResultsPendingRef,
      vocabWeeklyBaselineRoundRef,
    } = configRef.current;
    invalidateGameplaySession();
    clearQueuedRankingUpdate?.();
    clockFeature?.stop?.({ preserveRemaining: true });
    stopRoundStartSound?.({ fadeMs: 80 });
    stopImplodePhase?.();
    stopMobileRoundIntro?.({ unlockInput: false });
    clearResultsSlideTimers?.();
    clearWordListFlipArtifacts?.();
    stopVocabOverlayAnimation?.();
    stopRoundEndTickSound?.({ fadeMs: 0 });
    cancelAllWordsCompute?.();
    resetSubmissionQueue?.({ clearRecovery: true });
    clearSelection?.();
    if (roundStartPendingRef) roundStartPendingRef.current = null;
    if (roundStartRetryRef) roundStartRetryRef.current = false;
    if (vocabBaselineRoundRef) vocabBaselineRoundRef.current = null;
    if (vocabWeeklyBaselineRoundRef) vocabWeeklyBaselineRoundRef.current = null;
    if (vocabResultsPendingRef) vocabResultsPendingRef.current = null;
  }, [invalidateGameplaySession]);

  const startGameFromServer = React.useCallback(
    (
      serverGrid,
      newRoundId,
      durationMs,
      endsAt,
      sourceRoomId = null,
      incomingGridSize = null,
      specialInfo = null,
      gridQuality = null,
      nextSpecial = null,
      incomingTargetHintScheduleMs = [],
      roundLifecycle = null
    ) => {
      const {
        applicationKernel,
        bestGridMaxLenRef,
        bestGridMaxRef,
        bestWordAnnounceRef,
        chatInputRef,
        clearAcceptedRuntimeCaches,
        clearQueuedRankingUpdate,
        clearStatusMessage,
        clearToasts,
        clockFeature,
        commitTraceSelection,
        currentRoomId,
        DEFAULT_DURATION,
        feedFeature,
        getNowServerMs,
        gridSize,
        isMobileLayoutRef,
        lastRoundWindowRef,
        markEntriesWithCultureTheme,
        markSolutionMapWithCultureTheme,
        mobileRoundIntroSuppressRoundStartRef,
        progressFeature,
        ROOM_OPTIONS,
        rosterFeature,
        roomId,
        roundIntroServerWindowRef,
        roundIntroStartedForRoundRef,
        serverAllWordsRef,
        serverSolutionsReadyRef,
        setActiveArea,
        setAnalysis,
        setAnnouncements,
        setCultureThemeChallengeRuntime,
        setFoundTargetThisRound,
        setFoundTargetWord,
        setHighlightPlayers,
        setMobileRoundIntroHideTiles,
        setScoreFlights,
        setSpecialHint,
        setSpecialSolvedOverlay,
        setTargetHintScheduleMs,
        solutionsRef,
        resetSubmissionQueue,
        inputLockedRef,
      } = configRef.current;
      void nextSpecial;
      invalidateGameplaySession();
      const serverSolutions = hydrateServerSolutionsPayload(roundLifecycle?.solutions, {
        disableRareBonus: !isRareBonusEnabledForSpecial(specialInfo),
      });
      const incomingCultureThemeChallenge = setCultureThemeChallengeRuntime(
        roundLifecycle?.cultureThemeChallenge || null
      );
      markSolutionMapWithCultureTheme(serverSolutions.solved, incomingCultureThemeChallenge);
      serverSolutions.all = markEntriesWithCultureTheme(
        serverSolutions.all,
        incomingCultureThemeChallenge
      );
      const derivedSize =
        incomingGridSize ||
        Math.max(1, Math.round(Math.sqrt((serverGrid || []).length || gridSize * gridSize)));
      commitTraceSelection([], []);
      setAnalysis(null);
      setHighlightPlayers([]);
      setScoreFlights([]);
      clearToasts();
      solutionsRef.current = new Map();
      serverAllWordsRef.current = [];
      serverSolutionsReadyRef.current = false;
      bestGridMaxRef.current = 0;
      bestGridMaxLenRef.current = 0;
      serverSolutionsReadyRef.current = serverSolutions.ready;
      clearAcceptedRuntimeCaches();
      resetSubmissionQueue();
      progressFeature.reset();
      feedFeature.reset();
      rosterFeature.setProvisionalRanking([]);
      if (serverSolutions.ready) {
        solutionsRef.current = serverSolutions.solved;
        serverAllWordsRef.current = serverSolutions.all;
      }
      if (specialInfo?.type !== "target_long" && specialInfo?.type !== "target_score") {
        setSpecialHint(null);
      }
      setSpecialSolvedOverlay(null);
      setFoundTargetThisRound(false);
      setFoundTargetWord("");
      setTargetHintScheduleMs(
        Array.isArray(incomingTargetHintScheduleMs)
          ? incomingTargetHintScheduleMs.filter(
              (value) => Number.isFinite(value) && value >= 0
            )
          : []
      );
      if (false && specialInfo?.isSpecial) {
        setAnnouncements((prev) => [
          {
            id: Date.now() + Math.random(),
            ts: Date.now(),
            type: "special_start",
            text:
              specialInfo.type === "speed"
                ? `MANCHE SPéCIALE : ${specialInfo.label} - tous les mots valent ${specialInfo.fixedWordScore} pts`
                : `MANCHE SPéCIALE : ${specialInfo.label} - gros potentiel de points et de mots longs`,
          },
          ...prev,
        ]);
      }
      const solutionMaxPts =
        serverSolutions.ready && serverSolutions.all.length
          ? Math.max(...serverSolutions.all.map((entry) => Number(entry?.pts) || 0))
          : null;
      const solutionMaxLen =
        serverSolutions.ready && serverSolutions.all.length
          ? Math.max(
              ...serverSolutions.all.map(
                (entry) => normalizeWord(entry?.word).length || 0
              )
            )
          : null;
      const stats =
        gridQuality && typeof gridQuality === "object"
          ? {
              words: gridQuality.words ?? null,
              totalPts:
                gridQuality.possibleScore ??
                gridQuality.totalPts ??
                gridQuality.maxPts ??
                null,
              maxPts:
                Number.isFinite(solutionMaxPts) && solutionMaxPts > 0
                  ? solutionMaxPts
                  : gridQuality.maxPts ?? null,
              maxLen:
                Number.isFinite(solutionMaxLen) && solutionMaxLen > 0
                  ? solutionMaxLen
                  : gridQuality.maxLen ?? null,
              longWords: gridQuality.longWords ?? null,
              fakeTwinWords: gridQuality.fakeTwinWords ?? null,
            }
          : null;
      bestGridMaxRef.current = stats?.maxPts ?? 0;
      bestGridMaxLenRef.current = stats?.maxLen ?? 0;
      clearStatusMessage({ force: true });
      bestWordAnnounceRef.current = -1;
      clearQueuedRankingUpdate();
      const normalizedDurationMs = Number.isFinite(durationMs)
        ? Math.max(1, Math.round(durationMs))
        : null;
      const maxDuration = Number.isFinite(normalizedDurationMs)
        ? Math.max(1, Math.round(normalizedDurationMs / 1000))
        : ROOM_OPTIONS[sourceRoomId || currentRoomId || roomId]?.duration ??
          DEFAULT_DURATION;
      const effectiveEndsAt = Number.isFinite(endsAt)
        ? Number(endsAt)
        : Number.isFinite(normalizedDurationMs)
        ? getNowServerMs() + normalizedDurationMs
        : null;
      const initialTick = Number.isFinite(effectiveEndsAt)
        ? Math.max(0, Math.ceil((effectiveEndsAt - getNowServerMs()) / 1000))
        : maxDuration;
      const roundKey = newRoundId || null;
      const startsAtMs = Number.isFinite(roundLifecycle?.startsAt)
        ? Math.max(0, Number(roundLifecycle.startsAt))
        : Number.isFinite(effectiveEndsAt) && Number.isFinite(normalizedDurationMs)
        ? Math.max(0, effectiveEndsAt - normalizedDurationMs)
        : null;
      const introMs = Number.isFinite(roundLifecycle?.introMs)
        ? Math.max(0, Math.round(Number(roundLifecycle.introMs)))
        : 0;
      const roundStatus =
        typeof roundLifecycle?.status === "string" ? roundLifecycle.status : "running";
      roundIntroServerWindowRef.current = {
        roundId: roundKey,
        startsAt: startsAtMs,
        introMs,
        status: roundStatus,
      };
      const nowServerMs = getNowServerMs();
      const hasPendingIntro =
        roundStatus === "intro" &&
        Number.isFinite(startsAtMs) &&
        startsAtMs > nowServerMs + 80;
      mobileRoundIntroSuppressRoundStartRef.current = hasPendingIntro;
      inputLockedRef.current = hasPendingIntro;
      setMobileRoundIntroHideTiles(hasPendingIntro);
      if (!hasPendingIntro) {
        roundIntroStartedForRoundRef.current = roundKey;
      } else if (roundIntroStartedForRoundRef.current !== roundKey) {
        roundIntroStartedForRoundRef.current = null;
      }
      const roundEndAt = Number.isFinite(effectiveEndsAt) ? effectiveEndsAt : null;
      const roundStartAt =
        Number.isFinite(effectiveEndsAt) && Number.isFinite(normalizedDurationMs)
          ? effectiveEndsAt - normalizedDurationMs
          : null;
      lastRoundWindowRef.current = { startAt: roundStartAt, endAt: roundEndAt };
      // Une réhydratation de premier plan peut concerner exactement la même
      // manche. Elle peut corriger l'affichage, mais ne doit pas arrêter le
      // timer actif avant que le contrôleur React se recale sur la génération.
      clockFeature.primeRemaining(Math.min(maxDuration, initialTick));
      applicationKernel.commands.transition.apply({
        game: {
          allWords: [],
          board: serverGrid,
          ...(sourceRoomId
            ? { currentRoomId: sourceRoomId, roomId: sourceRoomId }
            : {}),
          gridSize: derivedSize,
          inputLocked: hasPendingIntro,
          phase: "playing",
          showAllWords: false,
        },
        realtime: {
          finalResults: [],
          roundId: newRoundId || null,
          roundStats: stats,
          serverEndsAt: Number.isFinite(effectiveEndsAt) ? effectiveEndsAt : null,
          serverRoundDurationMs: normalizedDurationMs,
          specialRound: specialInfo && specialInfo.isSpecial ? specialInfo : null,
        },
        session: {
          connectionError: "",
          serverStatus: "running",
        },
      });
      if (!isMobileLayoutRef.current) {
        const chatEl = chatInputRef.current;
        const chatHasFocus =
          chatEl && typeof document !== "undefined" && document.activeElement === chatEl;
        if (!chatHasFocus) {
          setActiveArea("game");
        }
      }
    },
    [invalidateGameplaySession]
  );

  const applyResumeSnapshot = React.useCallback((snapshot, hydrationMeta = {}) => {
    const {
      beginSubmissionRecovery,
      bestGridMaxLenRef,
      bestGridMaxRef,
      clearSubmissionRecovery,
      currentRoomIdRef,
      dailyAcceptedPathsRef,
      getGridSizeForRoom,
      inputLockedRef,
      intermissionFeature,
      ocidLatestProposalRef,
      reconcileSubmissionRecovery,
      resetSubmissionQueue,
      restorePendingSubmissionEntries,
      roundIdRef,
      setAccepted,
      setBoard,
      setBreakKind,
      setCurrentRoomId,
      setDailySpecialPlacements,
      setDailyWordSlots,
      setFinalResults,
      setFoundTargetThisRound,
      setFoundTargetWord,
      setGridSize,
      setInputLocked,
      setNextStartAt,
      setOcidProposal,
      setOcidProposalPath,
      setOcidProposalSubmitted,
      setOcidSelectedOptionId,
      setPhase,
      setProvisionalRanking,
      setRoomId,
      setRoundPreparing,
      setRoundStats,
      setScore,
      setServerStatus,
      setSpecialHint,
      setSpecialRound,
      setTournamentLobby,
      setUpcomingSpecial,
      skipVocabOverlayOnceRef,
      standaloneTrainingSessionRef,
      syncAcceptedRuntimeCaches,
      phaseRef,
    } = configRef.current;
    if (!snapshot || typeof snapshot !== "object") return;
    if (standaloneTrainingSessionRef.current) return;
    if (snapshot.roomId) {
      setCurrentRoomId(snapshot.roomId);
      setRoomId(snapshot.roomId);
    }
    const phase = snapshot.phase || "lobby";
    const currentRound = snapshot.currentRound || null;
    const breakState = snapshot.breakState || null;
    const lastRound = snapshot.lastRoundResults || null;
    const playerState = snapshot.player || null;
    const entryKind = String(hydrationMeta?.entryKind || "resume");
    const recoverPendingSubmissions = entryKind !== "join";
    setTournamentLobby(snapshot.tournamentLobby || null);
    const pendingSnapshot = beginSubmissionRecovery({
      enabled: recoverPendingSubmissions,
      roundId: roundIdRef.current,
    });

    if (phase === "preparing") {
      phaseRef.current = "lobby";
      setPhase("lobby");
      setServerStatus("waiting");
      setNextStartAt(null);
      setBreakKind(null);
      setFinalResults([]);
      setProvisionalRanking([]);
      if (snapshot.roundPreparing) {
        refs.roundHandlersRef.current.onRoundPreparing?.(snapshot.roundPreparing);
      } else {
        setRoundPreparing({
          roomId: snapshot.roomId || null,
          roundNumber: null,
          special: null,
          message: "La prochaine grille est en cours de préparation.",
          startedAt: snapshot.capturedAt || Date.now(),
        });
      }
      resetSubmissionQueue({ clearRecovery: true });
      return;
    }

    if (phase === "playing" && currentRound?.grid && Array.isArray(currentRound.grid)) {
      refs.roundHandlersRef.current.onRoundStarted?.(currentRound);
      if (playerState?.capabilities && typeof playerState.capabilities === "object") {
        const canTraceGrid =
          playerState.capabilities.canSubmit === true ||
          playerState.capabilities.canSyncSpecial3Words === true ||
          playerState.capabilities.canPropose === true;
        inputLockedRef.current = !canTraceGrid;
        setInputLocked(!canTraceGrid);
      }
      if (snapshot.specialHint && typeof snapshot.specialHint === "object") {
        const hintKind = snapshot.specialHint.kind || null;
        const allowCells = hintKind === "target_long" || hintKind === "target_score";
        setSpecialHint({
          kind: hintKind,
          pattern: snapshot.specialHint.pattern || "",
          length:
            typeof snapshot.specialHint.length === "number"
              ? snapshot.specialHint.length
              : currentRound.targetLength || null,
          cells:
            allowCells && Array.isArray(snapshot.specialHint.revealCells)
              ? snapshot.specialHint.revealCells.filter((index) => Number.isInteger(index))
              : [],
          wordIndices:
            allowCells && Array.isArray(snapshot.specialHint.revealWordIndices)
              ? snapshot.specialHint.revealWordIndices.filter(
                  (index) => Number.isInteger(index) && index >= 0
                )
              : [],
        });
      }
      if (playerState?.targetFound) {
        setFoundTargetThisRound(true);
        setFoundTargetWord(String(playerState.targetWord || ""));
      }
      if (playerState?.ocid && typeof playerState.ocid === "object") {
        const proposal = String(playerState.ocid.proposal || "");
        const proposalPath = Array.isArray(playerState.ocid.proposalPath)
          ? playerState.ocid.proposalPath
          : [];
        setOcidProposal(proposal);
        setOcidProposalPath(proposalPath);
        setOcidProposalSubmitted(proposal);
        setOcidSelectedOptionId(String(playerState.ocid.selectedOptionId || ""));
        ocidLatestProposalRef.current = {
          roundId: currentRound.roundId || null,
          word: proposal,
          path: proposalPath,
        };
      }
      if (currentRound?.special?.type === DAILY_SPECIAL_MODE || playerState?.special3Words) {
        setDailySpecialPlacements(
          playerState?.special3Words?.specialPlacements &&
            typeof playerState.special3Words.specialPlacements === "object"
            ? playerState.special3Words.specialPlacements
            : createDailySpecialPlacements()
        );
        setDailyWordSlots(
          Array.isArray(playerState?.special3Words?.wordSlots)
            ? playerState.special3Words.wordSlots.map((slot, idx) => ({
                id: Number.isFinite(slot?.id) ? slot.id : idx,
                word: String(slot?.word || "").trim(),
                display: String(slot?.display || slot?.word || "").trim(),
                path: Array.isArray(slot?.path) ? slot.path : [],
              }))
            : createDailyWordSlots()
        );
      }
      if (Array.isArray(snapshot.ranking)) {
        setProvisionalRanking(snapshot.ranking);
      }
      const serverWords = Array.isArray(playerState?.words)
        ? Array.from(new Set(playerState.words.map((word) => normalizeWord(word)).filter(Boolean)))
        : [];
      const pendingRecovery = reconcileSubmissionRecovery({
        serverWords,
        pendingSnapshot,
        activeRoundId: currentRound.roundId,
      });
      const words = pendingRecovery.acceptedWords;
      setAccepted(words);
      const scores = new Map();
      const scoreConfig =
        currentRound.special?.type === "bonus_letter" && currentRound.special?.bonusLetter
          ? {
              bonusLetter: currentRound.special.bonusLetter,
              bonusLetterScore: currentRound.special.bonusLetterScore ?? 20,
              disableBonuses: true,
            }
          : currentRound.special?.type === MASSIVE_BOGGLE_TYPE
          ? {
              classicBoggleScoring: true,
              minWordLength: currentRound.special.minWordLength || 3,
              disableBonuses: true,
            }
          : null;
      dailyAcceptedPathsRef.current = new Map();
      if (currentRound.grid && words.length) {
        words.forEach((word) => {
          const path = findBestPathForWord(currentRound.grid, word, scoreConfig);
          if (path) {
            scores.set(word, computeScore(word, path, currentRound.grid, scoreConfig));
            dailyAcceptedPathsRef.current.set(word, {
              word,
              path: Array.isArray(path) ? [...path] : [],
            });
          }
        });
      } else {
        dailyAcceptedPathsRef.current = new Map();
      }
      for (const entry of pendingRecovery.pendingEntries) {
        const word = entry.word;
        const meta = entry.meta || {};
        if (Number.isFinite(meta.optimisticPts)) {
          scores.set(word, Number(meta.optimisticPts));
        }
        if (Array.isArray(meta.path) && meta.path.length > 0) {
          dailyAcceptedPathsRef.current.set(word, {
            word,
            path: [...meta.path],
          });
        }
      }
      syncAcceptedRuntimeCaches(words, { scoreMap: scores });
      setScore((Number(playerState?.score) || 0) + pendingRecovery.optimisticScore);
      restorePendingSubmissionEntries(pendingRecovery.pendingEntries, currentRound.roundId);
      clearSubmissionRecovery();
      return;
    }

    if (phase === "lobby") {
      setPhase("lobby");
      setServerStatus("waiting");
      setNextStartAt(null);
      intermissionFeature.stop();
      setBreakKind(null);
      setFinalResults([]);
      setProvisionalRanking([]);
      setRoundPreparing(null);
      setUpcomingSpecial(null);
      resetSubmissionQueue({ clearRecovery: true });
      return;
    }

    if (phase === "results" && lastRound?.payload) {
      skipVocabOverlayOnceRef.current = true;
      refs.processRoundEndedRef.current?.(lastRound.payload);
      if (lastRound.round?.grid && Array.isArray(lastRound.round.grid)) {
        setBoard(lastRound.round.grid);
        setGridSize(lastRound.round.gridSize || getGridSizeForRoom(snapshot.roomId));
        setSpecialRound(
          lastRound.round.special && lastRound.round.special.isSpecial
            ? lastRound.round.special
            : null
        );
        if (lastRound.round.gridQuality) {
          const stats = {
            words: lastRound.round.gridQuality.words ?? null,
            totalPts:
              lastRound.round.gridQuality.possibleScore ??
              lastRound.round.gridQuality.totalPts ??
              lastRound.round.gridQuality.maxPts ??
              null,
            maxPts: lastRound.round.gridQuality.maxPts ?? null,
            maxLen: lastRound.round.gridQuality.maxLen ?? null,
            longWords: lastRound.round.gridQuality.longWords ?? null,
            fakeTwinWords: lastRound.round.gridQuality.fakeTwinWords ?? null,
          };
          setRoundStats(stats);
          bestGridMaxRef.current = stats?.maxPts ?? 0;
          bestGridMaxLenRef.current = stats?.maxLen ?? 0;
        }
      }
      if (breakState) {
        refs.roundHandlersRef.current.onBreakStarted?.(breakState);
      }
      const words = Array.isArray(playerState?.words)
        ? Array.from(new Set(playerState.words.map((word) => normalizeWord(word)).filter(Boolean)))
        : [];
      setAccepted(words);
      if (lastRound.round?.grid && Array.isArray(lastRound.round.grid) && words.length) {
        const scoreConfig =
          lastRound.round.special?.type === "bonus_letter" &&
          lastRound.round.special?.bonusLetter
            ? {
                bonusLetter: lastRound.round.special.bonusLetter,
                bonusLetterScore: lastRound.round.special.bonusLetterScore ?? 20,
                disableBonuses: true,
              }
            : lastRound.round.special?.type === MASSIVE_BOGGLE_TYPE
            ? {
                classicBoggleScoring: true,
                minWordLength: lastRound.round.special.minWordLength || 3,
                disableBonuses: true,
              }
            : null;
        const scores = new Map();
        dailyAcceptedPathsRef.current = new Map();
        words.forEach((word) => {
          const path = findBestPathForWord(lastRound.round.grid, word, scoreConfig);
          if (path) {
            scores.set(word, computeScore(word, path, lastRound.round.grid, scoreConfig));
            dailyAcceptedPathsRef.current.set(word, {
              word,
              path: Array.isArray(path) ? [...path] : [],
            });
          }
        });
        syncAcceptedRuntimeCaches(words, { scoreMap: scores });
      } else {
        syncAcceptedRuntimeCaches(words);
      }
      setScore(Number(playerState?.score) || 0);
      resetSubmissionQueue({ clearRecovery: true });
      return;
    }

    if (breakState) {
      refs.roundHandlersRef.current.onBreakStarted?.(breakState);
    }
    resetSubmissionQueue({ clearRecovery: true });
  }, [refs]);

  const hydrateLiveSnapshot = React.useCallback((snapshot, entryKind = "resume") => {
    const { currentRoomIdRef, liveRoundFeature } = configRef.current;
    if (snapshot?.roomId) {
      currentRoomIdRef.current = snapshot.roomId;
    }
    return liveRoundFeature.hydrateSnapshot(snapshot, { entryKind });
  }, []);

  refs.startGameFromServerRef.current = startGameFromServer;

  return React.useMemo(
    () => ({
      applyResumeSnapshot,
      configure,
      disposeGameplayRuntimeResources,
      hydrateLiveSnapshot,
      invalidateGameplaySession,
      refs,
      startGameFromServer,
    }),
    [
      applyResumeSnapshot,
      configure,
      disposeGameplayRuntimeResources,
      hydrateLiveSnapshot,
      invalidateGameplaySession,
      refs,
      startGameFromServer,
    ]
  );
}

export function useRoundSessionLifecycle(roundSession, runtime) {
  const refs = roundSession.refs;
  useRoundLifecycle({
    ...runtime,
    blackHoleOverlayRef: refs.blackHoleOverlayRef,
    gameplaySessionTokenRef: refs.gameplaySessionTokenRef,
    implodeFallbackRef: refs.implodeFallbackRef,
    outroInFlightRef: refs.outroInFlightRef,
    outroRoundRef: refs.outroRoundRef,
    pendingBreakStartRef: refs.pendingBreakStartRef,
    pendingRoundEndRef: refs.pendingRoundEndRef,
    playOutroThenResultsRef: refs.playOutroThenResultsRef,
    processBreakStartedRef: refs.processBreakStartedRef,
    processRoundEndedRef: refs.processRoundEndedRef,
  });
}
