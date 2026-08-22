import React from "react";
import { useChatDraft } from "../../features/chat/useChatDraft.js";
import { useChatPresentation } from "../../features/chat/useChatPresentation.js";
import { getViewportSize } from "../../app/adapters/deviceCapabilities.js";
import {
  CHAT_DESKTOP_FONT_SCALE_MAX,
  CHAT_DESKTOP_FONT_SCALE_MIN,
  CHAT_DESKTOP_FONT_SCALE_STEP,
  QUICK_REPLIES,
} from "../chat/chatPresentationConfig.js";
import RankingWidgetMobile from "../RankingWidgetMobile.jsx";
import {
  formatChatMessageTime,
  formatChatUnreadSuffix,
  getChatMessageReactionEntries,
  getChatMessageReplyPreview,
  isEditedChatMessage,
  isSystemAuthor,
} from "../../utils/chatMessages.js";
import { clampValue, formatNumber } from "../../utils/numbers.js";
import { getVocabLevelMeta } from "../../vocabRanks.js";
import WeeklyNickLine from "../stats/WeeklyNickLine.jsx";
import {
  formatMsShort,
  formatWeeklyDate,
  formatWeeklyDayTime,
  getWeeklyEntryKey,
  getWeeklyMetricValue,
  hasWeeklyChanges,
} from "../stats/weeklyStatsModel.js";

export default function TournamentFinaleScreen({
  appearance,
  chat,
  finale,
  identity,
  overlays,
  weekly,
}) {
  const {
    assetVersion,
    chatDesktopFontScale,
    darkMode,
    desktopChatFontPx,
    desktopChatInputFontPx,
    desktopChatInputLineHeightPx,
    desktopChatLineHeightPx,
    desktopChatMetaFontPx,
    desktopChatMetaLineHeightPx,
    desktopChatMicroFontPx,
    desktopChatQuickReplyFontPx,
    desktopChatScaleLabel,
    isMobileLayout,
    isSettingsOpen,
  } = appearance;
  const {
    beginChatEditFromMessage,
    blockedCount,
    chatEditTarget,
    chatInputDisabled,
    chatInputPlaceholder,
    chatInputRef,
    chatInputType,
    chatMessagesUnreadCount,
    chatReplyTarget,
    clearChatEditTarget,
    clearChatReplyTarget,
    deleteOwnChatMessage,
    getLiveNickClassName,
    handleChatDesktopFontScaleChange,
    handleChatInputFocus,
    handleChatInputKeyDown,
    handleDesktopChatScroll,
    lastMessageId: lastMessageIdProp,
    openDesktopChatReactionDetails,
    openDesktopChatReactionPicker,
    openUserMenu,
    renderBlockedListPanel,
    safeChatTab,
    scheduleCloseDesktopChatReactionDetails,
    setChatDesktopListNode,
    setChatReplyTargetFromMessage,
    setChatTab,
    setIsChatRulesOpen,
    setIsSettingsOpen,
    setShowBlockedList,
    submitChat,
    visibleMessages: visibleMessagesProp,
  } = chat;
  const { chatInput, setChatInput } = useChatDraft();
  const { lastMessageId, visibleMessages } = useChatPresentation();
  const {
    FINALE_WEEKLY_BOARDS,
    TOURNAMENT_TOTAL_ROUNDS,
    breakCountdown,
    duelBlueScore,
    duelRedScore,
    finaleBaselineBoards,
    finaleBaselineRankMaps,
    finaleBaselineValueMaps,
    finalePage,
    finaleScrollRef,
    getTournamentPoints,
    gobbleAwardsForLive,
    goToFinalePage,
    handleFinaleTouchEnd,
    handleFinaleTouchMove,
    handleFinaleTouchStart,
    nickDecorationKey,
    renderNickSuffix,
    renderRankDelta,
    renderTournamentTotalRightLabel,
    shiftFinalePage,
    stableCanOpenPlayerProfile,
    stableOpenPlayerProfile,
    tournament,
    tournamentBaselineRef,
    tournamentDuelDeltaRef,
    tournamentFinaleMedals,
    tournamentFinaleSummary,
    tournamentRanking,
    tournamentRef,
  } = finale;
  const { installId, selfNick } = identity;
  const { aboutModalView, chatOverlays, globalChatLayer, settingsMenuView } = overlays;
  const {
    dedupeWeeklyEntries,
    getImageUrl,
    getUserIdFromPlayerProfileTarget,
    isCrownedEntry,
    openDefinition,
    openPlayerProfile,
    renderCrownIcon,
    weeklyBoardData,
    weeklyLimit,
    weeklyStatsError,
    weeklyStatsLoading,
    weeklyVocabSelfRank,
    weeklyVocabLookup,
    weeklyWeekNumber,
  } = weekly;

  function renderRankDeltaIndicator(delta) {
    if (!delta) return null;
    const up = delta > 0;
    return (
      <span
        className={`text-[10px] font-black tabular-nums ${
          up ? "text-emerald-600" : "text-red-600"
        }`}
        title={up ? `+${delta} places` : `${delta} places`}
      >
        {up ? "\u25B2" : "\u25BC"}
        {Math.abs(delta)}
      </span>
    );
  }

  function renderFinaleWeeklyRow(
    boardKey,
    entry,
    idx,
    {
      showVocabIcon = false,
      baselineRankMap = null,
      baselineValueMap = null,
      showChanges = false,
    } = {}
  ) {
    if (!entry) return null;
    const rank = idx + 1;
    const isTotalScoreBoard = boardKey === "totalScore";
    const achieved = entry.achievedAt
      ? isTotalScoreBoard
        ? formatWeeklyDayTime(entry.achievedAt)
        : formatWeeklyDate(entry.achievedAt)
      : null;
    const baseNick = entry.nick || "Joueur";
    const entryKey = getWeeklyEntryKey(entry);
    const vocabEntryKey =
      entry.playerKey || (entry.nick ? String(entry.nick).trim().toLowerCase() : null);
    const vocabCountForRow =
      vocabEntryKey && weeklyVocabLookup.has(vocabEntryKey)
        ? weeklyVocabLookup.get(vocabEntryKey)
        : null;
    const resolvedVocabCount = Number.isFinite(vocabCountForRow) ? vocabCountForRow : 0;
    const vocabMetaForRow =
      showVocabIcon && boardKey === "vocab" ? getVocabLevelMeta(resolvedVocabCount) : null;

    const valueParts = [];
    if (boardKey === "medals") {
      valueParts.push(`${formatNumber(entry.total) ?? 0}`);
    } else if (boardKey === "mostWordsInGame") {
      valueParts.push(`${formatNumber(entry.wordsCount) ?? 0} mots`);
    } else if (boardKey === "totalScore") {
      valueParts.push(`${formatNumber(entry.totalScore) ?? 0} pts`);
    } else if (boardKey === "bestWord") {
      valueParts.push(`${formatNumber(entry.pts) ?? 0} pts`);
    } else if (boardKey === "longestWord") {
      valueParts.push(`${formatNumber(entry.len) ?? 0} lettres`);
    } else if (boardKey === "bestSpecial3Score") {
      valueParts.push(`${formatNumber(entry.pts) ?? 0} pts`);
    } else if (boardKey === "bestRoundScore") {
      valueParts.push(`${formatNumber(entry.pts) ?? 0} pts`);
    } else if (boardKey === "vocab") {
      valueParts.push(`${formatNumber(entry.vocabCount) ?? 0} mots`);
    } else if (boardKey === "weeklyVocab") {
      valueParts.push(`${formatNumber(entry.weeklyVocabCount ?? entry.vocabCount) ?? 0} mots`);
    } else if (boardKey === "bestTimeTargetLong" || boardKey === "bestTimeTargetScore") {
      valueParts.push(formatMsShort(entry.ms) || "");
    } else if (boardKey === "mostGobbles") {
      valueParts.push(`${formatNumber(entry.gobbles) ?? 0} gobbles`);
    }

    const detailParts = [];
    if (boardKey === "medals") {
      detailParts.push(`\u{1F947} ${formatNumber(entry.gold) ?? 0}`);
      detailParts.push(`\u{1F948} ${formatNumber(entry.silver) ?? 0}`);
      detailParts.push(`\u{1F949} ${formatNumber(entry.bronze) ?? 0}`);
    }
    if (boardKey === "totalScore" && Number.isFinite(entry.roundsPlayed)) {
      detailParts.push(`${formatNumber(entry.roundsPlayed)} manches`);
    }
    const hasWord =
      (boardKey === "bestWord" ||
        boardKey === "longestWord" ||
        boardKey === "bestTimeTargetLong" ||
        boardKey === "bestTimeTargetScore") &&
      entry.word;
    const wordLabel = hasWord ? entry.word : "";
    const wordButton =
      hasWord && entry.word ? (
        <button
          type="button"
          className={`ml-1 inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[11px] ${
            darkMode
              ? "bg-slate-800 border-slate-600 text-slate-100"
              : "bg-white border-gray-300 text-gray-700"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            openDefinition(entry.word);
          }}
          aria-label="Voir la definition"
          title="Voir la definition"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.65" y1="16.65" x2="21" y2="21" />
          </svg>
        </button>
      ) : null;

    const isTimeBoard =
      boardKey === "bestTimeTargetLong" || boardKey === "bestTimeTargetScore";
    const currentValue = getWeeklyMetricValue(boardKey, entry);
    const prevRank =
      entryKey && baselineRankMap ? baselineRankMap.get(entryKey) : null;
    const rankDelta = Number.isFinite(prevRank) ? prevRank - rank : 0;
    const baseValue =
      entryKey && baselineValueMap ? baselineValueMap.get(entryKey) : null;
    let deltaLabel = null;
    if (showChanges && Number.isFinite(currentValue) && Number.isFinite(baseValue)) {
      if (isTimeBoard && currentValue < baseValue) {
        const deltaSec = Math.max(0, Math.round((baseValue - currentValue) / 1000));
        if (deltaSec > 0) deltaLabel = `-${deltaSec}s`;
      }
      if (!isTimeBoard && currentValue > baseValue) {
        const deltaVal = Math.round(currentValue - baseValue);
        if (deltaVal > 0) deltaLabel = `+${deltaVal}`;
      }
    }

    const metaTokens = [];
    if (detailParts.length > 0) metaTokens.push(detailParts.join(" \u00b7 "));
    if (achieved) metaTokens.push(achieved);
    const metaLabel = metaTokens.length > 0 ? `\u00b7 ${metaTokens.join(" \u00b7 ")}` : "";
    const selfNickLower = selfNick ? String(selfNick).trim().toLowerCase() : "";
    const entryNickLower = entry.nick ? String(entry.nick).trim().toLowerCase() : "";
    const isSelfEntry =
      (installId && entry.installId && entry.installId === installId) ||
      (installId && entry.playerKey && entry.playerKey === `install:${installId}`) ||
      (selfNickLower && entryNickLower && entryNickLower === selfNickLower) ||
      (selfNickLower && entry.playerKey && entry.playerKey === `nick:${selfNickLower}`);
    const profileUserId = getUserIdFromPlayerProfileTarget(entry);
    const openWeeklyProfile = profileUserId
      ? (e) => {
          e.stopPropagation();
          openPlayerProfile({ userId: profileUserId, nick: baseNick });
        }
      : null;

    return (
      <div
        key={`${boardKey}-${entry.playerKey || entry.word || entry.roundId || idx}`}
        className={`flex items-center justify-between gap-3 py-1 border-b border-slate-200/60 dark:border-white/10 last:border-0 ${
          isSelfEntry
            ? darkMode
              ? "bg-emerald-900/30 text-emerald-100"
              : "bg-emerald-50 text-emerald-800"
            : ""
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-7 text-center text-xs font-bold text-amber-500">{rank}</span>
          <div className="min-w-0">
            <WeeklyNickLine
              nick={baseNick}
              metaLabel={metaLabel}
              vocabImageUrl={
                vocabMetaForRow?.imageKey ? getImageUrl(vocabMetaForRow.imageKey) : ""
              }
              vocabLabel={vocabMetaForRow?.label || "Niveau"}
              crownIcon={
                isCrownedEntry(baseNick, entry) ? renderCrownIcon("shrink-0") : null
              }
              onOpenProfile={openWeeklyProfile}
            />
            {hasWord ? (
              <div className="text-[10px] opacity-60 truncate flex items-center gap-1">
                <button
                  type="button"
                  className="truncate font-semibold hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDefinition(wordLabel);
                  }}
                >
                  {wordLabel}
                </button>
                {wordButton}
              </div>
            ) : null}
          </div>
        </div>
        <div className="text-right text-xs font-bold tabular-nums whitespace-nowrap flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {showChanges ? renderRankDeltaIndicator(rankDelta) : null}
            <span>{valueParts.join(" ")}</span>
          </div>
          {deltaLabel ? (
            <span className="text-[10px] font-black tabular-nums text-emerald-600">
              {deltaLabel}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

    const baselineRankingMap = tournamentBaselineRef.current.rankingMap;
    const baselineRound = tournamentBaselineRef.current.rankingRound;
    const finaleSummaryRanking = Array.isArray(tournamentFinaleSummary?.ranking)
      ? tournamentFinaleSummary.ranking.filter((entry) => getTournamentPoints(entry) > 0)
      : [];
    const finaleDeltaByNick = new Map();
    if (Array.isArray(tournamentRanking)) {
      tournamentRanking.forEach((entry) => {
        if (!entry?.nick || !Number.isFinite(entry.delta)) return;
        finaleDeltaByNick.set(entry.nick, entry.delta);
      });
    }
    const currentRound = Number.isFinite(tournament?.round)
      ? tournament.round
      : TOURNAMENT_TOTAL_ROUNDS;
    const useBaselineDelta =
      baselineRankingMap && baselineRankingMap.size > 0
        ? !Number.isFinite(baselineRound) ||
          !Number.isFinite(currentRound) ||
          baselineRound < currentRound
        : false;
    const finaleRanking = finaleSummaryRanking.map((e, idx) => {
      const posNow = idx + 1;
      const basePos = baselineRankingMap?.get(e.nick);
      const fallbackDelta =
        finaleDeltaByNick.has(e.nick)
          ? finaleDeltaByNick.get(e.nick)
          : e.delta ?? 0;
      const delta =
        useBaselineDelta && Number.isFinite(basePos) && Number.isFinite(posNow)
          ? basePos - posNow
          : fallbackDelta;
      return {
        nick: e.nick,
        score: typeof e.points === "number" ? e.points : e.score || 0,
        gobbles: typeof e.gobbles === "number" ? e.gobbles : 0,
        rightLabel: renderTournamentTotalRightLabel(
          typeof e.points === "number" ? e.points : e.score || 0,
          typeof e.gobbles === "number" ? e.gobbles : 0
        ),
        roundScoreSum: Number(e.roundScoreSum) || 0,
        tieBreakRoundScore:
          Number(e.tieBreakRoundScore) || Number(e.roundScoreSum) || 0,
        tieBreakBy:
          typeof e.tieBreakBy === "string" && e.tieBreakBy
            ? e.tieBreakBy
            : null,
        tieGroupSize: Number(e.tieGroupSize) || 0,
        showTieBreakBadge: true,
        delta,
        isDailyChampion: !!e.isDailyChampion,
        weeklyVocabPodiumRank: Number(e.weeklyVocabPodiumRank) || 0,
        isWeeklyVocabChampion: !!e.isWeeklyVocabChampion,
      };
    });
    const winnerNick = tournamentFinaleSummary.winnerNick || "Joueur";
    const bc = typeof breakCountdown === "number" ? Math.max(0, breakCountdown) : null;
    const finaleTournamentId = String(
      tournament?.id || tournamentRef.current?.id || ""
    ).trim();
    const duelTournamentDelta =
      finaleTournamentId &&
      tournamentDuelDeltaRef.current?.tournamentId === finaleTournamentId
        ? {
            red: Math.max(0, Number(tournamentDuelDeltaRef.current.red) || 0),
            blue: Math.max(0, Number(tournamentDuelDeltaRef.current.blue) || 0),
          }
        : { red: 0, blue: 0 };
    const finaleBoards = FINALE_WEEKLY_BOARDS;
    const finalePagesCount = 1 + finaleBoards.length;
    const finaleCanNavigate = !isMobileLayout && finalePagesCount > 1;
    const { height: finaleViewportHeight } = getViewportSize();
    const finaleSafeHeight = Math.max(0, finaleViewportHeight || 0);
    const finalePaddingY = isMobileLayout ? 12 : 24;
    const finaleHeaderHeight = clampValue(
      Math.round(finaleSafeHeight * (isMobileLayout ? 0.22 : 0.24)),
      isMobileLayout ? 110 : 140,
      isMobileLayout ? 200 : 240
    );
    const finaleDotsHeight = clampValue(
      Math.round(finaleSafeHeight * 0.055),
      18,
      28
    );
    const finaleContentHeight = Math.max(
      0,
      finaleSafeHeight - finalePaddingY * 2 - finaleHeaderHeight - finaleDotsHeight
    );
    const finaleShellClass = isMobileLayout
      ? "relative z-10 max-w-6xl mx-auto px-4"
      : "relative z-10 max-w-[1680px] mx-auto px-4";
    const finaleColumnsClass = isMobileLayout
      ? "min-h-0 h-full flex flex-col gap-3"
      : "min-h-0 h-full flex items-stretch gap-3";
    const finaleMainColumnClass = isMobileLayout
      ? "flex flex-col min-h-0 h-full gap-3"
      : "min-h-0 h-full flex flex-col gap-3 flex-1 min-w-0 max-w-[1080px] mx-auto";
    const finaleShellStyle = {
      minHeight: "100svh",
      height: finaleSafeHeight ? `${finaleSafeHeight}px` : "100svh",
      paddingTop: `${finalePaddingY}px`,
      paddingBottom: `${finalePaddingY}px`,
    };
    const finaleHeaderStyle = { height: `${finaleHeaderHeight}px` };
    const finaleCarouselStyle = finaleContentHeight
      ? { height: `${finaleContentHeight}px` }
      : undefined;
    const finaleDotsStyle = { height: `${finaleDotsHeight}px` };
    const finaleSlideCardStyle = { height: "100%", minHeight: 0 };
    const finaleCardPaddingClass = isMobileLayout ? "p-3" : "p-4";
    const renderFinaleRankingCard = () => (
      <div
        className={`bg-white/90 dark:bg-slate-900/70 border border-slate-200/70 dark:border-white/10 rounded-2xl ${finaleCardPaddingClass} shadow-xl flex flex-col overflow-hidden h-full`}
        style={finaleSlideCardStyle}
      >
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <div className="font-extrabold">Classement general</div>
          <div className="text-xs text-slate-500 dark:text-slate-300 whitespace-nowrap">
            Manche {TOURNAMENT_TOTAL_ROUNDS}/{TOURNAMENT_TOTAL_ROUNDS}
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <RankingWidgetMobile
            fullRanking={finaleRanking}
            selfNick={selfNick}
            darkMode={darkMode}
            expanded={true}
            animateRank={false}
            showWheel={false}
            flatStyle={true}
            fitHeight={true}
            assetVersion={assetVersion}
            gobbleWordAwardsByNick={gobbleAwardsForLive}
            getNickClassName={getLiveNickClassName}
            nickDecorationKey={nickDecorationKey}
            onPlayerNickClick={stableOpenPlayerProfile}
            isPlayerNickClickable={stableCanOpenPlayerProfile}
            renderNickSuffix={
              (nick, entry) => renderNickSuffix(nick, entry, tournamentFinaleMedals)
            }
            showGobbleWordAwards={true}
            renderAfterRank={renderRankDelta}
          />
        </div>
      </div>
    );
    const renderFinaleWeeklyCard = (boardMeta) => {
      if (!boardMeta) return null;
      const entries = dedupeWeeklyEntries(
        boardMeta.key,
        weeklyBoardData[boardMeta.key],
        weeklyLimit
      );
      const baselineEntries = dedupeWeeklyEntries(
        boardMeta.key,
        finaleBaselineBoards[boardMeta.key],
        weeklyLimit
      );
      const hasChanges = hasWeeklyChanges(
        boardMeta.key,
        entries,
        finaleBaselineRankMaps[boardMeta.key],
        finaleBaselineValueMaps[boardMeta.key]
      );
      return (
        <div
          className={`bg-white/90 dark:bg-slate-900/70 border border-slate-200/70 dark:border-white/10 rounded-2xl ${finaleCardPaddingClass} shadow-xl flex flex-col overflow-hidden h-full`}
          style={finaleSlideCardStyle}
        >
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <div className="font-extrabold">Classement hebdo - {boardMeta.label}</div>
            <div className="text-xs text-slate-500 dark:text-slate-300 whitespace-nowrap">
              {weeklyWeekNumber ? `Semaine ${weeklyWeekNumber}` : "Semaine en cours"}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-300 mb-1">
            {boardMeta.subtitle || ""}
          </div>
          {boardMeta.key === "weeklyVocab" ? (
            <div className="mb-2 rounded-xl border border-amber-300/50 bg-gradient-to-r from-amber-100/90 via-white/70 to-yellow-100/80 px-3 py-2 text-slate-900 dark:from-amber-300/15 dark:via-slate-900/70 dark:to-amber-500/10 dark:text-amber-50">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-[11px] font-semibold leading-snug">
                  <span className="font-black uppercase tracking-widest">Course vocab</span>
                  <span className="block opacity-85">
                    Le podium de la semaine aura son pseudo en or, argent et bronze la semaine suivante.
                  </span>
                </div>
                <div className="shrink-0 rounded-full border border-amber-400 bg-amber-100 px-2 py-1 text-xs font-black tabular-nums text-amber-800 dark:border-amber-200/70 dark:bg-amber-300/20 dark:text-amber-100">
                  {Number.isFinite(weeklyVocabSelfRank) ? `#${weeklyVocabSelfRank}` : "-"}
                </div>
              </div>
            </div>
          ) : null}
          {!hasChanges && baselineEntries.length > 0 ? (
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-300 mb-1">
              Aucun changement
            </div>
          ) : null}
          <div className="min-h-0 flex-1">
            {weeklyStatsLoading ? (
              <div className="h-full flex items-center justify-center text-sm opacity-70">
                Chargement...
              </div>
            ) : weeklyStatsError ? (
              <div className="h-full flex items-center justify-center text-sm text-red-400">
                Erreur ({weeklyStatsError})
              </div>
            ) : entries.length > 0 ? (
              <div className="h-full overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1">
                {entries.map((entry, entryIdx) =>
                  renderFinaleWeeklyRow(boardMeta.key, entry, entryIdx, {
                    showVocabIcon: boardMeta.key === "vocab",
                    baselineRankMap: finaleBaselineRankMaps[boardMeta.key],
                    baselineValueMap: finaleBaselineValueMaps[boardMeta.key],
                    showChanges: hasChanges,
                  })
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm opacity-70">
                Pas encore de stats cette semaine.
              </div>
            )}
          </div>
        </div>
      );
    };
    const renderActiveFinalePage = () => {
      if (finalePage <= 0) return renderFinaleRankingCard();
      return renderFinaleWeeklyCard(finaleBoards[finalePage - 1] || null);
    };
    const finaleSettingsButtonClass = isMobileLayout
      ? `fixed top-3 right-3 z-[20012] h-10 w-10 rounded-full border flex items-center justify-center transition ${
          darkMode
            ? "bg-slate-800/90 border-white/10 text-slate-100 hover:bg-slate-700/90"
            : "bg-white border-slate-300 text-slate-700 hover:bg-slate-100"
        }`
      : `fixed top-3 left-1/2 -translate-x-1/2 z-[20012] h-10 w-10 rounded-full border flex items-center justify-center transition ${
          darkMode
            ? "bg-slate-800/90 border-white/10 text-slate-100 hover:bg-slate-700/90"
            : "bg-white border-slate-300 text-slate-700 hover:bg-slate-100"
        }`;
    return (
      <>
        <div
          className={`min-h-screen relative ${
            darkMode
              ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white"
              : "bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900"
          }`}
        >          {!isSettingsOpen && (
            <button
              type="button"
              className={finaleSettingsButtonClass}
              onClick={() => setIsSettingsOpen(true)}
              aria-label="Ouvrir les paramètres"
            >
              <span className="material-symbols-outlined text-[24px] leading-none">settings</span>
            </button>
          )}
          <div className={finaleShellClass} style={finaleShellStyle}>
            <div className={finaleColumnsClass}>
              <div className={finaleMainColumnClass}>
              <div className="text-center flex flex-col justify-center" style={finaleHeaderStyle}>
                <div className="text-sm font-semibold tracking-widest opacity-80">
                  FIN DU MINI-TOURNOI
                </div>
                <div className="mt-1 text-3xl sm:text-4xl font-black tracking-tight">
                  Bravo {winnerNick} !
                </div>
                <div className="mt-2 text-sm font-bold opacity-90">
                  {bc != null
                    ? `Retour au salon dans : ${bc}s`
                    : "Retour au salon imminent..."}
                </div>
                <div
                  className={`mt-2 mx-auto w-full max-w-[820px] rounded-xl border px-3 py-2 ${
                    darkMode
                      ? "bg-slate-900/65 border-white/10 text-slate-100"
                      : "bg-white/90 border-slate-200 text-slate-800"
                  }`}
                >
                  <div className="text-center text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.14em] opacity-85">
                    Duel mini-tournoi
                  </div>
                  <div className="mt-1 text-center text-lg sm:text-xl font-black tabular-nums leading-none">
                    <span className="text-red-500">🔴 {duelRedScore}</span>{" "}
                    <span className="opacity-60">VS</span>{" "}
                    <span className="text-blue-500">{duelBlueScore} 🔵</span>
                  </div>
                  <div className="mt-1 text-center text-[11px] sm:text-xs font-bold tabular-nums text-emerald-500">
                    🔴 +{formatNumber(duelTournamentDelta.red)} · 🔵 +{formatNumber(duelTournamentDelta.blue)}
                  </div>
                </div>
              </div>

              <div
                className="relative min-h-0 flex flex-col overflow-hidden"
                style={finaleCarouselStyle}
              >
                <div
                  className={`h-full min-h-0 ${
                    finaleCanNavigate ? "grid grid-cols-[92px_minmax(0,1fr)_92px] gap-0 items-stretch" : ""
                  }`}
                >
                  {finaleCanNavigate ? (
                    <div className="h-full min-h-0 flex items-center justify-center">
                      <button
                        type="button"
                        className={`z-20 h-14 w-14 rounded-full border flex items-center justify-center shadow-xl transition ${
                          darkMode
                            ? "bg-slate-900/85 border-white/20 text-slate-100 hover:bg-slate-800/90 disabled:opacity-40"
                            : "bg-white/90 border-slate-300 text-slate-700 hover:bg-white disabled:opacity-40"
                        }`}
                        onClick={() => shiftFinalePage(-1)}
                        disabled={finalePage <= 0}
                        aria-label="Page précédente"
                        title="Page précédente"
                      >
                        <span className="material-symbols-outlined text-[34px] leading-none">
                          chevron_left
                        </span>
                      </button>
                    </div>
                  ) : null}
                  <div className="h-full min-h-0 overflow-hidden">
                    {isMobileLayout ? (
                      <div
                        className="h-full min-h-0"
                        onTouchStart={handleFinaleTouchStart}
                        onTouchMove={handleFinaleTouchMove}
                        onTouchEnd={handleFinaleTouchEnd}
                        onTouchCancel={handleFinaleTouchEnd}
                      >
                        {renderActiveFinalePage()}
                      </div>
                    ) : (
                      <div
                        ref={finaleScrollRef}
                        className="w-full h-full min-h-0"
                        onTouchStart={handleFinaleTouchStart}
                        onTouchMove={handleFinaleTouchMove}
                        onTouchEnd={handleFinaleTouchEnd}
                        onTouchCancel={handleFinaleTouchEnd}
                      >
                        {renderActiveFinalePage()}
                      </div>
                    )}
                  </div>
                  {finaleCanNavigate ? (
                    <div className="h-full min-h-0 flex items-center justify-center">
                      <button
                        type="button"
                        className={`z-20 h-14 w-14 rounded-full border flex items-center justify-center shadow-xl transition ${
                          darkMode
                            ? "bg-slate-900/85 border-white/20 text-slate-100 hover:bg-slate-800/90 disabled:opacity-40"
                            : "bg-white/90 border-slate-300 text-slate-700 hover:bg-white disabled:opacity-40"
                        }`}
                        onClick={() => shiftFinalePage(1)}
                        disabled={finalePage >= finalePagesCount - 1}
                        aria-label="Page suivante"
                        title="Page suivante"
                      >
                        <span className="material-symbols-outlined text-[34px] leading-none">
                          chevron_right
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center justify-center gap-2" style={finaleDotsStyle}>
                  {Array.from({ length: finalePagesCount }, (_, idx) => {
                    const active = finalePage === idx;
                    return (
                      <button
                        key={`finale-dot-${idx}`}
                        type="button"
                        className={`h-2.5 w-2.5 rounded-full transition ${
                          active
                            ? darkMode
                              ? "bg-slate-100"
                              : "bg-slate-900"
                            : darkMode
                            ? "bg-white/30"
                            : "bg-slate-300"
                        } ${active ? "scale-110" : ""}`}
                        aria-label={`Page ${idx + 1}`}
                        aria-current={active ? "true" : undefined}
                        onClick={() => {
                          goToFinalePage(idx);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
              </div>
            {!isMobileLayout ? (
              <div className="w-[340px] xl:w-[360px] shrink-0 min-h-0 h-full">
                <div className="bg-white/90 dark:bg-slate-900/70 border border-slate-200/70 dark:border-white/10 rounded-2xl p-4 shadow-xl flex flex-col min-h-0 h-full">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-bold text-center">Chat</h2>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className={`text-[11px] font-semibold ${
                        darkMode ? "text-slate-300" : "text-slate-600"
                      }`}
                      onClick={() => setIsChatRulesOpen(true)}
                    >
                      Règles
                    </button>
                    <button
                      type="button"
                      className={`text-[11px] font-semibold ${
                        darkMode ? "text-amber-300" : "text-blue-600"
                      }`}
                      onClick={() => setShowBlockedList((prev) => !prev)}
                    >
                      Joueurs bloqués ({blockedCount})
                    </button>
                  </div>
                </div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div
                    className={`inline-flex rounded-full border p-1 ${
                      darkMode ? "border-white/10 bg-slate-800/70" : "border-slate-200 bg-slate-100"
                    }`}
                  >
                    <button
                      type="button"
                      className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${
                        safeChatTab === "messages"
                          ? "bg-blue-600 text-white"
                          : darkMode
                          ? "text-slate-200"
                          : "text-slate-700"
                      }`}
                      onClick={() => setChatTab("messages")}
                    >
                      Messages{formatChatUnreadSuffix(chatMessagesUnreadCount)}
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${
                        safeChatTab === "system"
                          ? "bg-orange-500 text-white"
                          : darkMode
                          ? "text-slate-200"
                          : "text-slate-700"
                      }`}
                      onClick={() => setChatTab("system")}
                    >
                      Système
                    </button>
                  </div>
                  <label
                    className={`ml-auto inline-flex max-w-full min-w-[7rem] items-center gap-2 rounded-full border px-2 py-1 ${
                      darkMode
                        ? "border-white/10 bg-slate-800/70 text-slate-100"
                        : "border-slate-200 bg-slate-100 text-slate-700"
                    }`}
                    title={`Taille du chat : ${desktopChatScaleLabel}`}
                  >
                    <span
                      className="font-extrabold text-base leading-none shrink-0"
                      style={{
                        fontFamily: "\"GobblePerfectPen\", \"KGPerfectPenmanship\", cursive",
                      }}
                      aria-hidden="true"
                    >
                      Aa
                    </span>
                    <input
                      type="range"
                      min={CHAT_DESKTOP_FONT_SCALE_MIN}
                      max={CHAT_DESKTOP_FONT_SCALE_MAX}
                      step={CHAT_DESKTOP_FONT_SCALE_STEP}
                      value={chatDesktopFontScale}
                      onChange={(e) => handleChatDesktopFontScaleChange(e.target.value)}
                      className="min-w-0 flex-1 basis-16 max-w-24 accent-blue-600"
                      aria-label="Taille de la police du chat"
                    />
                  </label>
                </div>
                {renderBlockedListPanel()}
                <div
                  ref={setChatDesktopListNode}
                  className="flex-1 min-h-0 border rounded px-2 py-1 pb-4 bg-white text-xs space-y-1 flex flex-col overflow-y-auto custom-scrollbar custom-scrollbar-gray"
                  style={{ overscrollBehavior: "contain" }}
                  onScroll={handleDesktopChatScroll}
                >
                  {visibleMessages.length === 0 ? (
                    <div className="text-sm text-slate-400 text-center mt-4">
                      {safeChatTab === "system"
                        ? "Aucun log de connexion/déconnexion."
                        : "Aucun message pour l'instant."}
                    </div>
                  ) : null}
                  {visibleMessages.map((msg) => {
                    const author = (msg.nick || msg.author || "Anonyme").trim();
                    const authorInstallId =
                      typeof msg.installId === "string" ? msg.installId : "";
                    const messageTime = formatChatMessageTime(msg);
                    const isEdited = isEditedChatMessage(msg);
                    const systemAuthor = author || "Système";
                    const isSystem = isSystemAuthor(author);
                    const isAmbientBot =
                      !isSystem &&
                      (msg?.meta?.kind === "ambient_bot_chat" ||
                        authorInstallId.startsWith("ambient-bot:"));
                    const isYou =
                      !isAmbientBot &&
                      (authorInstallId ? authorInstallId === installId : author === selfNick);
                    const isLast = msg.id === lastMessageId;
                    const canOpenMenu =
                      !isSystem && authorInstallId && authorInstallId !== installId;
                    const replyPreview = getChatMessageReplyPreview(msg);
                    const reactionEntries = getChatMessageReactionEntries(msg);
                    const replyTargetsSelf = !!(
                      replyPreview &&
                      ((replyPreview.installId &&
                        String(replyPreview.installId).trim() === String(installId || "").trim()) ||
                        (!replyPreview.installId &&
                          String(replyPreview.nick || "").trim() === String(selfNick || "").trim()))
                    );
                    const authorNickClass = getLiveNickClassName(msg, author)
                      ? getLiveNickClassName(msg, author)
                      : isAmbientBot
                      ? darkMode
                        ? "text-slate-400"
                        : "text-amber-900/75"
                      : isYou
                      ? "text-white"
                      : darkMode
                      ? "text-slate-100"
                      : "text-black";

	              return (
	                <div
	                  key={msg.id}
	                  data-chat-row
	                        className={`w-full transition-opacity duration-300 ${
	                          isLast ? "slide-fade-in" : ""
	                        }`}
	                >
                  {isSystem ? (
                          <div className="w-full px-1 py-0.5 italic text-orange-700" style={{ fontSize: `${desktopChatFontPx}px`, lineHeight: `${desktopChatLineHeightPx}px` }}>
                            <div className="flex items-baseline gap-1 flex-wrap">
                              <span className="font-semibold">{systemAuthor}:</span>
	                              {messageTime ? (
	                                <span className="leading-none opacity-70" style={{ fontSize: `${desktopChatMicroFontPx}px` }}>
	                                  {messageTime}
	                                </span>
	                              ) : null}
                                {isEdited ? (
                                  <span className="leading-none opacity-60" style={{ fontSize: `${desktopChatMicroFontPx}px` }}>(modifié)</span>
                                ) : null}
	                              <span>{msg.text}</span>
	                            </div>
                          </div>
	                        ) : (
                          <div className={`w-full flex ${isYou ? "justify-end" : "justify-start"}`}>
	                          <div
	                            className={[
	                              "group/chatmsg max-w-[88%] px-2 rounded-lg",
                                isYou
                                  ? darkMode
                                    ? "bg-blue-500 text-white"
                                    : "bg-blue-600 text-white"
                                  : isAmbientBot
                                  ? darkMode
                                    ? "py-0.5 italic bg-slate-950/45 text-slate-400 border border-slate-800"
                                    : "py-0.5 italic bg-amber-50/60 text-amber-900/70 border border-amber-100"
	                                  : darkMode
	                                  ? "py-1 bg-slate-800 text-slate-100 border border-slate-700"
	                                  : "py-1 bg-slate-100 text-slate-900 border border-slate-200",
	                            ].join(" ")}
                              style={{
                                fontSize: `${isAmbientBot ? Math.max(11, desktopChatFontPx - 2) : desktopChatFontPx}px`,
                                lineHeight: `${isAmbientBot ? Math.max(14, desktopChatLineHeightPx - 3) : desktopChatLineHeightPx}px`,
                              }}
	                          >
                            {replyPreview ? (
                              <div
	                                className={`mb-1 rounded-md border-l-4 px-2 py-1 ${
	                                  replyTargetsSelf
	                                    ? "border-blue-500 bg-blue-50 text-slate-700"
	                                    : darkMode
                                      ? "border-slate-600 bg-slate-700/80 text-slate-200"
	                                      : "border-slate-300 bg-slate-50 text-slate-700"
	                                }`}
                                  style={{ fontSize: `${desktopChatMetaFontPx}px`, lineHeight: `${desktopChatMetaLineHeightPx}px` }}
	                              >
                                <div className="font-semibold">{replyPreview.nick}</div>
                                <div
                                  style={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                  }}
                                >
                                  {replyPreview.text}
                                </div>
                              </div>
                            ) : null}
	                            <div className="flex items-baseline gap-1.5 flex-wrap">
	                              {canOpenMenu ? (
	                                <button
	                                  type="button"
	                                  className={`font-semibold hover:underline ${authorNickClass}`}
	                                  onClick={(e) =>
	                                    openUserMenu(e, {
	                                      nick: author,
                                      userId: msg.userId,
                                      installId: authorInstallId,
                                      messageId: msg.id,
                                    })
                                  }
	                                >
	                                  {author} :
	                                </button>
	                              ) : (
	                                <span
                                    className={`font-semibold ${authorNickClass}`}
                                  >
                                    {author} :
                                  </span>
	                              )}
	                              {messageTime ? (
	                                <span
                                    className={`text-[10px] leading-none ${
                                      isYou
                                        ? "text-white/80"
                                        : darkMode
                                        ? "text-slate-400"
                                        : "text-slate-500"
                                    }`}
                                  >
	                                  {messageTime}
	                                </span>
	                              ) : null}
	                              <span
                                  className={
                                    isYou
                                      ? "text-white"
                                      : isAmbientBot
                                      ? darkMode
                                        ? "text-slate-400"
                                        : "text-amber-900/70"
                                      : darkMode
                                      ? "text-slate-100"
                                      : "text-black"
                                  }
                                >
                                  {msg.text}
                                </span>
	                            </div>
                            {!isYou && !isAmbientBot ? (
                              <div className="mt-1 flex items-center gap-2">
                                <button
                                  type="button"
                                  className="text-[10px] font-semibold text-blue-600 hover:underline"
                                  onClick={() => setChatReplyTargetFromMessage(msg)}
                                >
                                  Répondre
                                </button>
                                <button
                                  type="button"
                                  className="text-[10px] font-semibold text-slate-600 hover:underline"
                                  onClick={(event) => openDesktopChatReactionPicker(event, msg)}
                                >
                                  Réagir
                                </button>
                              </div>
                            ) : isYou ? (
                              <div className="mt-1 flex items-center gap-2">
                                <button
                                  type="button"
                                  className="text-[10px] font-semibold text-amber-600 hover:underline"
                                  onClick={() => beginChatEditFromMessage(msg)}
                                >
                                  Modifier
                                </button>
                                <button
                                  type="button"
                                  className="text-[10px] font-semibold text-rose-600 hover:underline"
                                  onClick={() => deleteOwnChatMessage(msg)}
                                >
                                  Supprimer
                                </button>
                              </div>
                            ) : null}
	                            {reactionEntries.length ? (
	                              <div className="mt-1 flex flex-wrap gap-1">
	                                {reactionEntries.map((entry) => (
                                    <button
                                      key={`${msg.id || "msg"}:${entry.emoji}`}
                                      type="button"
                                      className="h-5 rounded-full border border-slate-300 bg-white px-2 text-[10px] inline-flex items-center gap-1 text-slate-700"
                                      onMouseEnter={(event) =>
                                        openDesktopChatReactionDetails(event, msg, entry)
                                      }
                                      onMouseLeave={() => scheduleCloseDesktopChatReactionDetails()}
                                      onClick={(event) =>
                                        openDesktopChatReactionDetails(event, msg, entry)
                                      }
                                    >
                                      <span>{entry.emoji}</span>
                                      <span>{entry.count}</span>
                                    </button>
                                ))}
	                              </div>
	                            ) : null}
	                          </div>
                          </div>
	                        )}
	                      </div>
	                    );
                  })}
                </div>

                {safeChatTab !== "system" ? (
                  <>
                    {chatEditTarget ? (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-slate-700" style={{ fontSize: `${desktopChatMetaFontPx}px`, lineHeight: `${desktopChatMetaLineHeightPx}px` }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold">Modification du message</div>
                            <div
                              style={{
                                fontSize: `${desktopChatMetaFontPx}px`,
                                lineHeight: `${desktopChatMetaLineHeightPx}px`,
                                display: "-webkit-box",
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {chatEditTarget.text || ""}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="h-6 w-6 rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-600 shrink-0"
                            onClick={clearChatEditTarget}
                            aria-label="Annuler la modification"
                          >
                            x
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {chatReplyTarget ? (
                      <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-slate-700" style={{ fontSize: `${desktopChatMetaFontPx}px`, lineHeight: `${desktopChatMetaLineHeightPx}px` }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold">
                              Réponse à {chatReplyTarget.nick || "Anonyme"}
                            </div>
                            <div
                              style={{
                                fontSize: `${desktopChatMetaFontPx}px`,
                                lineHeight: `${desktopChatMetaLineHeightPx}px`,
                                display: "-webkit-box",
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {chatReplyTarget.text || ""}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="h-6 w-6 rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-600 shrink-0"
                            onClick={clearChatReplyTarget}
                            aria-label="Annuler la réponse"
                          >
                            x
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-2 flex flex-nowrap items-center gap-1.5">
                      {QUICK_REPLIES.map((txt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => submitChat(null, txt)}
                          disabled={chatInputDisabled}
                          className="px-1.5 py-0.5 leading-4 rounded-full border bg-gray-100 hover:bg-gray-200 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ fontSize: `${desktopChatQuickReplyFontPx}px` }}
                        >
                          {txt}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 flex gap-2">
                      <input
                        ref={chatInputRef}
                        type={chatInputType}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        inputMode="text"
                        enterKeyHint="send"
                        data-form-type="other"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        data-autofill="off"
                        aria-autocomplete="none"
                        aria-label="Message du chat"
                        onFocus={handleChatInputFocus}
                        readOnly={chatInputDisabled}
                        aria-disabled={chatInputDisabled}
                        className="flex-1 border rounded px-3 py-2 ios-input chat-input"
                        style={{ fontSize: `${desktopChatInputFontPx}px`, lineHeight: `${desktopChatInputLineHeightPx}px` }}
                        placeholder={chatInputPlaceholder}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={handleChatInputKeyDown}
                      />
                      <button
                        type="button"
                        className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
                        style={{ fontSize: `${desktopChatInputFontPx}px`, lineHeight: `${desktopChatInputLineHeightPx}px` }}
                        disabled={!chatInput.trim() || chatInputDisabled}
                        onClick={() => submitChat(null)}
                      >
                        Envoyer
                      </button>
                    </div>
                  </>
                ) : null}
                </div>
              </div>
            ) : null}
            </div>
          </div>
        </div>
        {settingsMenuView}
        {aboutModalView}
        {globalChatLayer}
        {chatOverlays}
      </>
    );
  }
