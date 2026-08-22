import React, { Suspense } from "react";
import { clampValue, formatNumber } from "../../utils/numbers.js";
import { tileScore } from "../gameLogic.js";
import { normalizeBonusLabel } from "../daily/dailySpecialModel.js";
import InterTournamentLobby from "../live/InterTournamentLobby.jsx";
import LiveSalonScene from "../live/LiveSalonScene.jsx";
import MiniTournamentStartOverlay from "../live/MiniTournamentStartOverlay.jsx";
import SwapFadeText from "../results/SwapFadeText.jsx";
import TrainingPlayerBadge from "../training/TrainingPlayerBadge.jsx";
import TrainingRoundPicker from "../live/TrainingRoundPicker.jsx";
import MobileStandardPlaying from "./MobileStandardPlaying.jsx";
import { useLiveRosterPresentation } from "../../features/live/useLiveRosterPresentation.js";

const MobileResultsScreen = React.lazy(() => import("./MobileResultsScreen.jsx"));

export default function MobileStandardScene({ state, refs, actions, content, config }) {
  const {
    activeRoom,
    allSoundOn,
    allWords,
    analysis,
    assetVersion,
    boardForRender,
    bonusEffectMultiplier,
    bonusLetterKey,
    bonusLetterScore,
    chatInput,
    chatInputDisabled,
    chatInputPlaceholder,
    chatViewportHeight,
    countdownLines,
    currentDisplay,
    darkMode,
    devRoundTypes,
    displayList,
    duelTeam,
    endStats,
    finalRanking,
    foundDotStyle,
    foundWordsCount,
    gobbleAwardsForLive,
    gridRotationTurns,
    gridShake,
    gridSize,
    guidedResultsEligible,
    guidedResultsStep,
    guidedWordTarget,
    highlightPlayers,
    hintCellOverlayStyleMap,
    hintCellSet,
    hintCellStyleMap,
    hintOutlineCellSet,
    hintOutlineOverlayStyleMap,
    hintOutlineStyleMap,
    implodeActive,
    installId,
    isChatClosing,
    isChatOpenMobile,
    isDailyPlay,
    isFinaleBanner,
    isMobileLayout,
    isOcidRound,
    isSpeedRound,
    isTargetRound,
    liveFeedBannerText,
    liveWord,
    liveWordTiles,
    mobileAnnouncements,
    mobileLayoutSizing,
    mobileResultPages,
    mobileResultsPage,
    mobileResultsPhaseFadeOverlay,
    mobileRoundIntroHideTiles,
    mobileRoundIntroOverlay,
    nextHintLabel,
    nickDecorationKey,
    ocidProposal,
    ocidProposalSubmitted,
    ocidSelectedOptionId,
    ocidStatusMessage,
    ocidVote,
    phase,
    rankingSource: rankingSourceProp,
    recordBadgesByNickForRound,
    resultsRankingMode,
    resultsReorderTick,
    resultsSlidePhase,
    roundPreparing,
    roundStats,
    roundTilePointsVisible,
    scoreLabel,
    selfNick,
    selfReadyForTournament: selfReadyForTournamentProp,
    shake,
    shouldDefinitionBlink,
    showAllWords,
    showHelp,
    showOfflineResultsLabel,
    showPreviewStats,
    showSolvedTargetLoupe,
    solvedTargetWord,
    special3LockedStartTileSet,
    specialHint,
    specialHintDisplay,
    specialRound,
    specialSolvedOverlay,
    standaloneTrainingSession,
    suppressLiveChatMotion,
    suppressWordListScores,
    targetScoreMax,
    targetSummary,
    targetWaitDevActive,
    targetWaitDevSessionState,
    tileColorPreset,
    tileMaterialClass,
    totalScoreLabel,
    totalWordsLabel,
    tournament,
    tournamentLobby,
    tournamentRanking,
    trainingBusy,
    usedSet,
    visibleMessages,
    visiblePlayerList: visiblePlayerListProp,
    vocabLevelUp,
    wordsFoundLabel,
    rosterConfig,
  } = state;
  const roster = useLiveRosterPresentation(rosterConfig);
  const rankingSource = roster.rankingSource;
  const selfReadyForTournament = roster.selfReadyForTournament;
  const visiblePlayerList = roster.visiblePlayerList;
  const {
    chatBodyLockHeightRef,
    gridInputControllerRef,
    gridRef,
    listItemRefs,
    mobileGameViewportLockRef,
    mobileHeaderRef,
    mobileRankingRef,
    tileRefs,
  } = refs;
  const {
    analyzeWord,
    getLiveNickClassName,
    getLivePreviewLabelForCell,
    getNowServerMs,
    getRoundRecordsForPlayer,
    goToResultsPage,
    handleChatInputFocus,
    handleClearOcidProposal,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleOcidProposalChange,
    handleResultsTouchEnd,
    handleResultsTouchMove,
    handleResultsTouchStart,
    handleTouchEnd,
    handleTouchMove,
    handleTouchStart,
    normalizeLetterKey,
    openDefinition,
    openPlayersOverlaySnapshot,
    openRoundPlayerModal,
    openSettingsPanel,
    openWordInfoModal,
    renderDesktopResultsDockPanel,
    renderGobbleCandidate,
    renderMobileNickSuffix,
    renderNickSuffix,
    renderRankDelta,
    renderVocabPanel,
    rotateGridClockwise,
    setAnalysis,
    setChatInput,
    setGuidedResultsStep,
    setHighlightPath,
    setHighlightPlayers,
    setShowHelp,
    setTargetWaitDevGridHost,
    setTargetWaitDevSideHost,
    setTournamentReady,
    stableCanOpenPlayerProfile,
    stableOpenPlayerProfile,
    startTrainingRound,
    submitChat,
    submitOcidProposal,
    submitOcidVote,
    toggleDarkModeQuick,
    toggleSoundQuick,
  } = actions;
  const {
    chatOverlays,
    globalChatLayer,
    ocidMobileResultOverlay,
    praiseOverlay,
    roundPreparationOverlay,
    trainingSessionControls,
  } = content;
  const {
    BONUS_CLASSES,
    DARK_WORD_INACTIVE,
    GUIDED_RESULTS_STEPS,
    MOBILE_GRID_MAX_WIDTH,
    WORDS_SCROLL_MAX_HEIGHT,
    defaultTileBaseClass,
    lightGridSurfaceStyle,
    specialIndicatorPreset,
  } = config;

    const isResults = phase === "results";
    const fullRanking = isResults
      ? resultsRankingMode === "total"
        ? tournamentRanking || []
        : finalRanking || []
      : rankingSource || [];
    const lockedGameViewportWidth =
      Number(mobileGameViewportLockRef.current?.width) || 0;
    const lockedGameViewportHeight =
      Number(mobileGameViewportLockRef.current?.height) || 0;
    const fallbackViewportWidth =
      lockedGameViewportWidth ||
      mobileLayoutSizing.viewportWidth ||
      (typeof window !== "undefined" ? window.innerWidth : 360);
    const fallbackBodyHeight =
      lockedGameViewportHeight ||
      mobileLayoutSizing.bodyHeight ||
      (typeof window !== "undefined" ? window.innerHeight * 0.6 : 520);
    const mobileGridSide = Math.round(
      mobileLayoutSizing.gridSide ||
        Math.max(200, Math.min(fallbackViewportWidth - 24, MOBILE_GRID_MAX_WIDTH))
    );
    const previewFallback = 52;
    const liveFeedFallback = 0;
    const mobilePreviewHeight = Math.round(
      mobileLayoutSizing.wordPreviewHeight || previewFallback
    );
    const mobileLiveFeedHeight = Math.round(
      mobileLayoutSizing.liveFeedHeight || liveFeedFallback
    );
    const previewBlockHeight = Math.max(0, mobilePreviewHeight);
    const liveFeedMinHeight = Math.max(0, mobileLiveFeedHeight);
    const previewWordLen = liveWord ? liveWord.length : 0;
    const previewGapPx = previewWordLen >= 10 ? 2 : 4;
    const previewContentWidth = Math.max(0, fallbackViewportWidth - 44); // px-3 + px-2.5
    const previewMaxTileWidth = previewWordLen
      ? Math.floor(
          (previewContentWidth - previewGapPx * (previewWordLen - 1)) /
            previewWordLen
        )
      : 32;
    const previewTileWidth = clampValue(previewMaxTileWidth, 18, 32);
    const previewTileHeight = Math.min(
      Math.round(previewTileWidth * 1.125),
      Math.max(18, previewBlockHeight - 16)
    );
    const previewTileFontPx = clampValue(
      Math.round(previewTileWidth * 0.56),
      12,
      18
    );
    const previewTileBaseStyle = {
      width: `${previewTileWidth}px`,
      height: `${previewTileHeight}px`,
      fontSize: `${previewTileFontPx}px`,
    };
    const specialBlockHeight = Math.round(mobileLayoutSizing.rankingHeight || 0);
    const specialBaseHeight = 120;
    const specialScale =
      specialBlockHeight > 0
        ? Math.min(1, specialBlockHeight / specialBaseHeight)
        : 1;
    const specialTitleFont = Math.max(9, Math.round(11 * specialScale));
    const specialWordFont = Math.max(16, Math.round(24 * specialScale));
    const specialMetaFont = Math.max(9, Math.round(11 * specialScale));
    const specialPadY = Math.max(6, Math.round(8 * specialScale));
    const mobileGapPx = "clamp(6px, 2.4vw, 14px)";
    const mobileTileFontPx = Math.max(
      18,
      Math.min(
        32,
        Math.round((mobileGridSide / Math.max(gridSize, 1)) * 0.35)
      )
    );
    const mobileBodyHeightStyle =
      mobileLayoutSizing.bodyHeight > 0
        ? { height: `${Math.round(mobileLayoutSizing.bodyHeight)}px`, minHeight: 0 }
        : {
            minHeight: "calc(100vh - 96px)",
            height: "calc(100dvh - 96px)",
          };
    const mobileBodyPaddingTop = undefined;

    const useVisualViewport = !(isChatOpenMobile || isChatClosing);
    const lockedChatHeight = chatBodyLockHeightRef.current || null;
    const mobileViewportHeightCandidates =
      typeof window !== "undefined"
        ? (useVisualViewport
            ? [
                lockedGameViewportHeight,
                mobileLayoutSizing.viewportHeight,
                window.innerHeight,
                typeof document !== "undefined"
                  ? document.documentElement?.clientHeight
                  : null,
              ]
            : lockedChatHeight
            ? [lockedChatHeight]
            : [
                lockedGameViewportHeight,
                window.innerHeight,
                typeof document !== "undefined"
                  ? document.documentElement?.clientHeight
                  : null,
              ]
          ).filter((v) => Number.isFinite(v) && v > 0)
        : [];
    const mobileViewportHeight = mobileViewportHeightCandidates.length
      ? Math.min(...mobileViewportHeightCandidates)
      : 0;
    const chatViewportHeightEffective =
      chatBodyLockHeightRef.current || chatViewportHeight || mobileViewportHeight;
    // Keep the viewport container anchored to the safe area only.
    // Using the live header measurement here can make the header offset chase itself.
    const fullscreenTopPadding = "env(safe-area-inset-top)";
    const mobileViewportContainerStyle =
      mobileViewportHeight > 0
        ? {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            width: "100%",
            minHeight: `${Math.round(mobileViewportHeight)}px`,
            height: `${Math.round(mobileViewportHeight)}px`,
            maxHeight: `${Math.round(mobileViewportHeight)}px`,
            overflow: "hidden",
            overscrollBehavior: "none",
            paddingTop: fullscreenTopPadding,
            paddingBottom: "env(safe-area-inset-bottom)",
          }
        : {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            width: "100%",
            minHeight: "100vh",
            height: "100dvh",
            maxHeight: "100dvh",
            overflow: "hidden",
            overscrollBehavior: "none",
            paddingTop: fullscreenTopPadding,
            paddingBottom: "env(safe-area-inset-bottom)",
          };

    if (isResults) {
      const resultsPages = mobileResultPages;
      const safeResultsPage = clampValue(mobileResultsPage, 0, resultsPages.length - 1);
      const resultsPageKey = resultsPages[safeResultsPage];
      const showVocabPage = resultsPageKey === "vocab";
      const resultsRankingModeForMobile = resultsPageKey === "total" ? "total" : "round";
      const resultsRankingList =
        resultsRankingModeForMobile === "total"
          ? tournamentRanking || []
          : finalRanking || [];
      const showResultsWords =
        resultsPageKey === "found" || resultsPageKey === "all";
      const resultsFadeClass =
        resultsSlidePhase === "out"
          ? "results-fade-out"
          : resultsSlidePhase === "in"
          ? "results-fade-in"
          : "";
      const resultsHeaderLabel = resultsPageKey === "target"
        ? "Résultat cible"
        : showResultsWords
        ? "Mots"
        : showVocabPage
        ? "Vocabulaire"
        : "Classement";
      const resultsHeaderSuffix = showResultsWords || showVocabPage
        ? ""
        : resultsPageKey === "round"
        ? "manche"
        : "g\u00e9n\u00e9ral";
      const resultsWordsTitle =
        resultsPageKey === "found"
          ? `Mots trouv\u00e9s (${foundWordsCount})`
          : `Tous les mots (${allWords.length})`;
      const wordsEmpty =
        resultsPageKey === "all"
          ? allWords.length === 0
          : foundWordsCount === 0;
      const guidedSwipeHintText =
        guidedResultsEligible && guidedResultsStep === GUIDED_RESULTS_STEPS.SWIPE_TOTAL && resultsPageKey === "round"
          ? "pour voir le classement général"
          : guidedResultsEligible && guidedResultsStep === GUIDED_RESULTS_STEPS.SWIPE_FOUND && resultsPageKey === "total"
          ? "pour voir les mots trouvés"
          : guidedResultsEligible && guidedResultsStep === GUIDED_RESULTS_STEPS.SWIPE_ALL && resultsPageKey === "found"
          ? "pour voir tous les mots trouvables"
          : null;
      const guidedPseudoOverlay =
        guidedResultsEligible &&
        guidedResultsStep === GUIDED_RESULTS_STEPS.TAP_PSEUDO &&
        resultsPageKey === "round" ? (
          <div className="absolute inset-0 z-30 pointer-events-none">
            <div
              className="absolute top-3 left-3 right-3 rounded-2xl px-4 py-3 shadow-xl pointer-events-auto border border-amber-300 bg-amber-500 text-slate-900"
            >
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[24px] mt-0.5">touch_app</span>
                <div className="flex-1">
                  <div className="text-[15px] font-bold leading-tight">
                    Clique sur un pseudo dans ce classement
                  </div>
                  <div className="text-[13px] opacity-80 leading-snug">
                    Tu peux voir ses mots trouvés sur la manche.
                  </div>
                </div>
                <button
                  type="button"
                  className="px-3 py-1 rounded-full text-[12px] font-semibold border bg-amber-400 border-amber-300 text-slate-900"
                  onClick={() => setGuidedResultsStep(GUIDED_RESULTS_STEPS.SWIPE_TOTAL)}
                >
                  Compris
                </button>
              </div>
            </div>
            <div className="absolute top-20 left-8">
              <span className="material-symbols-outlined text-[38px] text-amber-500">
                arrow_downward
              </span>
            </div>
          </div>
        ) : null;
      const guidedSwipeOverlay = guidedSwipeHintText ? (
        <div className="absolute inset-0 pointer-events-none z-30">
          <div
            className="absolute bottom-4 right-4 flex items-center gap-3 rounded-full px-5 py-4 text-[20px] font-semibold shadow-xl border border-amber-300 bg-amber-500 text-slate-900"
            style={{ opacity: 1 }}
          >
            <span className="material-symbols-outlined text-[40px] guide-swipe">
              swipe_left
            </span>
            <span>{guidedSwipeHintText}</span>
          </div>
        </div>
      ) : null;
      const showGuidedWordHint =
        guidedResultsEligible &&
        guidedResultsStep === GUIDED_RESULTS_STEPS.TAP_WORD &&
        resultsPageKey === "all" &&
        guidedWordTarget;
      const guidedWordOverlay = showGuidedWordHint ? (
        <div className="absolute inset-0 pointer-events-none z-30">
          <div
            className="absolute bottom-4 left-3 flex items-center gap-3 rounded-full px-4 py-3 text-[18px] font-semibold shadow-xl border border-amber-300 bg-amber-500 text-slate-900"
            style={{
              maxWidth: "360px",
              opacity: 1,
            }}
          >
            <span className="material-symbols-outlined text-[32px]">
              gesture_select
            </span>
            <span>Clique sur un mot pour savoir qui l'a trouvé</span>
          </div>
        </div>
      ) : null;
      const isTargetResults = isTargetRound && !standaloneTrainingSession;
      const resultsCardClassName = `relative rounded-xl px-3 py-2 flex flex-col gap-2 overflow-hidden ${
        isTargetResults ? "flex-none" : "flex-1 min-h-0"
      } ${darkMode ? "bg-slate-900/90" : "bg-white/90"} box-border`;
      const resultsCardStyle = isTargetResults
        ? { height: "46vh", minHeight: "38vh", maxHeight: "52vh" }
        : standaloneTrainingSession
        ? { minHeight: 0 }
        : { minHeight: "320px" };
      const showResultsDots = resultsPages.length > 1;
      const summaryWrapperClass = isTargetResults
        ? showResultsDots
          ? "flex-none"
          : "-mt-1 flex-none"
        : showResultsDots
        ? "mt-1"
        : "mt-2";
      const mobileResultsSummaryStyle = {
        marginBottom: "calc(clamp(92px, 24vw, 142px) + env(safe-area-inset-bottom))",
      };
      const resultsDots = showResultsDots ? (
        <div className="flex items-center justify-center gap-1.5 py-1">
          {resultsPages.map((page, idx) => {
            const isActive = idx === safeResultsPage;
            const isVocabDot = page === "vocab";
            const showVocabAlert = isVocabDot && vocabLevelUp;
            const dotColor = showVocabAlert
              ? "bg-red-500"
              : isActive
              ? darkMode
                ? "bg-slate-100"
                : "bg-slate-900"
              : darkMode
              ? "bg-white/30"
              : "bg-slate-300";
            return (
              <button
                key={page}
                type="button"
                className={`h-2.5 w-2.5 rounded-full transition ${dotColor} ${
                  isActive ? "scale-110" : ""
                } ${showVocabAlert ? "animate-pulse" : ""}`}
                aria-label={`Page ${idx + 1}`}
                aria-current={isActive ? "true" : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  goToResultsPage(idx);
                }}
              />
            );
          })}
        </div>
      ) : null;
      return (
        <>
          <Suspense fallback={null}>
            <MobileResultsScreen
            WORDS_SCROLL_MAX_HEIGHT={WORDS_SCROLL_MAX_HEIGHT}
            DARK_WORD_INACTIVE={DARK_WORD_INACTIVE}
            SwapFadeTextComponent={SwapFadeText}
            activeRoom={activeRoom}
            allSoundOn={allSoundOn}
            analysis={analysis}
            assetVersion={assetVersion}
            chatOverlays={chatOverlays}
            countdownLines={countdownLines}
            darkMode={darkMode}
            displayList={displayList}
            duelTeam={duelTeam}
            endStats={endStats}
            foundDotStyle={foundDotStyle}
            getRoundRecordsForPlayer={getRoundRecordsForPlayer}
            gobbleAwardsForLive={gobbleAwardsForLive}
            gridSize={gridSize}
            guidedPseudoOverlay={guidedPseudoOverlay}
            guidedSwipeOverlay={guidedSwipeOverlay}
            guidedWordOverlay={guidedWordOverlay}
            handleResultsTouchEnd={handleResultsTouchEnd}
            handleResultsTouchMove={handleResultsTouchMove}
            handleResultsTouchStart={handleResultsTouchStart}
            isFinaleBanner={isFinaleBanner}
            isSpeedRound={isSpeedRound}
            isStandaloneTraining={!!standaloneTrainingSession}
            isTargetRound={isTargetRound}
            listItemRefs={listItemRefs}
            mobileBodyHeightStyle={mobileBodyHeightStyle}
            mobileBodyPaddingTop={mobileBodyPaddingTop}
            mobileHeaderRef={mobileHeaderRef}
            mobileResultsPhaseFadeOverlay={
              suppressLiveChatMotion ? null : mobileResultsPhaseFadeOverlay
            }
            mobileResultsSummaryStyle={mobileResultsSummaryStyle}
            mobileViewportContainerStyle={mobileViewportContainerStyle}
            onAnalyzeWord={analyzeWord}
            onClearAnalysis={() => {
              setAnalysis(null);
              setHighlightPath([]);
              setHighlightPlayers([]);
            }}
            onGoToResultsPage={goToResultsPage}
            onOpenPlayerProfile={stableOpenPlayerProfile}
            onOpenRoundPlayerModal={openRoundPlayerModal}
            onOpenSettings={openSettingsPanel}
            onOpenWordInfoModal={openWordInfoModal}
            onSetShowHelp={setShowHelp}
            onToggleDarkMode={toggleDarkModeQuick}
            onToggleSound={toggleSoundQuick}
            praiseOverlay={praiseOverlay}
            recordBadgesByNickForRound={recordBadgesByNickForRound}
            renderDesktopResultsDockPanel={renderDesktopResultsDockPanel}
            renderGobbleCandidate={renderGobbleCandidate}
            renderNickSuffix={renderNickSuffix}
            renderRankDelta={renderRankDelta}
            renderVocabPanel={renderVocabPanel}
            resultsCardClassName={resultsCardClassName}
            resultsCardStyle={resultsCardStyle}
            resultsDots={resultsDots}
            resultsFadeClass={resultsFadeClass}
            resultsHeaderLabel={resultsHeaderLabel}
            resultsHeaderSuffix={resultsHeaderSuffix}
            roundTypeLabel={standaloneTrainingSession?.label || ""}
            resultsPageKey={resultsPageKey}
            resultsRankingList={resultsRankingList}
            resultsRankingModeForMobile={resultsRankingModeForMobile}
            resultsReorderTick={resultsReorderTick}
            resultsWordsTitle={resultsWordsTitle}
            selfNick={selfNick}
            getNickClassName={getLiveNickClassName}
            nickDecorationKey={nickDecorationKey}
            showAllWords={showAllWords}
            showHelp={showHelp}
            showOfflineResultsLabel={showOfflineResultsLabel}
            showResultsWords={showResultsWords}
            showVocabPage={showVocabPage}            summaryWrapperClass={summaryWrapperClass}
            suppressWordListScores={suppressWordListScores}
            targetSummary={targetSummary}
            tournament={standaloneTrainingSession ? null : tournament}
            trainingControls={trainingSessionControls}
            trainingFeedItems={mobileAnnouncements}
            trainingFeedBannerText={liveFeedBannerText}
            trainingFeedNickClassName={getLiveNickClassName}
            visibleWordGuidance={showGuidedWordHint ? guidedWordTarget : false}
            wordsEmpty={wordsEmpty}
            />
          </Suspense>
          {roundPreparationOverlay}
          {ocidMobileResultOverlay}
          {globalChatLayer}
        </>
      );
    }

    if (phase === "lobby") {
      const mobileSalonTopControls = (
        <div className={`rounded-xl border px-3 py-2 ${darkMode ? "border-white/10 bg-slate-950/70 text-slate-100" : "border-amber-200/70 bg-white/75 text-slate-900"}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-black tracking-[0.16em]">GOBBLE</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSoundQuick}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${
                  darkMode ? "border-white/10 bg-slate-900/85" : "border-amber-200/80 bg-white/75"
                }`}
                aria-label={allSoundOn ? "Couper le son" : "Activer le son"}
                title={allSoundOn ? "Son actif" : "Son coupe"}
              >
                <span className="material-symbols-outlined text-[21px]" aria-hidden="true">
                  {allSoundOn ? "volume_up" : "volume_off"}
                </span>
              </button>
              <button
                type="button"
                onClick={openSettingsPanel}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${
                  darkMode ? "border-white/10 bg-slate-900/85" : "border-amber-200/80 bg-white/75"
                }`}
                aria-label="Ouvrir les réglages"
                title="Réglages"
              >
                <span className="material-symbols-outlined text-[21px]" aria-hidden="true">
                  settings
                </span>
              </button>
            </div>
          </div>
        </div>
      );
      const mobileSalonPlayersControls = (
        <div className={`rounded-xl border p-3 ${darkMode ? "border-white/10 bg-slate-950/70 text-slate-100" : "border-amber-200/70 bg-white/75 text-slate-900"}`}>
          <div className="mb-2 text-xs font-bold uppercase tracking-widest opacity-70">
            Joueurs connectés
          </div>
          {visiblePlayerList.length > 0 ? (
            <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
              {visiblePlayerList.map((p) => {
                const nickClassName = getLiveNickClassName(p, p.nick);
                return (
                  <span
                    key={p.nick}
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${
                      darkMode ? "border-white/10 bg-slate-900/80" : "border-amber-200/80 bg-white/75"
                    }`}
                  >
                    <span className={nickClassName}>{p.nick}</span>
                    {p?.inTraining ? <span className="ml-1 inline-flex align-middle"><TrainingPlayerBadge compact /></span> : null}
                    {p?.afk ? (
                      <span className="ml-1 text-[10px] font-extrabold italic text-red-600 dark:text-red-300">
                        AFK
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="text-sm font-semibold opacity-60">Aucun joueur connecté.</div>
          )}
        </div>
      );
      return (
        <>
          <LiveSalonScene
            chatInput={chatInput}
            chatInputDisabled={chatInputDisabled}
            chatInputPlaceholder={chatInputPlaceholder}
            className="fixed inset-0 z-[1200] live-salon-scene-fullscreen"
            getAuthorNickClassName={getLiveNickClassName}
            isMobile={true}
            onChatInputFocus={handleChatInputFocus}
            playersControls={mobileSalonPlayersControls}
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
            topControls={mobileSalonTopControls}
            trainingControls={
              <TrainingRoundPicker
                darkMode={darkMode}
                devRoundTypes={devRoundTypes}
                lobby={tournamentLobby}
                onTrainingStart={startTrainingRound}
                trainingBusy={trainingBusy}
              />
            }
            visibleMessages={visibleMessages}
          />
          {chatOverlays}
          <MiniTournamentStartOverlay
            lobby={tournamentLobby}
            preparing={!!roundPreparing}
            serverNowMs={getNowServerMs()}
          />
        </>
      );
    }

    return (
      <>
        <MobileStandardPlaying
        MOBILE_GRID_MAX_WIDTH={MOBILE_GRID_MAX_WIDTH}
        BONUS_CLASSES={BONUS_CLASSES}
        activeRoom={activeRoom}
        allSoundOn={allSoundOn}
        assetVersion={assetVersion}
        boardForRender={boardForRender}
        bonusLetterKey={bonusLetterKey}
        bonusLetterScore={bonusLetterScore}
        bonusEffectMultiplier={bonusEffectMultiplier}
        chatOverlays={chatOverlays}
        countdownLines={countdownLines}
        currentDisplay={currentDisplay}
        darkMode={darkMode}
        defaultTileBaseClass={defaultTileBaseClass}
        duelTeam={duelTeam}
        formatNumber={formatNumber}
        fullRanking={fullRanking}
        gobbleAwardsForLive={gobbleAwardsForLive}
        getTraceCellLabel={getLivePreviewLabelForCell}
        getNickClassName={getLiveNickClassName}
        nickDecorationKey={nickDecorationKey}
        gridRef={gridRef}
        gridRotationTurns={gridRotationTurns}
        gridShake={gridShake}
        gridSize={gridSize}
        inputControllerRef={gridInputControllerRef}
        handleMouseDown={handleMouseDown}
        handleMouseMove={handleMouseMove}
        handleMouseUp={handleMouseUp}
        handleTouchEnd={handleTouchEnd}
        handleTouchMove={handleTouchMove}
        handleTouchStart={handleTouchStart}
        highlightPlayers={highlightPlayers}
        hintCellSet={hintCellSet}
        hintCellOverlayStyleMap={hintCellOverlayStyleMap}
        hintCellStyleMap={hintCellStyleMap}
        hintOutlineCellSet={hintOutlineCellSet}
        hintOutlineOverlayStyleMap={hintOutlineOverlayStyleMap}
        hintOutlineStyleMap={hintOutlineStyleMap}
        implodeActive={implodeActive}
        isChatOpenMobile={isChatOpenMobile}
        isDailyPlay={isDailyPlay}
        isFinaleBanner={isFinaleBanner}
        isMobileLayout={isMobileLayout}
        isOcidRound={isOcidRound}
        isStandaloneTraining={!!standaloneTrainingSession}
        isTargetRound={isTargetRound || targetWaitDevActive}
        lightGridSurfaceStyle={lightGridSurfaceStyle}
        liveFeedMinHeight={liveFeedMinHeight}
        liveFeedBannerText={liveFeedBannerText}
        liveWord={liveWord}
        liveWordTiles={liveWordTiles}
        mobileAnnouncements={mobileAnnouncements}
        mobileBodyHeightStyle={mobileBodyHeightStyle}
        mobileBodyPaddingTop={mobileBodyPaddingTop}
        mobileGapPx={mobileGapPx}
        mobileGridSide={mobileGridSide}
        mobileHeaderRef={mobileHeaderRef}
        mobileLayoutSizing={mobileLayoutSizing}
        mobileRankingRef={mobileRankingRef}
        mobileResultsPhaseFadeOverlay={
          suppressLiveChatMotion ? null : mobileResultsPhaseFadeOverlay
        }
        mobileRoundIntroHideTiles={mobileRoundIntroHideTiles}
        mobileRoundIntroOverlay={suppressLiveChatMotion ? null : mobileRoundIntroOverlay}
        mobileTileFontPx={mobileTileFontPx}
        mobileViewportContainerStyle={mobileViewportContainerStyle}
        nextHintLabel={nextHintLabel}
        normalizeBonusLabel={normalizeBonusLabel}
        normalizeLetterKey={normalizeLetterKey}
        ocidProposal={ocidProposal}
        ocidProposalSubmitted={ocidProposalSubmitted}
        ocidSelectedOptionId={ocidSelectedOptionId}
        ocidStatusMessage={ocidStatusMessage}
        ocidVote={ocidVote}
        onOpenDefinition={openDefinition}
        onOpenPlayerProfile={stableOpenPlayerProfile}
        onOpenPlayersOverlaySnapshot={openPlayersOverlaySnapshot}
        onOcidProposalChange={handleOcidProposalChange}
        onClearOcidProposal={handleClearOcidProposal}
        onSubmitOcidProposal={submitOcidProposal}
        onSubmitOcidVote={submitOcidVote}
        onOpenSettings={openSettingsPanel}
        onRotateGrid={rotateGridClockwise}
        onSetShowHelp={setShowHelp}
        onToggleDarkMode={toggleDarkModeQuick}
        onToggleSound={toggleSoundQuick}
        phase={phase}
        praiseOverlay={praiseOverlay}
        previewBlockHeight={previewBlockHeight}
        previewGapPx={previewGapPx}
        previewTileBaseStyle={previewTileBaseStyle}
        renderNickSuffix={renderMobileNickSuffix}
        canOpenPlayerProfile={stableCanOpenPlayerProfile}
        roundTypeLabel={standaloneTrainingSession?.label || ""}
        roundStats={roundStats}
        roundTilePointsVisible={roundTilePointsVisible}
        scoreLabel={scoreLabel}
        selfNick={selfNick}
        shake={shake}
        shouldDefinitionBlink={shouldDefinitionBlink}
        showHelp={showHelp}
        showPreviewStats={showPreviewStats}
        showSolvedTargetLoupe={showSolvedTargetLoupe}        solvedTargetWord={solvedTargetWord}
        special3LockedStartTileSet={special3LockedStartTileSet}
        specialBlockHeight={specialBlockHeight}
        specialHint={specialHint}
        specialHintDisplay={specialHintDisplay}
        specialIndicatorPreset={specialIndicatorPreset}
        specialMetaFont={specialMetaFont}
        specialPadY={specialPadY}
        specialRound={specialRound}
        specialScale={specialScale}
        specialSolvedOverlay={specialSolvedOverlay}
        specialTitleFont={specialTitleFont}
        specialWordFont={specialWordFont}
        targetScoreMax={targetScoreMax}
        targetWaitDevActive={targetWaitDevActive}
        onTargetWaitDevGridHostChange={setTargetWaitDevGridHost}
        onTargetWaitDevSideHostChange={setTargetWaitDevSideHost}
        clockOverrideSeconds={
          targetWaitDevActive
            ? targetWaitDevSessionState.remainingSeconds
            : undefined
        }
        tileColorPreset={tileColorPreset}
        tileMaterialClass={tileMaterialClass}
        tileRefs={tileRefs}
        tileScore={tileScore}
        traceBoard={boardForRender}
        totalScoreLabel={totalScoreLabel}
        totalWordsLabel={totalWordsLabel}
        tournament={standaloneTrainingSession ? null : tournament}
        trainingControls={trainingSessionControls}
        usedSet={usedSet}
        wordsFoundLabel={wordsFoundLabel}
      />
      {roundPreparationOverlay}
      {globalChatLayer}
    </>
  );
  }
