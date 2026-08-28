import React, { useEffect } from "react";
import { playBlackHoleOutro3D } from "../effects/blackHoleOutro3D.js";
import AssetManager from "../assets/assetManager.js";
import { SFX_KEYS } from "../assets/assetKeys.js";
import { buildStandaloneTrainingTargetSummary } from "../training/standaloneTraining.js";
import { shouldProcessLiveRoomEvent } from "../utils/liveEventScope.js";

export default function useRoundLifecycle(runtime) {
  const {
    appViewRef,
    blackHoleAuxStopRef,
    blackHoleChebHandleRef,
    blackHoleClavierFadeRef,
    blackHoleClavierHandleRef,
    blackHoleHandleRef,
    blackHoleOverlayRef,
    blackHoleSourisLoopRef,
    blackHoleSyncTokenRef,
    buildObjectiveToastMessage,
    buildVocabOverlayRaceSnapshot,
    clearQueuedRankingUpdate,
    clearSelection,
    clearTileIntroAnimation,
    currentRoomIdRef,
    currentRoundTrainingRef,
    draggingRef,
    ensureTournamentBaseline,
    fetchThemeProfileRef,
    fetchWeeklyStatsSnapshot,
    FINAL_ROUND_RESULTS_SECONDS,
    gameplaySession,
    gameplaySessionIdRef,
    gameplaySessionTokenRef,
    getNowServerMs,
    getSelfWeeklyVocabRankFromStats,
    getTournamentPoints,
    getWeeklyVocabRankForCount,
    gridRef,
    implodeFallbackRef,
    inputLockedRef,
    isDailyPlayRef,
    isLoggedInRef,
    isSfxMuted,
    isTargetWordsObjective,
    LIVE_ROUND_END_PAYLOAD_WAIT_MS,
    nicknameRef,
    normalizeNickKey,
    outroInFlightRef,
    outroRoundRef,
    pendingBreakStartRef,
    pendingRoundEndRef,
    phaseRef,
    playOneShotAudio,
    playOutroThenResultsRef,
    playSfxHandle,
    processBreakStartedRef,
    processRoundEndedRef,
    renderTournamentTotalRightLabel,
    requestVocabCount,
    roundIdRef,
    roundStartAtRef,
    serverAllWordsRef,
    setAllWords,
    setAnnouncements,
    setBreakKind,
    setCurrentRoomId,
    setFinalResults,
    setInputLocked,
    setNextStartAt,
    setPhase,
    setProvisionalRanking,
    setResultsRankingMode,
    setResultsTeamDelta,
    setRoomId,
    setRoundId,
    setRoundPreparing,
    setScore,
    setServerEndsAt,
    setServerRoundDurationMs,
    setServerStatus,
    setTargetSummary,
    setTournament,
    setTournamentFinaleHoldUntil,
    setTournamentLobby,
    setTournamentRanking,
    setTournamentRoundPoints,
    setTournamentSummary,
    setTournamentSummaryAt,
    setTournamentTotals,
    setUpcomingSpecial,
    setVocabResultsReadyKey,
    setVocabRoundDelta,
    setVocabWeeklyRoundDelta,
    showToast,
    skipVocabOverlayOnceRef,
    standaloneTrainingSessionRef,
    STATS_SEASON_TARGET_LIMIT,
    stopImplodePhase,
    stopRoundEndTickSound,
    tileRefs,
    tournamentBaselineRef,
    tournamentDuelDeltaRef,
    tournamentRef,
    vocabBaselineRef,
    vocabOverlayRankSnapshotRef,
    vocabResultsPendingRef,
    vocabWeeklyBaselineRef,
    vocabWeeklyRankBaselineRef,
    weeklyStatsSnapshotRef,
  } = runtime;

  const processRoundEnded = React.useCallback(
    ({
      roomId: endedRoomId,
      roundId: endedId,
      results = [],
      tournament: tournamentPayload = null,
      tournamentSummary: summary = null,
      tournamentSummaryAt: summaryAt = null,
      targetSummary: targetSummaryPayload = null,
      teamDuel: teamDuelPayload = null,
      training = false,
    }) => {
      const effectSessionId = gameplaySessionIdRef?.current || null;
      if (
        !shouldProcessLiveRoomEvent({
          appView: appViewRef.current,
          isLoggedIn: isLoggedInRef.current,
          activeRoomId: currentRoomIdRef.current,
          incomingRoomId: endedRoomId,
        })
      ) {
        return;
      }
      if (endedRoomId) {
        setCurrentRoomId(endedRoomId);
        setRoomId(endedRoomId);
      }
      const isTrainingResults = !!training || currentRoundTrainingRef.current;
      currentRoundTrainingRef.current = false;
      roundStartAtRef.current = 0;
      setInputLocked(false);
      inputLockedRef.current = false;
      phaseRef.current = "results";
      setPhase("results");
      gameplaySession?.transitionPhase?.("results", {
        roomId: endedRoomId,
        roundId: endedId,
      });
      setServerStatus("break");
      clearQueuedRankingUpdate();
      setProvisionalRanking([]);
      setAnnouncements([]);
      setRoundPreparing(null);
      setFinalResults(Array.isArray(results) ? results : []);
      setServerEndsAt(null);
      setServerRoundDurationMs(null);
      setRoundId(endedId || null);
      setTournament(tournamentPayload || tournamentRef.current || null);
      const endBreakKind = tournamentPayload?.breakKind || null;
      setBreakKind(endBreakKind);
      if (tournamentPayload) {
        ensureTournamentBaseline(tournamentPayload, { captureRanking: true });
      }
      if (endBreakKind === "tournament_end") {
        setTournamentFinaleHoldUntil(
          getNowServerMs() + FINAL_ROUND_RESULTS_SECONDS * 1000
        );
      } else {
        setTournamentFinaleHoldUntil(null);
      }
      setTournamentRoundPoints(tournamentPayload?.roundAwarded || {});
      setTournamentTotals(tournamentPayload?.totals || {});
      const baselineRound = tournamentBaselineRef.current.rankingRound;
      const currentRound = Number.isFinite(tournamentPayload?.round)
        ? tournamentPayload.round
        : null;
      const useBaselineDelta =
        Number.isFinite(baselineRound) &&
        Number.isFinite(currentRound) &&
        baselineRound < currentRound;
      const visibleTournamentRanking = Array.isArray(tournamentPayload?.ranking)
        ? tournamentPayload.ranking.filter((entry) => getTournamentPoints(entry) > 0)
        : [];
      setTournamentRanking(
        visibleTournamentRanking.length
          ? visibleTournamentRanking.map((e, idx) => {
              const posNow = idx + 1;
              const basePos = tournamentBaselineRef.current.rankingMap?.get(e.nick);
              const delta =
                useBaselineDelta && Number.isFinite(basePos)
                  ? basePos - posNow
                  : e.delta ?? 0;
              return {
                nick: e.nick,
                score: e.points,
                gobbles: e.gobbles ?? null,
                rightLabel: renderTournamentTotalRightLabel(e.points, e.gobbles),
                roundScoreSum: Number(e.roundScoreSum) || 0,
                tieBreakRoundScore: Number(e.tieBreakRoundScore) || Number(e.roundScoreSum) || 0,
                tieBreakBy:
                  typeof e.tieBreakBy === "string" && e.tieBreakBy
                    ? e.tieBreakBy
                    : null,
                tieGroupSize: Number(e.tieGroupSize) || 0,
                delta,
                isBot: !!e.isBot,
                isDailyChampion: !!e.isDailyChampion,
                weeklyVocabPodiumRank: Number(e.weeklyVocabPodiumRank) || 0,
                isWeeklyVocabChampion: !!e.isWeeklyVocabChampion,
              };
            })
          : []
      );
      setTournamentSummary(summary || null);
      setTournamentSummaryAt(summaryAt || null);
      setTargetSummary(targetSummaryPayload || null);
      setResultsRankingMode("round");
      const roundTeamDelta = { red: 0, blue: 0 };
      if (teamDuelPayload && typeof teamDuelPayload === "object" && Array.isArray(results)) {
        const teamByNick = new Map(
          results
            .map((entry) => {
              const team = entry?.team === "red" || entry?.team === "blue" ? entry.team : null;
              return team && entry?.nick ? [entry.nick, team] : null;
            })
            .filter(Boolean)
        );
        Object.entries(teamDuelPayload).forEach(([nick, duelUpdate]) => {
          const team = teamByNick.get(nick);
          if (team !== "red" && team !== "blue") return;
          const objectiveUpdates = Array.isArray(duelUpdate?.objectiveUpdates)
            ? duelUpdate.objectiveUpdates
            : [];
          const objectivePointsFromUpdates = objectiveUpdates
            .filter((entry) => entry?.newlyValidated)
            .reduce(
              (sum, entry) =>
                sum + (Number(entry?.teamPointsAwarded) || Number(entry?.points) || 0),
              0
            );
          const objectivePoints =
            Number(duelUpdate?.objectivePointsAdded) || objectivePointsFromUpdates;
          const gobblePoints = Number(duelUpdate?.gobblePointsAdded) || 0;
          roundTeamDelta[team] += objectivePoints + gobblePoints;
        });
      }
      const endedTournamentId = String(
        tournamentPayload?.id || tournamentRef.current?.id || ""
      ).trim();
      if (endedTournamentId) {
        const prevTournamentDelta = tournamentDuelDeltaRef.current;
        const sameTournament = prevTournamentDelta.tournamentId === endedTournamentId;
        const baseRed = sameTournament
          ? Math.max(0, Number(prevTournamentDelta.red) || 0)
          : 0;
        const baseBlue = sameTournament
          ? Math.max(0, Number(prevTournamentDelta.blue) || 0)
          : 0;
        tournamentDuelDeltaRef.current = {
          tournamentId: endedTournamentId,
          red: baseRed + Math.max(0, Number(roundTeamDelta.red) || 0),
          blue: baseBlue + Math.max(0, Number(roundTeamDelta.blue) || 0),
        };
      }
      setResultsTeamDelta(roundTeamDelta);
      const selfNickNow = nicknameRef.current.trim();
      const selfDuelUpdate =
        teamDuelPayload &&
        typeof teamDuelPayload === "object" &&
        selfNickNow &&
        teamDuelPayload[selfNickNow]
          ? teamDuelPayload[selfNickNow]
          : null;
      if (selfDuelUpdate) {
        const objectiveUpdates = Array.isArray(selfDuelUpdate.objectiveUpdates)
          ? selfDuelUpdate.objectiveUpdates
          : [];
        objectiveUpdates.forEach((entry) => {
          if (!entry) return;
          if (entry?.newlyValidated) {
            showToast(buildObjectiveToastMessage(entry, { validated: true }), 2800);
            return;
          }
          if (isTargetWordsObjective(entry)) {
            showToast(buildObjectiveToastMessage(entry, { validated: false }), 2200);
          }
        });
        const gobblePoints = Number(selfDuelUpdate.gobblePointsAdded) || 0;
        if (gobblePoints > 0) {
          showToast(`🔥 Gobble ! (+${gobblePoints} équipe)`, 2200);
        }
      }
      const isTargetResults = !!targetSummaryPayload;
      if (isTrainingResults || isTargetResults) {
        vocabResultsPendingRef.current = null;
        setVocabRoundDelta(null);
        setVocabWeeklyRoundDelta(null);
        setVocabResultsReadyKey(null);
        vocabOverlayRankSnapshotRef.current = null;
      } else {
        const stableVocabKey =
          endedId ||
          summaryAt ||
          (tournamentPayload?.id
            ? `tournament-${tournamentPayload.id}-${tournamentPayload.round || "end"}`
            : null);
        const vocabResultsKey = stableVocabKey || `results-${Date.now()}`;
        vocabResultsPendingRef.current = vocabResultsKey;
        setVocabResultsReadyKey(null);
        const selfNickKeyForVocab = normalizeNickKey(nicknameRef.current);
        const selfResultForVocab =
          selfNickKeyForVocab && Array.isArray(results)
            ? results.find((entry) => normalizeNickKey(entry?.nick) === selfNickKeyForVocab)
            : null;
        const serverWeeklyRank =
          selfResultForVocab?.vocabWeeklyRank &&
          typeof selfResultForVocab.vocabWeeklyRank === "object"
            ? selfResultForVocab.vocabWeeklyRank
            : null;
        const serverWeeklyRace =
          selfResultForVocab?.vocabWeeklyRace &&
          typeof selfResultForVocab.vocabWeeklyRace === "object"
            ? selfResultForVocab.vocabWeeklyRace
            : null;
        const serverWeeklyBeforeCount = Number(serverWeeklyRace?.beforeCount);
        const serverWeeklyAfterCount = Number(serverWeeklyRace?.afterCount);
        const serverRankBeforeValue =
          serverWeeklyRank?.before == null ? null : Number(serverWeeklyRank.before);
        const serverRankAfterValue =
          serverWeeklyRank?.after == null ? null : Number(serverWeeklyRank.after);
        void fetchWeeklyStatsSnapshot(STATS_SEASON_TARGET_LIMIT);
        void requestVocabCount().then((snapshot) => {
          if (effectSessionId && gameplaySessionIdRef?.current !== effectSessionId) return;
          if (vocabResultsPendingRef.current !== vocabResultsKey) return;
          const count = Number.isFinite(snapshot?.count) ? snapshot.count : null;
          const weeklyCount = Number.isFinite(snapshot?.weeklyCount)
            ? snapshot.weeklyCount
            : Number.isFinite(serverWeeklyAfterCount)
            ? Math.max(0, serverWeeklyAfterCount)
            : null;
          if (!Number.isFinite(count)) {
            setVocabRoundDelta(null);
            setVocabWeeklyRoundDelta(null);
            return;
          }
          const base = vocabBaselineRef.current;
          if (Number.isFinite(base)) {
            setVocabRoundDelta(Math.max(0, count - base));
          } else {
            setVocabRoundDelta(null);
          }
          const weeklyBase = Number.isFinite(serverWeeklyBeforeCount)
            ? Math.max(0, serverWeeklyBeforeCount)
            : vocabWeeklyBaselineRef.current;
          if (Number.isFinite(weeklyCount) && Number.isFinite(weeklyBase)) {
            setVocabWeeklyRoundDelta(Math.max(0, weeklyCount - weeklyBase));
          } else {
            setVocabWeeklyRoundDelta(null);
          }
          const statsForRace = weeklyStatsSnapshotRef.current;
          const rankStart =
            Number.isFinite(serverRankBeforeValue)
              ? serverRankBeforeValue
              : Number.isFinite(vocabWeeklyRankBaselineRef.current)
              ? vocabWeeklyRankBaselineRef.current
              : Number.isFinite(weeklyBase)
              ? getWeeklyVocabRankForCount(weeklyBase, statsForRace)
              : null;
          const rankEnd =
            Number.isFinite(serverRankAfterValue)
              ? serverRankAfterValue
              : getSelfWeeklyVocabRankFromStats(statsForRace) ||
            (Number.isFinite(weeklyCount)
              ? getWeeklyVocabRankForCount(weeklyCount, statsForRace)
              : null);
          const raceSnapshot = buildVocabOverlayRaceSnapshot({
            statsSource: statsForRace,
            roundResults: results,
            weeklyBaseCount: Number.isFinite(weeklyBase) ? weeklyBase : null,
            weeklyTargetCount: weeklyCount,
            rankStart,
            rankEnd,
          });
          vocabOverlayRankSnapshotRef.current = {
            key: vocabResultsKey,
            rankStart,
            rankEnd,
            race: raceSnapshot,
          };
          if (skipVocabOverlayOnceRef.current) {
            skipVocabOverlayOnceRef.current = false;
            setVocabResultsReadyKey(null);
            return;
          }
          setVocabResultsReadyKey(vocabResultsKey);
        });
      }

      if (Array.isArray(results)) {
        const selfNickKey = normalizeNickKey(nicknameRef.current);
        const selfScore = results.find((r) => normalizeNickKey(r?.nick) === selfNickKey)?.score;
        if (typeof selfScore === "number") {
          setScore(selfScore);
        }
      }
      if (!isTrainingResults) {
        void fetchThemeProfileRef.current?.({ silent: true, announceGain: true });
      }
    },
    []
  );

  useEffect(() => {
    processRoundEndedRef.current = processRoundEnded;
  }, [processRoundEnded]);


  const playOutroThenResults = React.useCallback(
    async (payload, { fallback = false } = {}) => {
      const isLivePayload = !!(payload && typeof payload === "object");
      // Garde-fou: un outro provenant du live socket ne doit jamais se déclencher
      // hors session tournoi active (retour lobby / daily en cours).
      if (isLivePayload) {
        const isActiveLiveEvent = shouldProcessLiveRoomEvent({
          appView: appViewRef.current,
          isLoggedIn: isLoggedInRef.current,
          activeRoomId: currentRoomIdRef.current,
          incomingRoomId: payload?.roomId,
        });
        if (!isActiveLiveEvent || phaseRef.current !== "playing") {
          return;
        }
      }
      // Les outros fallback (sans payload) sont autorisés pour:
      // - manche live locale (si connecté),
      // - daily locale (daily_play).
      if (!isLivePayload && fallback) {
        const allowFallback = isLoggedInRef.current || isDailyPlayRef.current;
        if (!allowFallback) return;
      }

      const gameplaySessionToken = gameplaySessionTokenRef.current;
      const gameplaySessionId = gameplaySessionIdRef?.current || null;
      const isEffectSessionCurrent = () =>
        gameplaySessionTokenRef.current === gameplaySessionToken &&
        (!gameplaySessionId || gameplaySessionIdRef?.current === gameplaySessionId);

      const roundKey = payload?.roundId ?? roundIdRef.current ?? null;
      if (outroInFlightRef.current) {
        if (payload) pendingRoundEndRef.current = payload;
        return;
      }
      if (roundKey && outroRoundRef.current === roundKey) {
        if (payload) pendingRoundEndRef.current = payload;
        return;
      }
      if (roundKey) {
        outroRoundRef.current = roundKey;
      }
      outroInFlightRef.current = true;

      pendingRoundEndRef.current = payload || null;
      implodeFallbackRef.current = !!fallback;
      pendingBreakStartRef.current = null;

      const gridEl = gridRef.current;
      const gridRect = gridEl?.getBoundingClientRect?.();
      const holeX =
        gridRect && Number.isFinite(gridRect.left) && Number.isFinite(gridRect.width)
          ? gridRect.left + gridRect.width / 2
          : null;
      const holeY =
        gridRect && Number.isFinite(gridRect.top) && Number.isFinite(gridRect.height)
          ? gridRect.top + gridRect.height / 2
          : null;

      const tileEls = tileRefs.current.filter(Boolean);

      // On verrouille les validations pendant l'anim trou noir pour éviter des scores non comptabilisés.
      setInputLocked(true);
      inputLockedRef.current = true;
      // Le tic-tac (10s) de fin de manche ne doit pas continuer sous l'outro blackhole.
      stopRoundEndTickSound({ fadeMs: 80 });
      if (draggingRef.current) {
        draggingRef.current = false;
        clearSelection();
      }

      if (blackHoleSourisLoopRef.current.intervalId) {
        clearInterval(blackHoleSourisLoopRef.current.intervalId);
        blackHoleSourisLoopRef.current.intervalId = null;
      }
      if (blackHoleSourisLoopRef.current.stopTimer) {
        clearTimeout(blackHoleSourisLoopRef.current.stopTimer);
        blackHoleSourisLoopRef.current.stopTimer = null;
      }
      if (blackHoleClavierFadeRef.current) {
        clearTimeout(blackHoleClavierFadeRef.current);
        blackHoleClavierFadeRef.current = null;
      }
      if (blackHoleAuxStopRef.current) {
        clearTimeout(blackHoleAuxStopRef.current);
        blackHoleAuxStopRef.current = null;
      }

      const prevOpacity = gridEl?.style?.opacity;
      const prevTransition = gridEl?.style?.transition;
      if (gridEl) {
        gridEl.style.transition = "opacity 40ms linear";
        gridEl.style.opacity = "0";
      }

      let stopAuxNow = null;
      if (!isSfxMuted) {
        const syncToken = ++blackHoleSyncTokenRef.current;
        const stopAux = (fadeMs = 260) => {
          if (blackHoleSyncTokenRef.current !== syncToken) return;
          if (blackHoleSourisLoopRef.current.intervalId) {
            clearInterval(blackHoleSourisLoopRef.current.intervalId);
            blackHoleSourisLoopRef.current.intervalId = null;
          }
          if (blackHoleSourisLoopRef.current.stopTimer) {
            clearTimeout(blackHoleSourisLoopRef.current.stopTimer);
            blackHoleSourisLoopRef.current.stopTimer = null;
          }
          if (blackHoleClavierFadeRef.current) {
            clearTimeout(blackHoleClavierFadeRef.current);
            blackHoleClavierFadeRef.current = null;
          }
          if (blackHoleAuxStopRef.current) {
            clearTimeout(blackHoleAuxStopRef.current);
            blackHoleAuxStopRef.current = null;
          }
          if (blackHoleClavierHandleRef.current) {
            blackHoleClavierHandleRef.current.fadeOut?.(fadeMs);
            blackHoleClavierHandleRef.current = null;
          }
        };
        stopAuxNow = stopAux;

        if (blackHoleHandleRef.current) {
          blackHoleHandleRef.current.stop?.();
          blackHoleHandleRef.current = null;
        }
        if (blackHoleChebHandleRef.current) {
          blackHoleChebHandleRef.current.stop?.();
          blackHoleChebHandleRef.current = null;
        }
        if (blackHoleClavierHandleRef.current) {
          blackHoleClavierHandleRef.current.stop?.();
          blackHoleClavierHandleRef.current = null;
        }

        blackHoleHandleRef.current = playSfxHandle(SFX_KEYS.blackHole, {
          eqKey: "blackHole",
          voiceKey: "blackHole",
        });
        blackHoleChebHandleRef.current = playSfxHandle(SFX_KEYS.chebabeu, {
          eqKey: "chebabeu",
          voiceKey: "chebabeu",
        });
        blackHoleClavierHandleRef.current = playSfxHandle(SFX_KEYS.clavier, {
          eqKey: "clavier",
          voiceKey: "clavier",
        });

        const chebBuffer = AssetManager.getSfxBuffer(SFX_KEYS.chebabeu);
        const chebDuration = chebBuffer?.duration || null;
        const sourisBuffer = AssetManager.getSfxBuffer(SFX_KEYS.souris);
        const sourisDuration = sourisBuffer?.duration || 0.22;
        const clavierBuffer = AssetManager.getSfxBuffer(SFX_KEYS.clavier);
        const clavierDuration = clavierBuffer?.duration || null;

        const chebStartAt = performance.now();
        const playSourisOnce = () => {
          playOneShotAudio(SFX_KEYS.souris, {
            cooldownKey: "souris",
            eqKey: "souris",
            cooldownMs: 0,
          });
        };
        playSourisOnce();
        const scheduleSync = () => {
          if (blackHoleSyncTokenRef.current !== syncToken) return;
          if (!chebDuration) {
            blackHoleAuxStopRef.current = setTimeout(() => {
              stopAux(280);
            }, 6400);
            return;
          }
          const elapsed = performance.now() - chebStartAt;
          const totalMs = Math.max(0, Math.round(chebDuration * 1000));
          const remainingMs = Math.max(0, totalMs - elapsed);
          if (remainingMs <= 40) return;

          const intervalMs = Math.max(180, Math.round(sourisDuration * 1000 * 1.6));
          if (remainingMs > intervalMs + 20) {
            blackHoleSourisLoopRef.current.intervalId = setInterval(
              playSourisOnce,
              intervalMs
            );
            blackHoleSourisLoopRef.current.stopTimer = setTimeout(() => {
              if (blackHoleSourisLoopRef.current.intervalId) {
                clearInterval(blackHoleSourisLoopRef.current.intervalId);
                blackHoleSourisLoopRef.current.intervalId = null;
              }
              blackHoleSourisLoopRef.current.stopTimer = null;
            }, remainingMs);
          }

          if (clavierDuration && clavierDuration * 1000 > totalMs + 10) {
            const fadeMs = Math.min(600, Math.max(180, Math.round(totalMs * 0.22)));
            const delay = Math.max(0, remainingMs - fadeMs);
            blackHoleClavierFadeRef.current = setTimeout(() => {
              if (blackHoleClavierHandleRef.current) {
                blackHoleClavierHandleRef.current.fadeOut?.(fadeMs);
                blackHoleClavierHandleRef.current = null;
              }
              blackHoleClavierFadeRef.current = null;
            }, delay);
          }
          blackHoleAuxStopRef.current = setTimeout(() => {
            stopAux(280);
          }, remainingMs);
        };
        scheduleSync();
      }

      let fxOverlay = null;
      let fxFade = null;
      try {
        if (holeX != null && holeY != null && tileEls.length > 0) {
          const fx = await playBlackHoleOutro3D({
            tileEls,
            holeX,
            holeY,
            durationMs: 6000,
            onOverlay: (overlay) => {
              if (!isEffectSessionCurrent()) {
                overlay?.remove?.();
                return;
              }
              blackHoleOverlayRef.current = overlay;
            },
          });
          fxOverlay = fx?.overlay || null;
          fxFade = fx?.fade || null;
        }
      } finally {
        if (gridEl) {
          gridEl.style.opacity = prevOpacity || "";
          gridEl.style.transition = prevTransition || "";
        }
      }

      if (!isEffectSessionCurrent()) {
        fxOverlay?.remove?.();
        if (blackHoleOverlayRef.current === fxOverlay) {
          blackHoleOverlayRef.current = null;
        }
        stopAuxNow?.(0);
        return;
      }

      let pending = pendingRoundEndRef.current;
      pendingRoundEndRef.current = null;
      const shouldFallback = implodeFallbackRef.current;
      implodeFallbackRef.current = false;
      let skipFallbackForStaleRound = false;

      if (
        !pending &&
        shouldFallback &&
        isLoggedInRef.current &&
        !isDailyPlayRef.current &&
        !standaloneTrainingSessionRef.current
      ) {
        setServerStatus("break");
        const fallbackRoundKey = roundKey || null;
        const deadline = performance.now() + LIVE_ROUND_END_PAYLOAD_WAIT_MS;
        while (!pendingRoundEndRef.current && performance.now() < deadline) {
          if (!isEffectSessionCurrent()) {
            stopAuxNow?.(0);
            return;
          }
          if (fallbackRoundKey && outroRoundRef.current !== fallbackRoundKey) {
            skipFallbackForStaleRound = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 80));
          if (!isEffectSessionCurrent()) {
            stopAuxNow?.(0);
            return;
          }
        }
        pending = pendingRoundEndRef.current;
        pendingRoundEndRef.current = null;
      }

      let processedRoundEndPayload = false;
      if (pending && processRoundEndedRef.current) {
        processedRoundEndPayload = true;
        processRoundEndedRef.current(pending);
      } else if (shouldFallback && !skipFallbackForStaleRound) {
        setServerStatus("break");
        setInputLocked(false);
        inputLockedRef.current = false;
        if (standaloneTrainingSessionRef.current) {
          setAllWords(Array.isArray(serverAllWordsRef.current) ? serverAllWordsRef.current : []);
          setTargetSummary(
            buildStandaloneTrainingTargetSummary(standaloneTrainingSessionRef.current)
          );
        }
        setPhase("results");
        gameplaySession?.transitionPhase?.("results", {
          roundId: roundKey,
        });
      }

      if (fxOverlay && fxFade) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (!isEffectSessionCurrent()) {
          fxOverlay.remove();
          stopAuxNow?.(0);
          return;
        }
        try {
          await fxFade
            .animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: 220,
              easing: "ease-out",
              fill: "forwards",
            })
            .finished;
        } catch (_) {}
        fxOverlay.remove();
        if (blackHoleOverlayRef.current === fxOverlay) {
          blackHoleOverlayRef.current = null;
        }
      }
      // Le clavier doit toujours se couper (fade) à la fin visuelle du blackhole.
      stopAuxNow?.(280);

      if (!isEffectSessionCurrent()) return;

      const latePending = pendingRoundEndRef.current;
      if (!processedRoundEndPayload && latePending && processRoundEndedRef.current) {
        pendingRoundEndRef.current = null;
        processedRoundEndPayload = true;
        processRoundEndedRef.current(latePending);
      }

      const pendingBreak = pendingBreakStartRef.current;
      if (pendingBreak && processBreakStartedRef.current) {
        pendingBreakStartRef.current = null;
        processBreakStartedRef.current(pendingBreak);
      }

      outroInFlightRef.current = false;
    },
    [clearSelection]
  );

  useEffect(() => {
    playOutroThenResultsRef.current = playOutroThenResults;
  }, [playOutroThenResults]);

  const processBreakStarted = React.useCallback(
    ({
      roomId: incomingRoomId,
      nextStartAt: nextTs,
      breakKind: bk = null,
      tournament: tournamentPayload = null,
      nextSpecial = null,
      tournamentSummary: summary = null,
      tournamentSummaryAt: summaryAt = null,
      targetSummary: targetSummaryPayload = null,
    }) => {
      if (
        !shouldProcessLiveRoomEvent({
          appView: appViewRef.current,
          isLoggedIn: isLoggedInRef.current,
          activeRoomId: currentRoomIdRef.current,
          incomingRoomId,
        })
      ) {
        return;
      }
      setNextStartAt(nextTs || null);
      setTournamentLobby(null);
      setRoundPreparing(null);
      setBreakKind(bk);
      const isTournamentEndBreak = bk === "tournament_end";
      if (tournamentPayload && !isTournamentEndBreak) {
        ensureTournamentBaseline(tournamentPayload);
      }
      if (bk !== "tournament_end") {
        setTournamentFinaleHoldUntil(null);
      }
      if (bk) {
        phaseRef.current = "results";
        setPhase("results");
        gameplaySession?.transitionPhase?.("intermission", {
          roomId: incomingRoomId,
        });
        setServerStatus("break");
        setServerEndsAt(null);
        setServerRoundDurationMs(null);
        setRoundId(null);
      }
      // Pendant l'ecran final du mini-tournoi, on garde l'etat du tournoi termine.
      // Le serveur a deja reset le tournoi suivant avant d'emettre breakStarted.
      if (tournamentPayload && !isTournamentEndBreak) {
        setTournament(tournamentPayload);
      }
      setUpcomingSpecial(nextSpecial && nextSpecial.isSpecial ? nextSpecial : null);
      if (summary) setTournamentSummary(summary);
      setTournamentSummaryAt(summaryAt || null);
      setTargetSummary(targetSummaryPayload || null);
    },
    []
  );

  useEffect(() => {
    processBreakStartedRef.current = processBreakStarted;
  }, [processBreakStarted]);

  useEffect(() => {
    return () => {
      stopImplodePhase();
    };
  }, [stopImplodePhase]);

  useEffect(() => {
    return () => {
      clearTileIntroAnimation();
    };
  }, [clearTileIntroAnimation]);
}
