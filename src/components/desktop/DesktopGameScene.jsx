import React from "react";
import { createPortal } from "react-dom";
import { getTileColorTextureStyle } from "../../theme/themeConfig.js";
import { formatNumber } from "../../utils/numbers.js";
import { mapDisplayToBoardIndex } from "../../game/gridRotation.js";
import { MASSIVE_BOGGLE_TYPE } from "../../game/specialRoundTypes.js";
import { RoundClockSeconds } from "../../features/clock/RoundClockDisplay.jsx";
import {
  AcceptedWordsCount,
  FoundWordsCount,
  GameScoreValue,
  InputShakeBoundary,
} from "../../features/progress/GameProgressSatellites.jsx";
import {
  DesktopLiveRankingSatellite,
  LivePlayersCount,
} from "../../features/live/LiveRosterSatellites.jsx";
import { LIVE_CONNECTION_INTERRUPTED_MESSAGE } from "../../network/liveSubmissionRecovery.js";
import AutoScaleInline from "../AutoScaleInline.jsx";
import DesktopChatPanel from "../DesktopChatPanel.jsx";
import DesktopResultsSummaryDrawer from "../DesktopResultsSummaryDrawer.jsx";
import DesktopResultsWordList from "../DesktopResultsWordList.jsx";
import LiveFeedSatellite from "../../features/live/LiveFeedSatellite.jsx";
import RankingWidgetMobile from "../RankingWidgetMobile.jsx";
import TargetHintPattern from "../TargetHintPattern.jsx";
import {
  CHAT_DESKTOP_FONT_SCALE_MAX,
  CHAT_DESKTOP_FONT_SCALE_MIN,
  CHAT_DESKTOP_FONT_SCALE_STEP,
  DESKTOP_CHAT_EMOJIS,
  QUICK_REPLIES,
} from "../chat/chatPresentationConfig.js";
import {
  DAILY_SPECIAL_BONUSES,
  normalizeBonusLabel,
} from "../daily/dailySpecialModel.js";
import { FAKE_TWINS_TYPE, tileScore } from "../gameLogic.js";
import DesktopGameGrid from "../live/DesktopGameGrid.jsx";
import DesktopSpecial3WordsPanel from "../live/DesktopSpecial3WordsPanel.jsx";
import InterTournamentLobby from "../live/InterTournamentLobby.jsx";
import LiveSalonScene from "../live/LiveSalonScene.jsx";
import MiniTournamentStartOverlay from "../live/MiniTournamentStartOverlay.jsx";
import TraceAwareDesktopPreviewContent from "../live/TraceAwareDesktopPreviewContent.jsx";
import OcidVoteOptionsGrid from "../ocid/OcidVoteOptionsGrid.jsx";
import TrainingPlayerBadge from "../training/TrainingPlayerBadge.jsx";
import TrainingRoundPicker from "../live/TrainingRoundPicker.jsx";
import useDesktopSceneLayout from "./useDesktopSceneLayout.js";

export default function DesktopGameScene({ runtime }) {
  const {
    activeRoom,
    allSoundOn,
    allWords,
    analysis,
    appView,
    assetVersion,
    blockedCount,
    blockedEntries,
    boardForRender,
    BONUS_CLASSES,
    bonusEffectMultiplier,
    bonusLetterKey,
    bonusLetterScore,
    canOpenPlayerProfile,
    canOpenRoundPlayerDetails,
    chatBlockClasses,
    chatDesktopFontScale,
    chatEditTarget,
    chatInput,
    chatInputDisabled,
    chatInputPlaceholder,
    chatInputRef,
    chatMessagesUnreadCount,
    chatOverlays,
    chatReplyTarget,
    clearDailyWordSlot,
    COLUMN_HEIGHT_STYLE,
    computedGridWidth,
    connectionError,
    countdownBarHeightPx,
    countdownLines,
    DAILY_DESKTOP_COLUMN_TEMPLATE,
    dailyInvalidPulseKey,
    dailyInvalidSlot,
    dailyTotalScore,
    DARK_WORD_INACTIVE,
    darkMode,
    defaultTileBaseClass,
    DESKTOP_MAIN_GRID_MIN_HEIGHT,
    desktopChatFontPx,
    desktopChatInputFontPx,
    desktopChatInputLineHeightPx,
    desktopChatLineHeightPx,
    desktopChatMetaFontPx,
    desktopChatMetaLineHeightPx,
    desktopChatMicroFontPx,
    desktopChatQuickReplyFontPx,
    desktopChatScaleLabel,
    desktopChatUiScale,
    desktopColumnDragId,
    desktopColumnHandleLayout,
    desktopColumnResizeActiveIndex,
    desktopGridMetrics,
    desktopGridUiScale,
    desktopLayoutRuntime,
    desktopMainGridHeight,
    desktopPlayersUiScale,
    desktopResponsiveColumnFractions,
    desktopResultsDrawerLayout,
    desktopResultsSummaryExpanded,
    desktopSideUiScale,
    desktopUiScale,
    desktopViewportResizeInProgress,
    devRoundTypes,
    displayList,
    duelStatus,
    duelTeam,
    finalRanking,
    gameBlockClasses,
    getLiveNickClassName,
    getLivePreviewLabelForCell,
    getNowServerMs,
    getUserIdFromPlayerProfileTarget,
    gobbleAwardsForLive,
    gobbleBadgeUrl,
    gobbleCandidates,
    GRID_COL_TEMPLATE,
    gridInputControllerRef,
    gridRef,
    gridRotationTurns,
    gridSize,
    handleChatInputFocus,
    handleClearOcidProposal,
    handleDesktopWordAnalysisClear,
    handleDesktopWordAnalyze,
    handleDesktopWordDefinitionOpen,
    handleOcidProposalChange,
    hasDesktopResultsSummary,
    highlightPlayers,
    hintCellOverlayStyleMap,
    hintCellSet,
    hintCellStyleMap,
    hintOutlineCellSet,
    hintOutlineOverlayStyleMap,
    hintOutlineStyleMap,
    hoveredResultsWordSet,
    implodeActive,
    installId,
    isCompactDesktopGridLayout,
    isDailyPlay,
    isDesktopEmojiPickerOpen,
    isFinaleBanner,
    isInGameSpecial3Tutorial,
    isLoggedIn,
    isMobileLayout,
    isOcidRound,
    isSpecial3WordsMode,
    isSquareMaterial,
    isTargetRound,
    lastMessageId,
    lightGridSurfaceStyle,
    lightPanelStyle,
    listItemRefs,
    MAIN_GRID_HEIGHT,
    mobileRoundIntroHideTiles,
    mobileRoundIntroOverlay,
    nextHintLabel,
    nickDecorationKey,
    normalizeLetterKey,
    ocidDefinitionText,
    ocidProposal,
    ocidProposalSubmitted,
    ocidSelectedOptionId,
    ocidStatusMessage,
    ocidSummary,
    ocidVote,
    openDesktopChatReactionDetails,
    openDesktopChatReactionPicker,
    openDefinition,
    openPlayerProfile,
    openRoundPlayerModal,
    openUserMenu,
    openWeeklyStatsOverlay,
    phase,
    praiseOverlay,
    prepareWordListFlip,
    previewBarMinHeight,
    previewTileStyle,
    quickHelpOverlay,
    recordBadgesByNickForRound,
    renderDesktopResultsDockPanel,
    renderMedals,
    renderNickSuffix,
    renderRankDelta,
    renderSpecial3BonusChipButton,
    renderSpecial3LengthGobbleBadge,
    renderSpecial3PreviewTiles,
    resolveSpecial3LiveTrace,
    resultsPathGradientIdRef,
    resultsPathPreview,
    resultsRankingList,
    resultsRankingMode,
    resultsReorderTick,
    rotateGridClockwise,
    roundPreparationOverlay,
    roundPreparing,
    roundStats,
    roundTilePointsVisible,
    safeChatTab,
    scheduleCloseDesktopChatReactionDetails,
    selfNick,
    selfOcidBluffPanelText,
    selfOcidBluffPoints,
    selfOcidDetail,
    selfOcidExternalVotedAuthors,
    selfOcidGiftDetail,
    selfOcidOwnWrongVoteMessage,
    selfOcidSubmittedWord,
    selfOcidTargetDetail,
    selfOcidVoteDetail,
    selfOcidVoteOption,
    selfOcidVoters,
    selfReadyForTournament: selfReadyForTournamentProp,
    serverStatus,
    setActiveArea,
    setChatDesktopFontScale,
    setChatInput,
    setDailyActiveSlot,
    setDesktopGridStageNode,
    setDesktopResultsSummaryExpanded,
    setDuelPopupState,
    setHoveredResultsNick,
    setIsSettingsOpen,
    setResultsRankingModeWithPulse,
    setShowAllWords,
    setShowBotMessages,
    setTargetWaitDevGridHost,
    setTargetWaitDevSideHost,
    setTournamentReady,
    shouldDefinitionBlink,
    showAllWords,
    showBlockedList,
    showBotMessages,
    showPreviewStats,
    showResultsWordPath,
    showSolvedTargetLoupe,
    solvedTargetWord,
    special3ActiveSlotIndex,
    special3DesktopStep2TutorialOverlay,
    special3DragGhost,
    special3InGameTutorialCard,
    special3LockedStartTileSet,
    special3Slots,
    special3TutorialStep,
    specialHint,
    specialHintDisplay,
    specialIndicatorPreset,
    specialRound,
    specialSolvedOverlay,
    stableCanOpenPlayerProfile,
    stableOpenPlayerProfile,
    standaloneTrainingSession,
    startTrainingRound,
    submitChat,
    submitDailyScore,
    submitOcidProposal,
    submitOcidVote,
    suppressWordListScores,
    targetWaitDevActive,
    targetWaitDevSessionState,
    tileColorPreset,
    tileFontPx,
    tileGapPx,
    tileMaterialClass,
    tileMaterialPreset,
    tileRefs,
    tileSizePx,
    toggleDarkModeQuick,
    toggleSoundQuick,
    totalScoreLabel,
    totalWordsLabel,
    tournament,
    tournamentLobby,
    tournamentRanking,
    trainingBusy,
    trainingSessionControls,
    usedSet,
    validationBarHeightPx,
    validationBarPaddingPx,
    visibleMessages,
    visiblePlayerList: visiblePlayerListProp,
    visualScreenShakeEnabled,
    statsApplication,
    WORDS_SCROLL_MAX_HEIGHT,
    rosterConfig,
  } = runtime;
  const selfReadyForTournament = selfReadyForTournamentProp;
  const visiblePlayerList = visiblePlayerListProp;
  const {
    handleDesktopColumnPointerDown,
    mainGridDesktopRef,
    playColumnRef,
    setDesktopColumnNode,
    startDesktopColumnResize,
  } = useDesktopSceneLayout(desktopLayoutRuntime);
  const desktopColumnOrderIndexById = React.useMemo(
    () =>
      new Map(
        (desktopLayoutRuntime.desktopColumnOrderSafe || []).map((id, index) => [
          id,
          index + 1,
        ]),
      ),
    [desktopLayoutRuntime.desktopColumnOrderSafe],
  );
  const setDesktopChatColumnNode = React.useCallback(
    (node) => setDesktopColumnNode("chat", node),
    [setDesktopColumnNode],
  );
  const renderDesktopColumnHandle = React.useCallback(
    (columnId, label) => {
      if (isMobileLayout) return null;
      const isDragging = desktopColumnDragId === columnId;
      return (
        <button
          type="button"
          onPointerDown={(event) =>
            handleDesktopColumnPointerDown(event, columnId)
          }
          className={`pointer-events-auto touch-none inline-flex h-7 min-w-[34px] items-center justify-center rounded-full border px-2 shadow-sm transition ${
            isDragging
              ? "border-blue-500/80 bg-blue-600/85 text-white"
              : darkMode
              ? "border-slate-600/80 bg-slate-900/72 text-slate-100 hover:bg-slate-800/85"
              : "border-slate-300/85 bg-white/72 text-slate-600 hover:bg-white/88"
          }`}
          style={{ touchAction: "none" }}
          aria-label={`Déplacer la colonne ${label}`}
          title={`Déplacer la colonne ${label}`}
        >
          <span className="flex flex-col gap-[3px]" aria-hidden="true">
            <span className="block h-[2px] w-2.5 rounded-full bg-current" />
            <span className="block h-[2px] w-2.5 rounded-full bg-current" />
            <span className="block h-[2px] w-2.5 rounded-full bg-current" />
          </span>
        </button>
      );
    },
    [
      darkMode,
      desktopColumnDragId,
      handleDesktopColumnPointerDown,
      isMobileLayout,
    ],
  );

  const desktopGridHeightPx =
    !isMobileLayout && Number.isFinite(desktopMainGridHeight)
      ? Math.max(
          DESKTOP_MAIN_GRID_MIN_HEIGHT,
          Math.round(desktopMainGridHeight)
        )
      : null;
  const desktopResizeEnabled = !isMobileLayout;
  const desktopColumnFractionsSafe = desktopResponsiveColumnFractions;
  const desktopGridTemplateColumns = desktopResizeEnabled
    ? desktopColumnFractionsSafe
        .map(
          (fraction) =>
            `minmax(0, ${Math.max(0.0001, fraction).toFixed(6)}fr)`
        )
        .join(" ")
    : isDailyPlay
    ? DAILY_DESKTOP_COLUMN_TEMPLATE
    : GRID_COL_TEMPLATE;
  const desktopColumnSplitterPositions = (() => {
    if (!desktopResizeEnabled) return [];
    const hostWidth = Math.max(0, Number(desktopGridMetrics.width) || 0);
    if (hostWidth <= 0) return [];
    const gapPx = Math.max(0, Number(desktopGridMetrics.gapPx) || 0);
    const columnCount = desktopColumnFractionsSafe.length;
    if (columnCount < 2) return [];
    const contentWidth = hostWidth - gapPx * (columnCount - 1);
    if (!(contentWidth > 0)) return [];
    const widths = desktopColumnFractionsSafe.map((fraction) => fraction * contentWidth);
    const positions = [];
    let offset = 0;
    for (let i = 0; i < widths.length - 1; i += 1) {
      offset += widths[i];
      positions.push(offset + gapPx * i + gapPx / 2);
    }
    return positions;
  })();
  const desktopMainGridStyle = isMobileLayout
    ? {}
    : {
        height: desktopGridHeightPx ? `${desktopGridHeightPx}px` : MAIN_GRID_HEIGHT,
        minHeight: desktopGridHeightPx
          ? `${desktopGridHeightPx}px`
          : `${DESKTOP_MAIN_GRID_MIN_HEIGHT}px`,
        maxHeight: desktopGridHeightPx ? `${desktopGridHeightPx}px` : MAIN_GRID_HEIGHT,
        gridTemplateColumns: desktopGridTemplateColumns,
        "--desktop-ui-scale": desktopUiScale,
      };
  const desktopColumnHeightStyle =
    !isMobileLayout && desktopGridHeightPx
      ? {
          height: `${desktopGridHeightPx}px`,
          maxHeight: `${desktopGridHeightPx}px`,
          minHeight: `${desktopGridHeightPx}px`,
        }
      : COLUMN_HEIGHT_STYLE;
  const desktopWordsScrollMaxHeight =
    !isMobileLayout && desktopGridHeightPx
      ? `${Math.max(80, desktopGridHeightPx - 230)}px`
      : WORDS_SCROLL_MAX_HEIGHT;
  const desktopChatPanelClassName = `${chatBlockClasses} desktop-ui-column desktop-chat-column card w-full min-h-0 order-4 relative transition-opacity duration-150 ${
    desktopColumnDragId === "chat" ? "opacity-25" : ""
  }`;
  const desktopChatPanelStyle = {
    ...desktopColumnHeightStyle,
    overflow: "hidden",
    ...(isMobileLayout ? {} : { order: desktopColumnOrderIndexById.get("chat") || 4 }),
    ...(!isMobileLayout ? { "--desktop-ui-scale": desktopChatUiScale } : {}),
  };
  return (
    <>
      <div
        className="desktop-game-shell w-full"
        style={{ "--desktop-ui-scale": desktopUiScale }}
      >      <div className="desktop-game-topbar">
        <div className="desktop-game-topbar-inner flex items-center bg-white border shadow-sm">
          <div className="desktop-game-brand flex min-w-0 items-center shrink-0">
            <div className="desktop-game-brand-title font-extrabold tracking-tight leading-none">GOBBLE</div>
            <div className="desktop-game-brand-subtitle min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-gray-500 leading-none">Boggle en ligne</div>
          </div>

          <div className="desktop-game-room-wrap flex min-w-0 items-center text-gray-700">
            <span className="desktop-game-room max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-full bg-gray-100 border border-gray-200">
              {standaloneTrainingSession?.label ? (
                <>{standaloneTrainingSession.label}</>
              ) : tournament?.round && tournament?.totalRounds ? (
                <>
                  {isFinaleBanner ? (
                    <>Manche finale</>
                  ) : (
                    <>
                      Manche {tournament.round}/{tournament.totalRounds}
                    </>
                  )}
                </>
              ) : isFinaleBanner ? (
                <>Manche finale</>
              ) : (
                <>
                  {activeRoom?.label || "Salon"} · {gridSize}x{gridSize}
                </>
              )}
            </span>
          </div>

          <div className="flex-1" />

          <div className="desktop-game-top-actions flex shrink-0 items-center">
            <button
              onClick={toggleDarkModeQuick}
              className="desktop-game-top-button font-semibold rounded-lg border bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
              title={darkMode ? "Passer en mode clair" : "Passer en mode sombre"}
              aria-label={darkMode ? "Passer en mode clair" : "Passer en mode sombre"}
            >
              <span className="desktop-game-top-icon material-icons-outlined leading-none" aria-hidden="true">
                {darkMode ? "light_mode" : "dark_mode"}
              </span>
            </button>
            <button
              onClick={toggleSoundQuick}
              className="desktop-game-top-button font-semibold rounded-lg border bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
              title={allSoundOn ? "Couper le son" : "Activer le son"}
              aria-label={allSoundOn ? "Couper le son" : "Activer le son"}
            >
              <span className="desktop-game-top-icon material-icons-outlined leading-none" aria-hidden="true">
                {allSoundOn ? "volume_up" : "volume_off"}
              </span>
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="desktop-game-top-button font-semibold rounded-lg border bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
            >
              <span className="desktop-game-top-icon material-icons-outlined leading-none" aria-hidden="true">
                settings
              </span>
              <span className="sr-only">Parametres</span>
            </button>
          </div>
        </div>
      </div>

      {connectionError && (
        <div
          className={`mb-4 px-3 py-2 rounded-lg border text-sm ${
            connectionError === LIVE_CONNECTION_INTERRUPTED_MESSAGE
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {connectionError}
        </div>
      )}

      {quickHelpOverlay}
      {!standaloneTrainingSession ? (
        <MiniTournamentStartOverlay
          lobby={tournamentLobby}
          preparing={!!roundPreparing}
          serverNowMs={getNowServerMs()}
        />
      ) : null}

      {/* plus de overflow-x-auto ici, on laisse le navigateur gerer le scroll horizontal */}
      <div className={`desktop-game-content relative flex-1 min-h-0 overflow-hidden ${desktopColumnDragId ? "pointer-events-none" : ""}`}>
      <div
        ref={mainGridDesktopRef}
        className={`desktop-responsive-grid main-grid grid gap-4 sm:gap-6 items-stretch grid-cols-1 sm:grid-cols-2 ${
          isDailyPlay ? "md:grid-cols-3 xl:grid-cols-3" : "md:grid-cols-3 xl:grid-cols-4"
        }`}
        style={desktopMainGridStyle}
      >
      
        {/* Colonne 1 : Joueurs */}
        <div
          ref={(node) => setDesktopColumnNode("players", node)}
          className={`desktop-ui-column card bg-white border rounded-xl p-4 w-full flex flex-col gap-3 min-h-0 order-2 md:order-1 relative transition-opacity duration-150 ${
            desktopColumnDragId === "players" ? "opacity-25" : ""
          }`}
                    style={
            isMobileLayout
              ? { ...lightPanelStyle, minHeight: 0, overflow: "visible" }
              : {
                  ...lightPanelStyle,
                  ...desktopColumnHeightStyle,
                  overflow: "hidden",
                  order: desktopColumnOrderIndexById.get("players") || 1,
                  "--desktop-ui-scale": desktopPlayersUiScale,
                }
          }
        >
          <div className="desktop-column-heading flex items-center justify-between">
            <h2 className="desktop-column-title font-bold">
              {activeRoom?.label || "Salon"}{" "}
              <LivePlayersCount />
            </h2>
            <span className="desktop-column-status rounded-full bg-gray-100 border border-gray-200">
              {serverStatus === "running"
                ? standaloneTrainingSession
                  ? "Entraînement"
                  : "Manche en cours"
                : serverStatus === "break"
                ? "Pause"
                : "En attente"}
            </span>
          </div>

{phase === "playing" && (
  <div className="flex flex-col gap-2 flex-1 min-h-0">
    <div className="desktop-column-title font-semibold">
      {standaloneTrainingSession ? standaloneTrainingSession.label : "Classement provisoire"}
    </div>

    {standaloneTrainingSession ? (
      <div className="space-y-3">
        {trainingSessionControls}
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-60">Score</div>
            <div className="mt-1 text-2xl font-black tabular-nums"><GameScoreValue format /></div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-60">Mots</div>
            <div className="mt-1 text-2xl font-black tabular-nums"><AcceptedWordsCount /></div>
          </div>
        </div>
      </div>
    ) : null}

    <div className="flex-1 min-h-0">
      {isOcidRound && isMobileLayout && (
        <div className={`mb-2 rounded-xl border px-3 py-2 ${darkMode ? "bg-slate-900/70 border-white/10" : "bg-white border-slate-200"}`}>
          <div className="text-[11px] font-extrabold tracking-widest text-center text-amber-500 dark:text-amber-300">
            MANCHE OCID
          </div>
          <div className="mt-2 text-xs font-semibold opacity-80 text-center leading-snug">
            {ocidVote?.definition || specialRound?.ocidDefinition || "Definition indisponible"}
          </div>
          {ocidVote ? (
            <OcidVoteOptionsGrid
              className="mt-2"
              compact={true}
              darkMode={darkMode}
              onSelect={submitOcidVote}
              options={ocidVote.options || []}
              selectedOptionId={ocidSelectedOptionId}
            />
          ) : (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submitOcidProposal();
              }}
            >
              <div className="relative min-w-0 flex-1">
                <input
                  value={ocidProposal}
                  onChange={(e) => handleOcidProposalChange(e.target.value)}
                  maxLength={32}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 pr-8 text-sm text-slate-900"
                  placeholder="Trace ou tape ton mot"
                />
                {ocidProposal ? (
                  <button
                    type="button"
                  onClick={handleClearOcidProposal}
                    className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                    aria-label="Changer de proposition"
                  >
                    <span className="material-icons-outlined text-[16px] leading-none">close</span>
                  </button>
                ) : null}
              </div>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"
              >
                Envoyer
              </button>
            </form>
          )}
          <div className="mt-2 text-[11px] font-semibold opacity-70 text-center">
            {ocidStatusMessage ||
              (ocidVote
                ? "Vote pour le vrai mot cible."
                : ocidProposalSubmitted
                ? `Retenu : ${ocidProposalSubmitted}`
                : "Trace ou tape un mot plausible. Il sera retenu automatiquement.")}
          </div>
        </div>
      )}
      {isTargetRound && (
        <div className={`desktop-target-card mb-2 min-w-0 overflow-hidden rounded-xl border ${darkMode ? "bg-slate-900/70 border-white/10" : "bg-white border-slate-200"}`}>
          <div className="desktop-target-title font-extrabold tracking-widest text-center text-amber-500 dark:text-amber-300">
            {specialRound?.type === "target_long"
              ? "TROUVE LE PLUS LONG MOT"
              : specialRound?.type === "target_score"
              ? "TROUVE LE MEILLEUR MOT"
              : "MANCHE SPECIALE"}
          </div>
          <div
            className={`desktop-target-pattern w-full min-w-0 text-center font-black tabular-nums ${
              solvedTargetWord ? "tracking-normal" : "tracking-widest"
            }`}
          >
            {specialHintDisplay ? (
              <div className="flex w-full min-w-0 items-center justify-center gap-2">
                <div className="min-w-0 flex-1">
                  <AutoScaleInline
                    minScale={0.25}
                    measurePaddingPx={2}
                    scaleMode="horizontal"
                  >
                    <TargetHintPattern
                      display={specialHintDisplay}
                      renderBlankRules
                      revealedWordIndices={specialHint?.wordIndices}
                      solved={!!solvedTargetWord}
                      wordLength={specialHint?.length}
                      className={
                        solvedTargetWord
                          ? "block whitespace-nowrap tracking-normal"
                          : "block whitespace-nowrap"
                      }
                      style={solvedTargetWord ? { letterSpacing: 0 } : undefined}
                    />
                  </AutoScaleInline>
                </div>
                {showSolvedTargetLoupe && (
                  <button
                    type="button"
                    className={`inline-flex shrink-0 items-center justify-center rounded-full border px-2 py-1 ${
                      darkMode
                        ? "bg-slate-800 border-slate-600 text-slate-100"
                        : "bg-white border-gray-300 text-gray-700"
                    } ${shouldDefinitionBlink ? "animate-pulse" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openDefinition(solvedTargetWord);
                    }}
                    aria-label="Voir la dGinition"
                    title="Voir la dGinition"
                  >
                    <svg
                      width="16"
                      height="16"
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
                )}
              </div>
            ) : (
              <span className="text-[13px] sm:text-sm tracking-normal opacity-80">
                MOT MYSTÈRE
              </span>
            )}
          </div>
          {specialHint?.length ? (
            <div className="desktop-target-meta font-semibold opacity-70 text-center">
              {specialHint.length} lettres
            </div>
          ) : null}
          <div className="desktop-target-meta font-semibold opacity-80 text-center">
            {nextHintLabel}
          </div>
        </div>
      )}
      {!standaloneTrainingSession && !isTargetRound && !isOcidRound && (
        <DesktopLiveRankingSatellite
          rosterConfig={rosterConfig}
          selfNick={selfNick}
          darkMode={darkMode}
          expanded={!isMobileLayout}
          animateRank={false}
          showWheel={!isMobileLayout}
          showBadge={!isMobileLayout}
          flatStyle={isMobileLayout}
          highlightedPlayers={highlightPlayers}
          assetVersion={assetVersion}
          gobbleWordAwardsByNick={gobbleAwardsForLive}
          getNickClassName={getLiveNickClassName}
          nickDecorationKey={nickDecorationKey}
          onPlayerNickClick={stableOpenPlayerProfile}
          isPlayerNickClickable={stableCanOpenPlayerProfile}
          renderNickSuffix={renderNickSuffix}
          showGobbleWordAwards={true}
          showScores={true}
          stackNickDecorations={!isMobileLayout}
        />
      )}
    </div>
  </div>
)}



  {phase === "results" && !standaloneTrainingSession && (finalRanking.length > 0 || (tournamentRanking || []).length > 0) && (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="desktop-column-heading flex items-center justify-between">
        <div className="desktop-column-title font-semibold">Classement</div>
        <div className="desktop-segmented-control inline-flex rounded-full border border-gray-300 overflow-hidden">
          <button
            type="button"
            onClick={() => {
              setResultsRankingModeWithPulse("round");
            }}
            className={`transition ${
              resultsRankingMode === "round" ? "bg-blue-600 text-white" : "bg-white text-gray-600"
            }`}
          >
            Manche
          </button>
          <button
            type="button"
            onClick={() => {
              setResultsRankingModeWithPulse("total");
            }}
            className={`transition ${
              resultsRankingMode === "total" ? "bg-blue-600 text-white" : "bg-white text-gray-600"
            }`}
          >
            Total
          </button>
        </div>
      </div>
      {resultsRankingMode === "total" && tournament?.round && tournament?.totalRounds && (
        <div className="text-xs text-gray-500 whitespace-nowrap">
          {tournament.round === tournament.totalRounds ? (
            <>Manche finale</>
          ) : (
            <>
              Manche {tournament.round}/{tournament.totalRounds}
            </>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <RankingWidgetMobile
          fullRanking={resultsRankingList}
          selfNick={selfNick}
          darkMode={darkMode}
          expanded={true}
          animateRank={false}
          animateReorderTick={resultsReorderTick}
          showWheel={false}
          showBadge={!isMobileLayout}
          flatStyle={isMobileLayout}
          highlightedPlayers={highlightPlayers}
          showRoundAward={true}
          assetVersion={assetVersion}
          gobbleWordAwardsByNick={gobbleAwardsForLive}
          getNickClassName={getLiveNickClassName}
          nickDecorationKey={nickDecorationKey}
          renderNickSuffix={renderNickSuffix}
          stackNickDecorations={!isMobileLayout}
          showGobbleWordAwards={true}
          renderAfterRank={resultsRankingMode === "total" ? renderRankDelta : null}
          onPlayerNickHover={!isMobileLayout ? setHoveredResultsNick : null}
          recordBadgesByNick={
            resultsRankingMode === "round" ? recordBadgesByNickForRound : null
          }
          onPlayerNickClick={
            resultsRankingMode === "round" ? openRoundPlayerModal : openPlayerProfile
          }
          isPlayerNickClickable={
            resultsRankingMode === "round"
              ? (rankingEntry) => canOpenRoundPlayerDetails(rankingEntry)
              : (rankingEntry) => !!getUserIdFromPlayerProfileTarget(rankingEntry)
          }
        />
      </div>

    </div>
  )}

          {phase === "results" && standaloneTrainingSession ? (
            <div className="flex flex-1 flex-col gap-3 min-h-0">
              <div className="desktop-column-title font-semibold">Résultats de l’entraînement</div>
              {trainingSessionControls}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-60">Score</div>
                  <div className="mt-1 text-2xl font-black tabular-nums"><GameScoreValue format /></div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-60">Mots trouvés</div>
                  <div className="mt-1 text-2xl font-black tabular-nums"><AcceptedWordsCount /></div>
                </div>
              </div>
            </div>
          ) : null}

          {phase !== "playing" && !standaloneTrainingSession && finalRanking.length === 0 && (
            <div className="flex flex-col gap-2 flex-1 min-h-0">
              <div className="text-sm font-semibold">Joueurs connectés</div>
              <div className="flex flex-wrap gap-2 flex-1 min-h-0 overflow-auto content-start items-start">
                {(visiblePlayerList.length
                  ? visiblePlayerList
                  : [{ nick: "En attente..." }]).map((p) => {
                  const canOpenProfile = canOpenPlayerProfile(p);
                  const nickClassName = getLiveNickClassName(p, p.nick);
                  const pillClass = `px-3 py-1 rounded-full text-xs border ${
                    p.nick === selfNick
                      ? "bg-blue-50 border-blue-200 text-blue-800"
                      : "bg-gray-50 border-gray-200 text-gray-700"
                  }`;
                  const content = (
                    <>
                      <span className={nickClassName}>{p.nick}</span>
                      {p?.inTraining ? <span className="ml-1 inline-flex align-middle"><TrainingPlayerBadge compact /></span> : null}
                      {p?.afk ? (
                        <span className="ml-1 text-[10px] font-extrabold italic text-red-600">
                          AFK
                        </span>
                      ) : null}
                      {p.nick ? renderMedals(p.nick, p) : null}
                    </>
                  );
                  return canOpenProfile ? (
                    <button
                      key={p.nick}
                      type="button"
                      className={`${pillClass} hover:underline`}
                      onClick={() => openPlayerProfile(p)}
                    >
                      {content}
                    </button>
                  ) : (
                    <span key={p.nick} className={pillClass}>
                      {content}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {/* Colonne 2 : Grille */}
        <div
          ref={(node) => {
            playColumnRef.current = node;
            setDesktopColumnNode("grid", node);
          }}
          className={`desktop-ui-column desktop-grid-column card bg-white border rounded-xl flex flex-col items-center gap-3 w-full min-h-0 order-1 md:order-2 p-2 relative transition-opacity duration-150 ${
            desktopColumnDragId === "grid" ? "opacity-25" : ""
          }`}
                    style={
            isMobileLayout
              ? { minHeight: 0, overflow: "visible" }
              : {
                  ...desktopColumnHeightStyle,
                  overflow: "hidden",
                  order: desktopColumnOrderIndexById.get("grid") || 2,
                  "--desktop-ui-scale": desktopGridUiScale,
                }
          }
        >
          {!isMobileLayout && (
            <div
              className="w-full shrink-0 flex justify-center overflow-hidden"
              style={{
                height: `${countdownBarHeightPx}px`,
                minHeight: `${countdownBarHeightPx}px`,
                maxHeight: `${countdownBarHeightPx}px`,
              }}
            >
              <div
                className={`h-full flex items-center justify-center overflow-hidden text-center font-bold ${
                  darkMode ? "text-slate-200" : "text-slate-700"
                }`}
                style={
                  computedGridWidth
                    ? { width: computedGridWidth, minWidth: computedGridWidth, maxWidth: computedGridWidth }
                    : undefined
                }
              >
                {phase === "playing" ? (
                  <div className="flex items-center justify-center">
                    <div
                      className={`font-black tabular-nums leading-none ${
                        darkMode ? "text-slate-50" : "text-slate-800"
                      }`}
                      aria-label="Temps restant"
                      style={{
                        fontSize: `${Math.max(
                          18,
                          Math.round(52 * desktopGridUiScale)
                        )}px`,
                      }}
                    >
                      {targetWaitDevActive
                        ? Math.max(0, Number(targetWaitDevSessionState.remainingSeconds) || 0)
                        : <RoundClockSeconds />}
                    </div>
                  </div>
                ) : (
                  <AutoScaleInline minScale={0.5} measurePaddingPx={2}>
                    <div
                      className="inline-flex items-center gap-2 whitespace-nowrap"
                      style={{
                        fontSize: `${Math.max(
                          8,
                          Math.round(14 * desktopGridUiScale)
                        )}px`,
                      }}
                    >
                      {countdownLines.map((line, idx) => (
                        <span key={`${line}-${idx}`}>{line}</span>
                      ))}
                    </div>
                  </AutoScaleInline>
                )}
              </div>
            </div>
          )}
          {phase === "lobby" ? (
            <div className="w-full flex-1 min-h-0 overflow-hidden px-2 py-2">
              <LiveSalonScene
                chatInput={chatInput}
                chatInputDisabled={chatInputDisabled}
                chatInputPlaceholder={chatInputPlaceholder}
                className="h-full min-h-[520px] rounded-xl border border-slate-900/20 shadow-sm"
                getAuthorNickClassName={getLiveNickClassName}
                isMobile={false}
                onChatInputFocus={handleChatInputFocus}
                salonControls={
                  <InterTournamentLobby
                    darkMode={darkMode}
                    lobby={tournamentLobby}
                    onReady={setTournamentReady}
                    selfReady={selfReadyForTournament}
                    team={duelTeam}
                  />
                }
                setChatInput={setChatInput}
                selfInstallId={installId}
                selfNick={selfNick}
                submitChat={submitChat}
                team={duelTeam}
                trainingControls={
                  <TrainingRoundPicker
                    darkMode={darkMode}
                    devRoundTypes={devRoundTypes}
                    lobby={tournamentLobby}
                    onTrainingStart={startTrainingRound}
                    trainingBusy={trainingBusy}
                  />
                }
                infoControls={
                  <div className={`rounded-xl border p-3 text-sm ${darkMode ? "border-white/10 bg-slate-950/75 text-slate-100" : "border-amber-200/70 bg-white/75 text-slate-800"}`}>
                    <div className="font-extrabold uppercase tracking-widest text-[11px] opacity-70">
                      Infos utiles
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={openWeeklyStatsOverlay}
                        className={`rounded-lg border px-3 py-2 text-xs font-bold ${darkMode ? "border-slate-600 bg-slate-900" : "border-amber-200/80 bg-white/75"}`}
                      >
                        Stats
                      </button>
                      <button
                        type="button"
                        onClick={() => setDuelPopupState({ mode: "objectives_manual", step: 0, team: duelStatus?.team || null, weekId: duelStatus?.weekId || null })}
                        className={`rounded-lg border px-3 py-2 text-xs font-bold ${darkMode ? "border-slate-600 bg-slate-900" : "border-amber-200/80 bg-white/75"}`}
                      >
                        Missions du jour
                      </button>
                    </div>
                  </div>
                }
                visibleMessages={visibleMessages}
              />
            </div>
          ) : null}
          <div
            ref={setDesktopGridStageNode}
            className={`${
              isMobileLayout
                ? "relative w-full"
                : "relative flex w-full flex-1 min-h-0 items-center justify-center overflow-visible"
            } ${phase === "lobby" ? "hidden" : ""}`}
          >
            <div
              className={isMobileLayout ? "relative w-full" : "relative w-fit flex-none"}
              style={
                isMobileLayout
                  ? undefined
                  : computedGridWidth
                  ? {
                      width: computedGridWidth,
                      minWidth: computedGridWidth,
                      maxWidth: computedGridWidth,
                    }
                  : undefined
              }
            >

            {targetWaitDevActive ? (
              <div
                ref={setTargetWaitDevGridHost}
                className="absolute inset-0 z-[45] overflow-hidden rounded-xl"
              />
            ) : null}
            <DesktopGameGrid
              gridRef={gridRef}
              className={
                (isMobileLayout
                  ? "relative grid bg-white border rounded-xl px-2 py-2 w-full"
                  : "relative grid p-4 bg-white border rounded-xl w-fit mx-auto") +
                (isInGameSpecial3Tutorial && special3TutorialStep === 0 ? " special3-tutorial-focus" : "")
              }
              style={{
                gridTemplateColumns: isMobileLayout
                  ? `repeat(${gridSize}, minmax(0, 1fr))`
                  : `repeat(${gridSize}, ${tileSizePx}px)`,
                gap:
                  tileMaterialPreset === "square"
                    ? "0px"
                    : isMobileLayout
                    ? "4px"
                    : `${tileGapPx}px`,
                padding: tileMaterialPreset === "square" ? "0px" : undefined,
                touchAction: "none",
                overscrollBehavior: "none",
                ...(isMobileLayout
                  ? {}
                  : {
                      width: computedGridWidth || undefined,
                      minWidth: computedGridWidth || undefined,
                      maxWidth: computedGridWidth || undefined,
                    }),
                ...lightGridSurfaceStyle,
              }}
              darkMode={darkMode}
              implodeActive={implodeActive}
              inputControllerRef={gridInputControllerRef}
              praiseOverlay={null}
              resultsPathGradientId={resultsPathGradientIdRef.current}
              resultsPathPreview={resultsPathPreview}
              showResultsWordPath={showResultsWordPath}
              specialSolvedOverlay={phase === "playing" && specialSolvedOverlay}
              liveGridProps={{
                board: boardForRender,
                BONUS_CLASSES,
                bonusLetterKey,
                bonusLetterScore,
                bonusEffectMultiplier,
                defaultTileBaseClass,
                getTileColorTextureStyle,
                gridRotationTurns,
                gridSize,
                hintCellOverlayStyleMap,
                hintCellSet,
                hintCellStyleMap,
                hintOutlineCellSet,
                hintOutlineOverlayStyleMap,
                hintOutlineStyleMap,
                isMobileLayout,
                isSquareMaterial,
                mapDisplayToBoardIndex,
                mobileRoundIntroHideTiles,
                normalizeBonusLabel,
                normalizeLetterKey,
                phase,
                roundTilePointsVisible,
                special3LockedStartTileSet,
                specialIndicatorPreset,
                tileColorPreset,
                tileFontPx,
                tileMaterialClass,
                tileRefs,
                tileScore,
                usedSet,
              }}
            />
            {praiseOverlay}
            {!isMobileLayout ? special3DragGhost : null}
            {!isMobileLayout ? special3InGameTutorialCard : null}
            </div>
          </div>

            <div
              className={`${gameBlockClasses} relative overflow-hidden ${phase === "lobby" ? "hidden" : ""} ${
                !isMobileLayout && isSpecial3WordsMode && (special3TutorialStep === 0 || special3TutorialStep === 1)
                  ? "special3-tutorial-focus"
                : ""
            }`}
            style={
              !isMobileLayout
                ? {
                    width: "100%",
                    minWidth: 0,
                    maxWidth: "100%",
                    height: `${validationBarHeightPx}px`,
                    minHeight: `${validationBarHeightPx}px`,
                    maxHeight: `${validationBarHeightPx}px`,
                    padding: `${validationBarPaddingPx}px`,
                  }
                : computedGridWidth
                ? {
                    width: computedGridWidth,
                    minWidth: computedGridWidth,
                    maxWidth: computedGridWidth,
                  }
                : undefined
            }
            onClick={() => {
              setActiveArea("game");
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
            }}
          >
            <div
              className="w-full flex items-center"
              style={{
                height: `${previewBarMinHeight}px`,
                minHeight: `${previewBarMinHeight}px`,
                maxHeight: `${previewBarMinHeight}px`,
              }}
            >
              <div
                className="shrink-0"
                style={{ width: `${Math.max(24, Math.round(36 * desktopGridUiScale))}px` }}
              />
              <InputShakeBoundary
                className="flex-1 min-w-0 overflow-visible text-center font-bold text-lg leading-none flex items-center justify-center"
                style={{
                  fontSize: `${Math.max(11, Math.round(18 * desktopGridUiScale))}px`,
                }}
              >
                  {!isMobileLayout && isSpecial3WordsMode ? (
    <div className="flex flex-wrap items-center justify-center gap-2 py-1">
      {DAILY_SPECIAL_BONUSES.map((bonusKey) =>
        renderSpecial3BonusChipButton(bonusKey, {
          keyPrefix: "desktop-preview-special3",
          sizeClass: isCompactDesktopGridLayout
            ? "h-7 min-w-7 px-2 text-xs"
            : "h-10 min-w-10 px-3",
          pulse: special3TutorialStep === 0,
        })
      )}
    </div>
  ) : (
    <TraceAwareDesktopPreviewContent
      board={boardForRender}
      countdownLines={countdownLines}
      darkMode={darkMode}
      getTraceCellLabel={getLivePreviewLabelForCell}
      phase={phase}
      previewTileStyle={previewTileStyle}
      showPreviewStats={showPreviewStats}
      totalScoreLabel={totalScoreLabel}
      totalWordsLabel={totalWordsLabel}
    />
  )}
              </InputShakeBoundary>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  rotateGridClockwise();
                }}
                className="w-9 h-9 shrink-0 rounded-lg border border-slate-200 bg-white/80 text-slate-700 shadow-sm transition hover:bg-white flex items-center justify-center dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-800/80"
                style={{
                  width: `${Math.max(24, Math.round(36 * desktopGridUiScale))}px`,
                  height: `${Math.max(24, Math.round(36 * desktopGridUiScale))}px`,
                }}
                title="Rotation 90 deg"
              >
                <span
                  className="material-icons-outlined leading-none"
                  style={{
                    fontSize: `${Math.max(12, Math.round(18 * desktopGridUiScale))}px`,
                  }}
                  aria-hidden="true"
                >
                  autorenew
                </span>
                <span className="sr-only">Rotation 90 deg</span>
              </button>
              {!isMobileLayout ? special3DesktopStep2TutorialOverlay : null}
            </div>
          </div>
        </div>

       {/* Colonne 3 : Score et résultats */}
        <div
          ref={(node) => setDesktopColumnNode("side", node)}
          className={`desktop-ui-column desktop-side-column card bg-white border rounded-xl p-4 w-full flex flex-col overflow-hidden min-h-0 order-3 relative transition-opacity duration-150 ${
            desktopColumnDragId === "side" ? "opacity-25" : ""
          }`}
          style={{
            ...lightPanelStyle,
            ...desktopColumnHeightStyle,
            ...(isMobileLayout ? {} : { order: desktopColumnOrderIndexById.get("side") || 3 }),
            ...(!isMobileLayout ? { "--desktop-ui-scale": desktopSideUiScale } : {}),
          }}
        >
          {targetWaitDevActive ? (
            <div
              ref={setTargetWaitDevSideHost}
              className="absolute inset-0 z-[45] overflow-hidden rounded-xl"
            />
          ) : null}
          {/* bloc score */}
          <div
            className={`desktop-score-block bg-white dark:bg-slate-950/80 border dark:border-slate-700 rounded-xl p-3 w-full relative overflow-hidden ${
              phase === "playing" && isOcidRound
                ? "flex flex-col flex-1 min-h-0 mb-0"
                : "space-y-2 mb-4 shrink-0"
            }`}
          >
            {phase === "playing" && isOcidRound ? (
              <div className="flex h-full min-h-0 flex-col gap-3">
                <div className="text-[11px] font-extrabold tracking-widest text-center text-amber-500">
                  MANCHE OCID
                </div>
                <div
                  className={`min-h-[2.6rem] text-center text-lg font-black leading-snug ${
                    ocidDefinitionText
                      ? "text-slate-900 dark:text-slate-100"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {ocidDefinitionText || "Définition indisponible"}
                </div>
                {ocidVote ? (
                  <OcidVoteOptionsGrid
                    darkMode={darkMode}
                    onSelect={submitOcidVote}
                    options={ocidVote.options || []}
                    selectedOptionId={ocidSelectedOptionId}
                  />
                ) : (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitOcidProposal();
                    }}
                  >
                    <div className="relative min-w-0 flex-1">
                      <input
                        value={ocidProposal}
                        onChange={(e) => handleOcidProposalChange(e.target.value)}
                        maxLength={32}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 pr-8 text-sm text-slate-900"
                        placeholder="Trace ou tape ton mot"
                      />
                      {ocidProposal ? (
                        <button
                          type="button"
                          onClick={handleClearOcidProposal}
                          className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                          aria-label="Changer de proposition"
                        >
                          <span className="material-icons-outlined text-[16px] leading-none">close</span>
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="submit"
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"
                    >
                      Envoyer
                    </button>
                  </form>
                )}
                <div className="text-center text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  {ocidStatusMessage ||
                    (ocidVote
                      ? "Vote pour le vrai mot cible."
                      : ocidProposalSubmitted
                      ? `Retenu : ${ocidProposalSubmitted}`
                      : "Trace ou tape un mot plausible. Il sera retenu automatiquement.")}
                </div>
              </div>
            ) : (
              <>
                <AutoScaleInline minScale={0.55} measurePaddingPx={2}>
                  <div className="desktop-score-total font-bold text-center">
                    Score total : <GameScoreValue />
                  </div>
                </AutoScaleInline>
                {(specialRound?.isSpecial || isSpecial3WordsMode) && (
                  <AutoScaleInline
                    minScale={0.5}
                    measurePaddingPx={2}
                    className="desktop-score-special font-semibold text-orange-700"
                  >
                    {specialRound?.type === "monstrous" ? (
                      <div className="font-extrabold uppercase tracking-[0.12em] text-amber-500">
                        GRILLE MONSTRUEUSE
                      </div>
                    ) : (
                      <div>
                        {isSpecial3WordsMode ? "" : `${specialRound?.label || "Manche spéciale"} `}
                        {specialRound?.type === "speed"
                          ? `mots fixes ${specialRound.fixedWordScore} pts`
                        : isSpecial3WordsMode
                          ? "3 mots, tuiles de départ différentes"
                          : specialRound?.type === FAKE_TWINS_TYPE
                          ? "une case vaut 2 lettres, mots de 2 lettres min"
                          : specialRound?.type === "bonus_letter"
                          ? `les ${specialRound.bonusLetter || "?"} valent ${specialRound.bonusLetterScore ?? 20} pts`
                          : specialRound?.type === MASSIVE_BOGGLE_TYPE
                          ? "mots de 3 lettres min"
                        : "objectif : 1 seul mot"}
                      </div>
                    )}
                  </AutoScaleInline>
                )}
                <AutoScaleInline
                  minScale={0.5}
                  measurePaddingPx={2}
                  className="desktop-score-detail text-gray-600"
                >
                  {roundStats && !isTargetRound ? (
                    <span>
                      {roundStats.words ?? "?"} mots possibles {" "}
                      {formatNumber(roundStats.totalPts ?? roundStats.maxPts ?? 0) || "?"} pts
                    </span>
                  ) : (
                    <span>{isTargetRound ? "Stats masquées (manche cible)" : "Stats de grille indisponibles"}</span>
                  )}
                </AutoScaleInline>
              </>
            )}
          </div>

          {phase === "playing" && isSpecial3WordsMode ? (
            <DesktopSpecial3WordsPanel
              activeSlotIndex={special3ActiveSlotIndex}
              clearSlot={clearDailyWordSlot}
              darkMode={darkMode}
              dailyInvalidPulseKey={dailyInvalidPulseKey}
              dailyInvalidSlot={dailyInvalidSlot}
              dailyTotalScore={dailyTotalScore}
              formatNumber={formatNumber}
              isDailyPlay={isDailyPlay}
              onSelectSlot={setDailyActiveSlot}
              onSubmit={submitDailyScore}
              renderLengthBadge={renderSpecial3LengthGobbleBadge}
              renderPreviewTiles={renderSpecial3PreviewTiles}
              resolveLiveTrace={resolveSpecial3LiveTrace}
              slots={special3Slots}
              tutorialStep={special3TutorialStep}
              visualScreenShakeEnabled={visualScreenShakeEnabled}
            />
          ) : phase === "playing" && isOcidRound ? null : phase === "playing" &&
            (!standaloneTrainingSession || !isTargetRound) ? (
            <div className="flex flex-col flex-1 min-h-0">
              <LiveFeedSatellite
                darkMode={darkMode}
                maxHeight="100%"
                getNickClassName={getLiveNickClassName}
              />
            </div>
          ) : phase === "results" && ocidSummary ? (
            <div className="flex flex-col flex-1 min-h-0 gap-3 overflow-y-auto pr-1">
              <div className={`rounded-xl border p-3 ${darkMode ? "bg-slate-900/80 border-slate-700" : "bg-amber-50 border-amber-200"}`}>
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-amber-700">
                  Mot cible
                </div>
                <div className="mt-1 text-2xl font-black text-slate-950 dark:text-amber-100">
                  {String(ocidSummary.word || "").toUpperCase() || "?"}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {selfOcidTargetDetail}
                </div>
                {selfOcidDetail?.gobbleEarned ? (
                  <div className="mt-2 inline-flex rounded-full bg-amber-500 px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-sm">
                    Gobble · +1 au mini-tournoi
                  </div>
                ) : null}
              </div>
              <div className={`rounded-xl border p-3 ${darkMode ? "bg-slate-900/80 border-slate-700" : "bg-white border-slate-200"}`}>
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Votre vote
                </div>
                {selfOcidVoteOption?.isTarget ? (
                  <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {selfOcidVoteDetail}
                  </div>
                ) : selfOcidOwnWrongVoteMessage || selfOcidExternalVotedAuthors.length ? (
                  <>
                    <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {selfOcidVoteDetail}
                    </div>
                    {selfOcidGiftDetail ? (
                      <div className="mt-1 text-xs font-bold text-rose-600 dark:text-rose-300">
                        {selfOcidGiftDetail}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
                    {selfOcidVoteDetail}
                  </div>
                )}
              </div>
              <div className={`rounded-xl border p-3 ${darkMode ? "bg-slate-900/80 border-slate-700" : "bg-white border-slate-200"}`}>
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Votre bluff
                </div>
                {selfOcidSubmittedWord ? (
                  <>
                    <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {selfOcidBluffPanelText}
                    </div>
                    {selfOcidVoters.length && !selfOcidDetail?.exactTarget ? (
                      <div className="mt-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        Votes reçus : {selfOcidVoters.join(", ")} · +{formatNumber(selfOcidBluffPoints)} pts
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
                    Vous n'aviez pas de proposition retenue.
                  </div>
                )}
              </div>
            </div>
          ) : isTargetRound ? (
            <div className="flex flex-col flex-1 min-h-0" />
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
                <div className="desktop-column-heading flex items-center justify-between mb-2 shrink-0">
                  <div className="min-w-0">
                    <h2 className="desktop-column-title font-bold">Mots</h2>
                    <div className="desktop-column-title text-gray-500">
                      {showAllWords ? (
                        `Tous (${allWords.length})`
                      ) : (
                        <>Trouvés (<FoundWordsCount />)</>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-none items-center">
                    <div className={`desktop-segmented-control inline-flex rounded-full overflow-hidden ${darkMode ? "border border-slate-700" : "border border-gray-300"}`}>
                      <button
                        type="button"
                        onClick={() => {
                          prepareWordListFlip(displayList);
                          setShowAllWords(false);
                        }}
                        className={`transition ${
                          !showAllWords
                            ? darkMode
                              ? "bg-blue-700 text-white"
                              : "bg-blue-600 text-white"
                            : darkMode
                              ? "bg-slate-900 text-gray-300"
                              : "bg-white text-gray-600"
                        }`}
                      >
                        Trouvés
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          prepareWordListFlip(displayList);
                          setShowAllWords(true);
                        }}
                        className={`transition ${
                          showAllWords
                            ? darkMode
                              ? "bg-blue-700 text-white"
                              : "bg-blue-600 text-white"
                            : darkMode
                              ? "bg-slate-900 text-gray-300"
                              : "bg-white text-gray-600"
                        }`}
                      >
                        Tous
                      </button>
                    </div>
                  </div>
                </div>

              <DesktopResultsWordList
                analysisWord={analysis?.word || ""}
                allWordsCount={allWords.length}
                darkMode={darkMode}
                displayList={displayList}
                gobbleBadgeUrl={gobbleBadgeUrl}
                gobbleCandidates={gobbleCandidates}
                hoveredResultsWordSet={hoveredResultsWordSet}
                inactiveWordColor={DARK_WORD_INACTIVE}
                listItemRefs={listItemRefs}
                maxHeight={desktopWordsScrollMaxHeight}
                onAnalyzeWord={handleDesktopWordAnalyze}
                onClearAnalysis={handleDesktopWordAnalysisClear}
                onOpenDefinition={handleDesktopWordDefinitionOpen}
                showAllWords={showAllWords}
                suppressWordListScores={suppressWordListScores}
              />
            </div>
          )}
        </div>

        {/* Colonne 4 : Chat */}
        {!isDailyPlay && (
          <DesktopChatPanel
            appView={appView}
            blockedCount={blockedCount}
            blockedEntries={blockedEntries}
            chatBlockClassName={desktopChatPanelClassName}
            chatDesktopFontScale={chatDesktopFontScale}
            chatEditTarget={chatEditTarget}
            chatInput={chatInput}
            chatInputDisabled={chatInputDisabled}
            chatInputPlaceholder={chatInputPlaceholder}
            chatInputRef={chatInputRef}
            chatMessagesUnreadCount={chatMessagesUnreadCount}
            chatReplyTarget={chatReplyTarget}
            chatScaleMax={CHAT_DESKTOP_FONT_SCALE_MAX}
            chatScaleMin={CHAT_DESKTOP_FONT_SCALE_MIN}
            chatScaleStep={CHAT_DESKTOP_FONT_SCALE_STEP}
            darkMode={darkMode}
            desktopChatFontPx={desktopChatFontPx * desktopChatUiScale}
            desktopChatInputFontPx={desktopChatInputFontPx * desktopChatUiScale}
            desktopChatInputLineHeightPx={desktopChatInputLineHeightPx * desktopChatUiScale}
            desktopChatLineHeightPx={desktopChatLineHeightPx * desktopChatUiScale}
            desktopChatMetaFontPx={desktopChatMetaFontPx * desktopChatUiScale}
            desktopChatMetaLineHeightPx={desktopChatMetaLineHeightPx * desktopChatUiScale}
            desktopChatMicroFontPx={desktopChatMicroFontPx * desktopChatUiScale}
            desktopChatQuickReplyFontPx={desktopChatQuickReplyFontPx * desktopChatUiScale}
            desktopChatScaleLabel={desktopChatScaleLabel}
            desktopChatStyle={desktopChatPanelStyle}
            desktopChatTab={safeChatTab}
            desktopEmojiList={DESKTOP_CHAT_EMOJIS}
            getAuthorNickClassName={getLiveNickClassName}
            installId={installId}
            isLoggedIn={isLoggedIn}
            isDesktopEmojiPickerOpen={isDesktopEmojiPickerOpen}
            lastMessageId={lastMessageId}
            openDesktopChatReactionDetails={openDesktopChatReactionDetails}
            openDesktopChatReactionPicker={openDesktopChatReactionPicker}
            openUserMenu={openUserMenu}
            panelRef={setDesktopChatColumnNode}
            phase={phase}
            quickReplies={QUICK_REPLIES}
            scheduleCloseDesktopChatReactionDetails={
              scheduleCloseDesktopChatReactionDetails
            }
            selfNick={selfNick}
            setChatDesktopFontScale={setChatDesktopFontScale}
            showBlockedList={showBlockedList}
            showBotMessages={showBotMessages}
            onToggleShowBotMessages={() => setShowBotMessages((prev) => !prev)}
            visibleMessages={visibleMessages}
          />
        )}
      </div>
      {desktopResizeEnabled &&
        !desktopViewportResizeInProgress &&
        desktopColumnSplitterPositions.map((leftPx, separatorIndex) => {
          const isActive = desktopColumnResizeActiveIndex === separatorIndex;
          return (
            <div
              key={`desktop-col-resizer-${separatorIndex}`}
              className="pointer-events-none absolute inset-y-0 z-[70] flex items-center justify-center"
              style={{ left: `${leftPx}px`, transform: "translateX(-50%)" }}
            >
              <button
                type="button"
                className="group pointer-events-auto flex h-full w-6 touch-none cursor-col-resize items-center justify-center"
                onPointerDown={(event) => startDesktopColumnResize(separatorIndex, event)}
                aria-label={`Redimensionner les colonnes ${separatorIndex + 1} et ${
                  separatorIndex + 2
                }`}
                title="Glisser pour redimensionner"
              >
                <span
                  className={`h-[92%] w-[3px] rounded-full transition-colors ${
                    isActive
                      ? "bg-amber-500/95"
                      : darkMode
                      ? "bg-slate-500/70 group-hover:bg-amber-300/80"
                      : "bg-slate-300/90 group-hover:bg-amber-500/85"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
      </div>
      {!isMobileLayout &&
      desktopColumnHandleLayout.length > 0 &&
      typeof document !== "undefined"
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[115]" aria-hidden="true">
              {desktopColumnHandleLayout.map((entry) => (
                <div
                  key={`desktop-column-handle-${entry.id}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${entry.left}px`, top: `${entry.top}px` }}
                >
                  {renderDesktopColumnHandle(entry.id, entry.label)}
                </div>
              ))}
            </div>,
            document.body
          )
        : null}
      <DesktopResultsSummaryDrawer
        darkMode={darkMode}
        enabled={hasDesktopResultsSummary}
        expanded={desktopResultsSummaryExpanded}
        layout={desktopResultsDrawerLayout}
        onToggleExpanded={() => setDesktopResultsSummaryExpanded((prev) => !prev)}
        renderPanel={renderDesktopResultsDockPanel}
      />
      {roundPreparationOverlay}
      {mobileRoundIntroOverlay}
      {isLoggedIn && appView === "stats" ? statsApplication : null}
      {chatOverlays}
    </>
  );
}
