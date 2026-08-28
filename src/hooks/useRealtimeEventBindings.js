import { useEffect } from "react";
import { recordPerfEvent } from "../perf/renderPerfProbe.js";
import { shouldProcessLiveRoomEvent } from "../utils/liveEventScope.js";
import {
  capChatMessagesByType,
  findNewReactionFromOthers,
  isSystemChatMessage,
  normalizeChatMessageShape,
  patchChatMessageById,
  patchChatMessageReactions,
  removeChatMessageById,
} from "../utils/chatMessages.js";
import { capturePendingSubmissions } from "../network/liveSubmissionRecovery.js";
import {
  isChatBotMessage,
  shouldDisplayChatMessageForBotSettings,
} from "../components/chat/chatBotVisibility.js";
import {
  createDailySpecialPlacements,
  createDailyWordSlots,
} from "../components/daily/dailySpecialModel.js";
import { DAILY_SPECIAL_MODE } from "../components/daily/dailyModes.js";
import { FAKE_TWINS_TYPE, OCID_TYPE } from "../components/gameLogic.js";

export default function useRealtimeEventBindings(runtime) {
  const {
    applyCultureThemeChallengeToWordStores,
    appViewRef,
    buildObjectiveToastMessage,
    bumpSamsungDiagCounter,
    chatBotVisibilityRef,
    chatEditTargetRef,
    chatMessagesRef,
    chatReplyTargetRef,
    chatTabRef,
    clearQueuedRankingUpdate,
    clearSavedSession,
    currentRoomIdRef,
    currentRoundTrainingRef,
    dailySpecialDragRef,
    deferNonessentialUiDuringTrace,
    enqueueMobileChatReactionToast,
    ensureTournamentBaseline,
    getNowServerMs,
    getWeeklyVocabRankForCount,
    gobblarsKnownBalanceRef,
    gobblarToastDelayTimersRef,
    inputLockedRef,
    installId,
    installIdRef,
    isChatClosingRef,
    isChatOpenMobileRef,
    isDailyPlayRef,
    isHomeChatOpenRef,
    isLoggedInRef,
    isMobileLayoutRef,
    lastGobbleAtRef,
    maybePlayAnnouncementSound,
    nickname,
    nicknameRef,
    ocidLatestProposalRef,
    outroInFlightRef,
    outroRoundRef,
    pendingBreakStartRef,
    pendingRoundEndRef,
    pendingSubmissionRecoveryRef,
    phaseLoopTestEnabledRef,
    phaseRef,
    playGobbleVoice,
    playOutroThenResultsRef,
    playSpecialFoundSound,
    processBreakStartedRef,
    processRoundEndedRef,
    queuePlayersUpdate,
    queueRankingUpdate,
    requestVocabCount,
    roundHandlersRef,
    roundIdRef,
    roundStartAtRef,
    scheduleDesktopChatAutoScroll,
    setAnnouncements,
    setBreakKind,
    setChatEditTarget,
    setChatInput,
    setChatMessages,
    setChatReplyTarget,
    setConnectionError,
    setCurrentRoomId,
    setDailyActiveSlot,
    setDailyInvalidSlot,
    setDailySpecialDrag,
    setDailySpecialPlacements,
    setDailyWordSlots,
    setFinalResults,
    setFoundTargetThisRound,
    setFoundTargetWord,
    setGobblarsBalance,
    setHomeChatBotUnreadCount,
    setHomeChatUnreadCount,
    setInputLocked,
    setIsLoggedIn,
    setLoginError,
    setMedals,
    setMobileChatBotUnreadCount,
    setMobileChatUnreadCount,
    setMobileResultsOutroFadeActive,
    setNextStartAt,
    setOcidProposal,
    setOcidProposalPath,
    setOcidProposalSubmitted,
    setOcidSelectedOptionId,
    setOcidStatusMessage,
    setOcidVote,
    setPhase,
    setProvisionalRanking,
    setResultsTeamDelta,
    setRoomId,
    setRoundPreparing,
    setServerEndsAt,
    setServerRoundDurationMs,
    setServerStatus,
    setSpecialHint,
    setSpecialSolvedOverlay,
    setStatusMessageWithHold,
    setTargetSummary,
    setTick,
    setTournament,
    setTournamentFinaleHoldUntil,
    setTournamentLobby,
    setTournamentSummary,
    setTournamentSummaryAt,
    setTrainingBusy,
    setTrophyHistory,
    setTrophyStatus,
    setUpcomingSpecial,
    setVocabResultsReadyKey,
    setVocabRoundDelta,
    setVocabWeeklyRoundDelta,
    showBotMessagesRef,
    showGlobalRedAnnouncement,
    showToast,
    showToastRef,
    socket,
    standaloneTrainingSessionRef,
    startGameFromServerRef,
    stopImplodePhase,
    stopRoundEndTickSound,
    submissionStatusRef,
    triggerConfettiBurst,
    triggerPraiseFlash,
    vocabBaselineRef,
    vocabBaselineRoundRef,
    vocabResultsPendingRef,
    vocabWeeklyBaselineRef,
    vocabWeeklyBaselineRoundRef,
    vocabWeeklyRankBaselineRef,
  } = runtime;

useEffect(() => {
    const shouldHandleLiveRoundSocketEvents = (incomingRoomId = null) => {
      if (phaseLoopTestEnabledRef.current) return false;
      if (standaloneTrainingSessionRef.current) return false;
      return shouldProcessLiveRoomEvent({
        appView: appViewRef.current,
        isLoggedIn: isLoggedInRef.current,
        activeRoomId: currentRoomIdRef.current,
        incomingRoomId,
      });
    };
    const shouldHandleLiveFeedSocketEvent = (incomingRoomId = null) => {
      return shouldHandleLiveRoundSocketEvents(incomingRoomId);
    };

    function onRoundPreparing(payload = {}) {
      if (!shouldHandleLiveRoundSocketEvents(payload?.roomId)) return;
      if (!payload || typeof payload !== "object") return;
      const activeRoomId = currentRoomIdRef.current;
      setRoundPreparing({
        roomId: payload.roomId || activeRoomId || null,
        roundNumber: Number.isFinite(payload.roundNumber) ? payload.roundNumber : null,
        special: payload.special && payload.special.isSpecial ? payload.special : null,
        message:
          typeof payload.message === "string" && payload.message.trim()
            ? payload.message.trim()
            : "La prochaine grille met un peu plus de temps à générer.",
        startedAt: Number.isFinite(payload.startedAt) ? payload.startedAt : Date.now(),
      });
      setMobileResultsOutroFadeActive(false);
    }

    function onRoundStarted({
      roomId: incomingRoomId,
      roundId: incomingRoundId,
      grid,
      durationMs,
      endsAt,
      startsAt = null,
      introMs = 0,
      status: roundStatus = "running",
      gridSize: payloadSize,
      special = null,
      gridQuality = null,
      roundNumber = null,
      nextSpecial = null,
      tournament: tournamentPayload = null,
      targetLength = null,
      targetHintScheduleMs = [],
      solutions = null,
      cultureThemeChallenge = null,
      ocidVote: ocidVotePayload = null,
      training = false,
    }) {
      if (!shouldHandleLiveRoundSocketEvents(incomingRoomId)) return;
      if (!grid || !Array.isArray(grid)) return;
      currentRoundTrainingRef.current = !!training;
      const pendingSnapshot = capturePendingSubmissions(
        submissionStatusRef.current,
        roundIdRef.current
      );
      if (pendingSnapshot.entries.length > 0) {
        pendingSubmissionRecoveryRef.current = pendingSnapshot;
      } else if (
        roundIdRef.current != null &&
        incomingRoundId != null &&
        String(roundIdRef.current) !== String(incomingRoundId)
      ) {
        pendingSubmissionRecoveryRef.current = null;
      }
      clearQueuedRankingUpdate();
      stopImplodePhase();
      pendingBreakStartRef.current = null;
      pendingRoundEndRef.current = null;
      outroInFlightRef.current = false;
      outroRoundRef.current = null;
      setInputLocked(false);
      if (incomingRoomId) {
        setCurrentRoomId(incomingRoomId);
        setRoomId(incomingRoomId);
      }
      setFinalResults([]);
      setResultsTeamDelta({ red: 0, blue: 0 });
      setProvisionalRanking([]);
      setAnnouncements([]);
      setNextStartAt(null);
      setTournamentLobby(null);
      setTrainingBusy(false);
      setRoundPreparing(null);
      setUpcomingSpecial(nextSpecial && nextSpecial.isSpecial ? nextSpecial : null);
      setBreakKind(null);
      setTournamentSummary(null);
      setTournamentSummaryAt(null);
      setTournamentFinaleHoldUntil(null);
      setTargetSummary(null);
      setOcidProposal("");
      setOcidProposalPath([]);
      ocidLatestProposalRef.current = { roundId: null, word: "", path: [] };
      setOcidProposalSubmitted("");
      setOcidVote(ocidVotePayload || null);
      setOcidSelectedOptionId("");
      setOcidStatusMessage("");
      setTournament(tournamentPayload || null);
      if (tournamentPayload) {
        ensureTournamentBaseline(tournamentPayload);
      }
      if (
        (special?.type === "target_long" || special?.type === "target_score") &&
        typeof targetLength === "number" &&
        targetLength > 0
      ) {
        setSpecialHint({
          kind: special.type,
          pattern: "",
          length: targetLength,
          cells: [],
          wordIndices: [],
        });
      } else {
        setSpecialHint(null);
      }
      setSpecialSolvedOverlay(null);
      setFoundTargetThisRound(false);
      setFoundTargetWord("");
      if (special?.type === DAILY_SPECIAL_MODE) {
        setDailySpecialPlacements(createDailySpecialPlacements());
        setDailyWordSlots(createDailyWordSlots());
        setDailyActiveSlot(0);
        setDailyInvalidSlot(null);
        setDailySpecialDrag(null);
        dailySpecialDragRef.current = null;
      }
      if (Number.isFinite(endsAt) && Number.isFinite(durationMs)) {
        roundStartAtRef.current = Math.max(0, endsAt - durationMs);
      } else {
        roundStartAtRef.current = getNowServerMs();
      }
      setVocabRoundDelta(null);
      setVocabWeeklyRoundDelta(null);
      setVocabResultsReadyKey(null);
      vocabResultsPendingRef.current = null;
      if (training || special?.type === OCID_TYPE) {
        vocabBaselineRoundRef.current = null;
        vocabBaselineRef.current = null;
        vocabWeeklyBaselineRoundRef.current = null;
        vocabWeeklyBaselineRef.current = null;
        vocabWeeklyRankBaselineRef.current = null;
      } else {
        const vocabRoundKey = incomingRoundId || Date.now();
        vocabBaselineRoundRef.current = vocabRoundKey;
        vocabWeeklyBaselineRoundRef.current = vocabRoundKey;
        void requestVocabCount().then((snapshot) => {
          if (vocabBaselineRoundRef.current !== vocabRoundKey) return;
          const count = Number.isFinite(snapshot?.count) ? snapshot.count : null;
          const weeklyCount = Number.isFinite(snapshot?.weeklyCount) ? snapshot.weeklyCount : null;
          if (Number.isFinite(count)) {
            vocabBaselineRef.current = count;
          }
          if (Number.isFinite(weeklyCount)) {
            vocabWeeklyBaselineRef.current = weeklyCount;
            vocabWeeklyRankBaselineRef.current = getWeeklyVocabRankForCount(weeklyCount);
          }
        });
      }
      startGameFromServerRef.current?.(
        grid,
        incomingRoundId,
        durationMs,
        endsAt,
        incomingRoomId,
        payloadSize,
        special,
        gridQuality,
        nextSpecial || null,
        targetHintScheduleMs,
        {
          startsAt,
          introMs,
          status: roundStatus,
          solutions,
          cultureThemeChallenge,
        }
      );
    }

    function onRoundEnded({
      roomId: endedRoomId,
      roundId: endedId,
      results = [],
      tournament: tournamentPayload = null,
      tournamentSummary: summary = null,
      tournamentSummaryAt: summaryAt = null,
      targetSummary: targetSummaryPayload = null,
      teamDuel: teamDuelPayload = null,
      training = false,
    }) {
      if (!shouldHandleLiveRoundSocketEvents(endedRoomId)) return;
      const payload = {
        roomId: endedRoomId,
        roundId: endedId,
        results,
        tournament: tournamentPayload,
        tournamentSummary: summary,
        tournamentSummaryAt: summaryAt,
        targetSummary: targetSummaryPayload,
        teamDuel: teamDuelPayload,
        training,
      };
      if (targetSummaryPayload?.ocid) {
        processRoundEndedRef.current?.(payload);
        return;
      }
      if (phaseRef.current !== "playing") {
        processRoundEndedRef.current?.(payload);
        return;
      }
      playOutroThenResultsRef.current?.(
        payload,
        { fallback: false }
      );
    }

    function onBreakStarted(payload = {}) {
      if (!shouldHandleLiveRoundSocketEvents(payload?.roomId)) return;
      if (!payload || typeof payload !== "object") return;
      if (pendingRoundEndRef.current || inputLockedRef.current) {
        pendingBreakStartRef.current = payload;
        return;
      }
      if (phaseRef.current === "playing") {
        pendingBreakStartRef.current = payload;
        return;
      }
      processBreakStartedRef.current?.(payload);
    }

    function onPlayersUpdate(list = []) {
      if (!shouldHandleLiveRoundSocketEvents()) return;
      const sanitized = Array.isArray(list) ? list : [];
      bumpSamsungDiagCounter("socketPlayersUpdate");
      recordPerfEvent("players-received", { count: sanitized.length });
      queuePlayersUpdate(sanitized);
    }

    function onRankingUpdate({ roomId: incomingRoomId, roundId: rid, ranking = [] } = {}) {
      if (!shouldHandleLiveRoundSocketEvents(incomingRoomId)) return;
      const activeRoundId = roundIdRef.current;
      if (activeRoundId && rid && rid !== activeRoundId) return;
      bumpSamsungDiagCounter("socketRankingUpdate");
      recordPerfEvent("ranking-received", { count: Array.isArray(ranking) ? ranking.length : 0 });
      queueRankingUpdate(ranking);
    }

    function onChatHistory(history = []) {
      if (deferNonessentialUiDuringTrace(() => onChatHistory(history), "chat-history")) return;
      if (!Array.isArray(history)) return;
      const normalizedHistory = history
        .map((entry) => normalizeChatMessageShape(entry))
        .filter(Boolean);
      if (!normalizedHistory.length) return;
      setChatMessages((prev) => capChatMessagesByType([...prev, ...normalizedHistory]));
      scheduleDesktopChatAutoScroll();
    }

    function onChatNew(msg) {
      if (deferNonessentialUiDuringTrace(() => onChatNew(msg), "chat-message")) return;
      const normalizedMessage = normalizeChatMessageShape(msg);
      if (!normalizedMessage) return;
      setChatMessages((prev) => capChatMessagesByType([...prev, normalizedMessage]));
      scheduleDesktopChatAutoScroll();
      if (isSystemChatMessage(normalizedMessage)) return;

      const authorInstallId =
        typeof normalizedMessage.installId === "string" ? normalizedMessage.installId : "";
      if (authorInstallId && authorInstallId === installId) return;
      const author = (normalizedMessage.author || normalizedMessage.nick || "").trim();
      const me = nicknameRef.current.trim();
      if (author && me && author === me) return;
      if (
        !shouldDisplayChatMessageForBotSettings(
          normalizedMessage,
          showBotMessagesRef.current,
          chatBotVisibilityRef.current
        )
      ) {
        return;
      }
      const unreadIsBot = isChatBotMessage(normalizedMessage);
      const currentTab = chatTabRef.current === "system" ? "system" : "messages";
      if (isLoggedInRef.current) {
        const isMobileNow = isMobileLayoutRef.current;
        const messagesVisible =
          currentTab === "messages" &&
          (isMobileNow
            ? isChatOpenMobileRef.current && !isChatClosingRef.current
            : true);
        if (!messagesVisible) {
          setMobileChatUnreadCount((prev) => Math.min(99, prev + 1));
          if (unreadIsBot) {
            setMobileChatBotUnreadCount((prev) => Math.min(99, prev + 1));
          }
        }
      } else {
        const isMobileNow = isMobileLayoutRef.current;
        const messagesVisible =
          currentTab === "messages" &&
          (isMobileNow
            ? isChatOpenMobileRef.current && !isChatClosingRef.current
            : isHomeChatOpenRef.current);
        if (!messagesVisible) {
          setHomeChatUnreadCount((prev) => Math.min(99, prev + 1));
          if (unreadIsBot) {
            setHomeChatBotUnreadCount((prev) => Math.min(99, prev + 1));
          }
        }
      }
    }

    function onChatReactionUpdate(patch) {
      if (
        deferNonessentialUiDuringTrace(
          () => onChatReactionUpdate(patch),
          "chat-reaction"
        )
      ) {
        return;
      }
      const messageId = typeof patch?.messageId === "string" ? patch.messageId.trim() : "";
      const selfInstallId =
        typeof installIdRef.current === "string" ? installIdRef.current.trim() : "";
      const selfNickNow = String(nicknameRef.current || "")
        .trim()
        .toLowerCase();
      const previousMessages = Array.isArray(chatMessagesRef.current)
        ? chatMessagesRef.current
        : [];
      let toastReaction = null;
      if (messageId) {
        const previousMessage =
          previousMessages.find((entry) => entry?.id === messageId) || null;
        const authorInstallId =
          typeof previousMessage?.installId === "string"
            ? previousMessage.installId.trim()
            : "";
        const authorNick = String(previousMessage?.nick || previousMessage?.author || "")
          .trim()
          .toLowerCase();
        const isOwnMessage =
          (authorInstallId && selfInstallId && authorInstallId === selfInstallId) ||
          (!authorInstallId && selfNickNow && authorNick === selfNickNow);
        if (isOwnMessage) {
          toastReaction = findNewReactionFromOthers(
            previousMessage,
            patch?.reactions,
            selfInstallId
          );
        }
      }
      setChatMessages((prev) => {
        const next = patchChatMessageReactions(prev, patch);
        chatMessagesRef.current = next;
        return next;
      });
      if (toastReaction?.emoji) {
        enqueueMobileChatReactionToast(toastReaction.emoji, {
          messageId,
          actorNick: toastReaction.actorNick,
        });
      }
      scheduleDesktopChatAutoScroll();
    }

    function onChatMessageUpdate(payload) {
      if (
        deferNonessentialUiDuringTrace(
          () => onChatMessageUpdate(payload),
          "chat-update"
        )
      ) {
        return;
      }
      const updatedMessage = payload?.message;
      if (!updatedMessage || typeof updatedMessage !== "object") return;
      setChatMessages((prev) =>
        capChatMessagesByType(patchChatMessageById(prev, updatedMessage))
      );
      const updatedId =
        typeof updatedMessage.id === "string" ? updatedMessage.id.trim() : "";
      if (updatedId && chatEditTargetRef.current?.id === updatedId) {
        setChatEditTarget(null);
      }
      scheduleDesktopChatAutoScroll();
    }

    function onChatMessageDelete(payload) {
      if (
        deferNonessentialUiDuringTrace(
          () => onChatMessageDelete(payload),
          "chat-delete"
        )
      ) {
        return;
      }
      const deletedId =
        typeof payload?.messageId === "string" ? payload.messageId.trim() : "";
      if (!deletedId) return;
      setChatMessages((prev) => capChatMessagesByType(removeChatMessageById(prev, deletedId)));
      if (chatEditTargetRef.current?.id === deletedId) {
        setChatEditTarget(null);
        setChatInput("");
      }
      if (chatReplyTargetRef.current?.id === deletedId) {
        setChatReplyTarget(null);
      }
      scheduleDesktopChatAutoScroll();
    }

    function appendAnnouncements(entries) {
      if (!entries || entries.length === 0) return;
      setAnnouncements((prev) => [...prev, ...entries].slice(-40));
    }

    function maybeTriggerGobbleFromAnnouncement(entry) {
      if (!entry) return;
      if (phaseRef.current !== "playing") return;
      if (
        entry.type !== "best_possible_score" &&
        entry.type !== "longest_possible"
      ) {
        return;
      }
      const selfRaw = (nicknameRef.current || nickname || "").trim();
      const authorRaw = (entry.nick || "").trim();
      const self = selfRaw ? selfRaw.toLowerCase() : "";
      const author = authorRaw ? authorRaw.toLowerCase() : "";
      if (!self || !author || self !== author) return;
      if (Date.now() - lastGobbleAtRef.current < 1600) return;
      triggerPraiseFlash("GOBBLE !", { kind: "gobble", shakeGrid: true });
      triggerConfettiBurst("gobble");
    }

    function maybeShowDuelToastFromAnnouncement(entry) {
      if (!entry || entry.type !== "objective_validated") return;
      const selfNickNow = (nicknameRef.current || "").trim().toLowerCase();
      const nick = String(entry?.nick || "").trim().toLowerCase();
      if (!selfNickNow || !nick || selfNickNow !== nick) return;
      showToast(
        buildObjectiveToastMessage(
          {
            objectiveId: entry?.objectiveId,
            objectiveTitle: entry?.objectiveTitle,
            objectiveBucket: entry?.objectiveBucket,
            objectiveProgress: entry?.objectiveProgress,
            objectiveTarget: entry?.objectiveTarget,
            teamPoints: entry?.teamPoints,
          },
          { validated: true }
        ),
        2800
      );
    }

    function maybeShowFakeTwinsCompletionToastFromAnnouncement(entry) {
      if (!entry || entry.type !== "fake_twins_completed") return;
      const bonus = Math.max(0, Number(entry?.bonus) || 0);
      const nick = String(entry?.nick || "").trim();
      const label = bonus > 0 ? `+${bonus} pts` : "bonus validé";
      showToast(
        nick ? `${nick} complète les faux jumeaux : ${label}` : `Faux jumeaux complétés : ${label}`,
        3200
      );
    }

    function maybeShowCultureThemeCompletionToastFromAnnouncement(entry) {
      if (!entry || entry.type !== "culture_theme_completed") return;
      const bonus = Math.max(0, Number(entry?.bonus) || 0);
      const nick = String(entry?.nick || "").trim();
      const theme = String(entry?.theme || "").trim();
      const label = bonus > 0 ? `+${bonus} pts` : "bonus validé";
      const subject = theme ? `WikiMama ${theme}` : "WikiMama";
      showToast(
        nick ? `${nick} complète ${subject} : ${label}` : `${subject} complété : ${label}`,
        3200
      );
    }

    function onAnnouncement(data) {
      if (!data) return;
      if (!shouldHandleLiveFeedSocketEvent(data?.roomId)) return;
      if (data.type === "big_word" || data.type === "long_word") {
        return;
      }
      maybePlayAnnouncementSound(data);
      maybeTriggerGobbleFromAnnouncement(data);
      maybeShowDuelToastFromAnnouncement(data);
      maybeShowFakeTwinsCompletionToastFromAnnouncement(data);
      maybeShowCultureThemeCompletionToastFromAnnouncement(data);
      appendAnnouncements([data]);
    }

    function onAnnouncements(batch) {
      if (!Array.isArray(batch) || batch.length === 0) return;
      const filtered = batch.filter(
        (entry) =>
          entry &&
          shouldHandleLiveFeedSocketEvent(entry?.roomId) &&
          entry.type !== "big_word" &&
          entry.type !== "long_word"
      );
      if (!filtered.length) return;
      filtered.forEach((entry) => {
        maybePlayAnnouncementSound(entry);
        maybeTriggerGobbleFromAnnouncement(entry);
        maybeShowDuelToastFromAnnouncement(entry);
        maybeShowFakeTwinsCompletionToastFromAnnouncement(entry);
        maybeShowCultureThemeCompletionToastFromAnnouncement(entry);
      });
      appendAnnouncements(filtered);
    }

    function onMedalsUpdate(payload) {
      if (!shouldHandleLiveRoundSocketEvents(payload?.roomId)) return;
      setMedals(payload && typeof payload === "object" ? payload : {});
    }

    function onSpecialHint(payload) {
      if (!shouldHandleLiveRoundSocketEvents(payload?.roomId)) return;
      if (!payload || typeof payload !== "object") return;
      if (phaseRef.current !== "playing") return;
      const activeRoundId = roundIdRef.current;
      if (activeRoundId && payload.roundId && payload.roundId !== activeRoundId) return;
      const hintKind = payload.kind || null;
      const allowCells = hintKind === "target_long" || hintKind === "target_score";
      const hintLength =
        typeof payload.length === "number" ? payload.length : null;
      setSpecialHint((prev) => ({
        kind: hintKind,
        pattern: payload.pattern || "",
        length: hintLength ?? prev?.length ?? null,
        cells:
          allowCells && Array.isArray(payload.revealCells)
            ? payload.revealCells.filter((idx) => Number.isInteger(idx))
            : [],
        wordIndices:
          allowCells && Array.isArray(payload.revealWordIndices)
            ? payload.revealWordIndices.filter((idx) => Number.isInteger(idx) && idx >= 0)
            : [],
      }));
    }

    function onSpecialSolved(payload) {
      if (!shouldHandleLiveRoundSocketEvents(payload?.roomId)) return;
      if (!payload || typeof payload !== "object") return;
      if (phaseRef.current !== "playing") return;
      const activeRoundId = roundIdRef.current;
      if (activeRoundId && payload.roundId && payload.roundId !== activeRoundId) return;
      const me = nicknameRef.current.trim();
      const solvedNick = payload.nick || "";
      const isSelf = me && solvedNick === me;
      if (payload.kind === FAKE_TWINS_TYPE) {
        if (isSelf) return;
        if (isDailyPlayRef.current) return;
        if (appViewRef.current !== "live") return;
        playSpecialFoundSound();
        return;
      }
      if (isSelf) {
        setFoundTargetThisRound(true);
        setSpecialSolvedOverlay({
          nick: solvedNick,
          word: "",
          kind: payload.kind || null,
        });
        triggerConfettiBurst("target");
        try {
          playGobbleVoice();
          triggerPraiseFlash("GOBBLE !", { kind: "gobble", shakeGrid: true });
        } catch (_) {}
        return;
      }
      if (payload.kind === "target_long" || payload.kind === "target_score") {
        playSpecialFoundSound();
      }
    }

    function onCultureThemeChallenge(payload = {}) {
      if (!shouldHandleLiveRoundSocketEvents(payload?.roomId)) return;
      if (!payload || typeof payload !== "object") return;
      if (phaseRef.current !== "playing") return;
      const activeRoundId = roundIdRef.current;
      if (activeRoundId && payload.roundId && payload.roundId !== activeRoundId) return;
      applyCultureThemeChallengeToWordStores(payload.challenge || payload);
    }

    function onOcidVoteStarted(payload = {}) {
      if (!shouldHandleLiveRoundSocketEvents(payload?.roomId)) return;
      if (!payload || typeof payload !== "object") return;
      setOcidVote(payload);
      setOcidSelectedOptionId("");
      setOcidStatusMessage("");
      stopRoundEndTickSound({ fadeMs: 80 });
      const voteEndsAt = Number(payload?.voteEndsAt);
      if (Number.isFinite(voteEndsAt)) {
        setServerEndsAt(voteEndsAt);
        setServerRoundDurationMs(Math.max(1, voteEndsAt - getNowServerMs()));
        setTick(Math.max(0, Math.ceil((voteEndsAt - getNowServerMs()) / 1000)));
      }
      setStatusMessageWithHold("Vote OCID", 1800);
    }

    function onOcidVoteUpdated(payload = {}) {
      if (!shouldHandleLiveRoundSocketEvents(payload?.roomId)) return;
      if (!payload || typeof payload !== "object") return;
      setOcidVote((prev) => {
        if (!prev || (payload.roundId && prev.roundId && payload.roundId !== prev.roundId)) {
          return payload;
        }
        return {
          ...prev,
          ...payload,
          voteEndsAt: prev.voteEndsAt || payload.voteEndsAt,
          definition: prev.definition || payload.definition,
        };
      });
    }

    function onTrophiesUpdated(payload) {
      if (!shouldHandleLiveRoundSocketEvents(payload?.roomId)) return;
      const updates = Array.isArray(payload?.updates) ? payload.updates : [];
      if (!updates.length) return;
      const selfId = installId;
      if (!selfId) return;
      const entry = updates.find((u) => u?.installId === selfId);
      if (!entry) return;
      setTrophyStatus((prev) => ({
        ...(prev || {}),
        trophies: entry.newTrophies,
        league: entry.league,
        progress: entry.progress || prev?.progress,
        shieldCount: entry.shieldCount ?? prev?.shieldCount ?? 0,
        shieldFloor: entry.shieldFloor ?? prev?.shieldFloor ?? 0,
        updatedAt: entry.updatedAt || Date.now(),
        lastDelta: entry.delta,
        lastTournamentId: payload?.tournamentId || null,
      }));
      setTrophyHistory((prev) => {
        const next = [
          {
            ts: entry.updatedAt || Date.now(),
            delta: entry.delta,
            trophies: entry.newTrophies,
            league: entry.league,
            tournamentId: payload?.tournamentId || null,
          },
          ...(prev || []),
        ];
        return next.slice(0, 10);
      });
    }

    function onGobblarsAwarded(payload = {}) {
      if (!payload || typeof payload !== "object") return;
      const amount = Math.max(0, Math.trunc(Number(payload?.amount) || 0));
      const balance = Number(payload?.balance);
      if (Number.isFinite(balance)) {
        setGobblarsBalance(Math.max(0, Math.trunc(balance)));
        gobblarsKnownBalanceRef.current = Math.max(0, Math.trunc(balance));
      }
      if (!shouldHandleLiveRoundSocketEvents(payload?.roomId)) return;
      if (!amount) return;
      const awardKind = String(payload?.kind || "").toLowerCase();
      if (awardKind === "live_gobble") {
        const message =
          amount >= 2
            ? `Double gobble ! +${amount} Gobblars`
            : `Gobble ! +${amount} Gobblar`;
        const timerId = window.setTimeout(() => {
          gobblarToastDelayTimersRef.current.delete(timerId);
          showToastRef.current?.(message, 3000, {
            iconSrc: "/Gobblars.png",
            iconAlt: "Gobblars",
            position: "top-left",
          });
        }, 1000);
        gobblarToastDelayTimersRef.current.add(timerId);
        return;
      }
      const medalKey = String(payload?.medal || "").toLowerCase();
      const medalLabel =
        medalKey === "gold"
          ? "or"
          : medalKey === "silver"
          ? "argent"
          : medalKey === "bronze"
          ? "bronze"
          : "";
      const message = medalLabel
        ? `Médaille ${medalLabel}: +${amount} Gobblars`
        : `+${amount} Gobblars`;
      showToastRef.current?.(message, 3000, {
        iconSrc: "/Gobblars.png",
        iconAlt: "Gobblars",
      });
    }

    function onModerationNotice(payload = {}) {
      const message =
        typeof payload?.message === "string" && payload.message.trim()
          ? payload.message.trim()
          : "Action de moderation appliquee.";
      clearSavedSession();
      isLoggedInRef.current = false;
      setIsLoggedIn(false);
      setConnectionError(message);
      setLoginError(message);
      showToastRef.current?.(message, 8000);
    }

    function onDevGlobalAnnouncement(payload = {}) {
      showGlobalRedAnnouncement(payload, 6500);
    }

    function onTournamentLobbyUpdate(payload = {}) {
      if (!shouldHandleLiveRoundSocketEvents(payload?.roomId)) return;
      if (!payload || typeof payload !== "object") return;
      setTournamentLobby(payload);
      const clientRoundInProgress =
        phaseRef.current === "playing" ||
        !!pendingRoundEndRef.current ||
        !!outroInFlightRef.current;
      if (
        !clientRoundInProgress &&
        payload.isOpen &&
        (payload.phase === "ready" || payload.phase === "countdown" || payload.phase === "intro")
      ) {
        setPhase("lobby");
        setServerStatus("waiting");
      }
    }

    roundHandlersRef.current.onRoundStarted = onRoundStarted;
    roundHandlersRef.current.onRoundEnded = onRoundEnded;
    roundHandlersRef.current.onBreakStarted = onBreakStarted;

    return socket.bind({
      announcement: onAnnouncement,
      announcements: onAnnouncements,
      breakStarted: onBreakStarted,
      "chat:history": onChatHistory,
      "chat:message_delete": onChatMessageDelete,
      "chat:message_reaction": onChatReactionUpdate,
      "chat:message_update": onChatMessageUpdate,
      chatMessage: onChatNew,
      cultureThemeChallenge: onCultureThemeChallenge,
      "dev:globalAnnouncement": onDevGlobalAnnouncement,
      gobblarsAwarded: onGobblarsAwarded,
      medalsUpdate: onMedalsUpdate,
      "moderation:notice": onModerationNotice,
      ocidVoteStarted: onOcidVoteStarted,
      ocidVoteUpdated: onOcidVoteUpdated,
      playersUpdate: onPlayersUpdate,
      rankingUpdate: onRankingUpdate,
      roundEnded: onRoundEnded,
      roundPreparing: onRoundPreparing,
      roundStarted: onRoundStarted,
      specialHint: onSpecialHint,
      specialSolved: onSpecialSolved,
      tournamentLobbyUpdate: onTournamentLobbyUpdate,
      trophiesUpdated: onTrophiesUpdated,
    });
  }, []);
}
