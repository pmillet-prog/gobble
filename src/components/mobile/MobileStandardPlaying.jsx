import React from "react";
import "./mobileGameViewport.css";

import HelpOverlay from "../HelpOverlay.jsx";
import LiveFeedSatellite from "../../features/live/LiveFeedSatellite.jsx";
import MobileGrid from "../MobileGrid.jsx";
import MobileHeader from "../MobileHeader.jsx";
import MobileWordPreview from "../MobileWordPreview.jsx";
import MobileTargetHintPanel from "./MobileTargetHintPanel.jsx";
import OcidVoteOptionsGrid from "../ocid/OcidVoteOptionsGrid.jsx";
import { MobileLiveRankingPanel } from "../../features/live/LiveRosterSatellites.jsx";
import MobilePresenterActionBar from "../../features/presenters/MobilePresenterActionBar.jsx";

function MobileStandardPlaying(props) {
  const {
    MOBILE_GRID_MAX_WIDTH = 720,
    BONUS_CLASSES = {},
    activeRoom = null,
    allSoundOn = true,
    assetVersion = "",
    boardForRender = [],
    bonusLetterKey = "",
    bonusLetterScore = 0,
    bonusEffectMultiplier = 1,
    chatOverlays = null,
    countdownLines = null,
    darkMode = false,
    defaultTileBaseClass = "",
    duelTeam = null,
    formatNumber = (value) => String(value ?? ""),
    gobbleAwardsForLive = null,
    gridRef = null,
    gridRotationTurns = 0,
    gridSize = 4,
    getTraceCellLabel = null,
    handleMouseDown = null,
    handleMouseMove = null,
    handleMouseUp = null,
    handleTouchEnd = null,
    handleTouchMove = null,
    handleTouchStart = null,
    highlightPlayers = [],
    hintCellSet = null,
    hintCellOverlayStyleMap = null,
    hintCellStyleMap = null,
    hintOutlineCellSet = null,
    hintOutlineOverlayStyleMap = null,
    hintOutlineStyleMap = null,
    implodeActive = false,
    inputControllerRef = null,
    isDailyPlay = false,
    isFinaleBanner = false,
    isMobileLayout = true,
    isOcidRound = false,
    isStandaloneTraining = false,
    isTargetRound = false,
    lightGridSurfaceStyle = undefined,
    showMobileLiveFeed = false,
    liveWord = "",
    liveWordTiles = [],
    mobileBodyHeightStyle = undefined,
    mobileBodyPaddingTop = undefined,
    mobileGapPx = "8px",
    mobileGridSide = 0,
    mobileHeaderRef = null,
    mobileLayoutSizing = {},
    mobileRankingRef = null,
    mobileResultsPhaseFadeOverlay = null,
    mobileRoundIntroHideTiles = false,
    mobileRoundIntroOverlay = null,
    mobileTileFontPx = 18,
    mobileViewportContainerStyle = undefined,
    nextHintLabel = "",
    ocidProposal = "",
    ocidProposalSubmitted = "",
    ocidSelectedOptionId = "",
    ocidStatusMessage = "",
    ocidVote = null,
    normalizeBonusLabel = (value) => value,
    normalizeLetterKey = (value) => value,
    canOpenPlayerProfile = null,
    onOpenDefinition = null,
    onOpenChat = null,
    onOpenPlayerProfile = null,
    onOpenPlayers = null,
    onOpenSettings = null,
    onOcidProposalChange = null,
    onClearOcidProposal = null,
    onSubmitOcidProposal = null,
    onSubmitOcidVote = null,
    onRotateGrid = null,
    onSetShowHelp = null,
    onToggleDarkMode = null,
    onToggleSound = null,
    phase = "playing",
    presentersDisabled = false,
    praiseOverlay = null,
    previewBlockHeight = 0,
    previewGapPx = 0,
    previewTileBaseStyle = undefined,
    getNickClassName = null,
    nickDecorationKey = "",
    renderNickSuffix = null,
    rosterConfig = null,
    roundId = null,
    roundTypeLabel = "",
    roundStats = null,
    roundTilePointsVisible = false,
    selfNick = "",
    shouldDefinitionBlink = false,
    showHelp = false,
    showPreviewStats = false,
    showSolvedTargetLoupe = false,
    solvedTargetWord = "",
    special3LockedStartTileSet = null,
    specialHint = "",
    specialHintDisplay = "",
    specialIndicatorPreset = null,
    specialRound = null,
    specialSolvedOverlay = null,
    targetScoreMax = 0,
    targetWaitDevActive = false,
    onTargetWaitDevGridHostChange = null,
    onTargetWaitDevSideHostChange = null,
    clockOverrideSeconds,
    tileColorPreset = null,
    tileMaterialClass = "",
    tileRefs = null,
    tileScore = null,
    traceBoard = [],
    totalScoreLabel = "",
    totalWordsLabel = "",
    tournament = null,
    trainingControls = null,
    usedSet = null,
  } = props;

  const hideOcidVotePlaySurface = phase === "playing" && isOcidRound && !!ocidVote;
  const adaptiveRanking = mobileLayoutSizing.adaptiveRanking === true;
  const hasReservedFeed = adaptiveRanking || mobileLayoutSizing.targetHintHeight > 0;
  const compactFeed = hasReservedFeed && mobileLayoutSizing.liveFeedHeight < 74;
  const previewStats = React.useMemo(
    () => ({
      show: showPreviewStats,
      totalWordsLabel,
      totalScoreLabel,
    }),
    [
      showPreviewStats,
      totalScoreLabel,
      totalWordsLabel,
    ]
  );
  const closeHelpOverlay = React.useCallback(() => {
    onSetShowHelp?.(false);
  }, [onSetShowHelp]);

  return (
    <>
      <div
        className={`mobile-game-viewport flex flex-col ${
          darkMode ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"
        }`}
        style={mobileViewportContainerStyle}
      >

        <MobileHeader
          activeRoom={activeRoom}
          countdownLines={countdownLines}
          darkMode={darkMode}
          gridSize={gridSize}
          headerRef={mobileHeaderRef}
          isFinaleBanner={isFinaleBanner}
          isTargetRound={isTargetRound}
          onOpenSettings={onOpenSettings}
          onToggleSound={onToggleSound}
          onToggleDarkMode={onToggleDarkMode}
          soundEnabled={allSoundOn}
          playingSeconds={clockOverrideSeconds}
          playerTeam={duelTeam}
          phase={phase}
          roundTypeLabel={roundTypeLabel}
          roomLabelSeparator=" - "
          roundStatsText={
            phase === "playing" && roundStats && !isTargetRound && !isOcidRound
              ? `${roundStats.words ?? "?"} mots - ${
                  formatNumber(roundStats.totalPts ?? roundStats.maxPts ?? 0) || "?"
                } pts`
              : null
          }
          setShowHelp={onSetShowHelp}
          showHelpButton={false}
          showRoundStats={true}
          tournament={tournament}
        />
        <HelpOverlay
          open={showHelp}
          darkMode={darkMode}
          onClose={closeHelpOverlay}
        />

        <div
          className="flex-1 flex flex-col gap-1 px-3 pt-1 pb-2 overflow-hidden box-border"
          style={{
            ...mobileBodyHeightStyle,
            paddingTop: mobileBodyPaddingTop,
          }}
        >
          {isStandaloneTraining ? trainingControls : null}
          {isStandaloneTraining && !isTargetRound ? (
            <div className="h-[92px] min-h-[76px] flex-none rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
              <LiveFeedSatellite
                limit={8}
                darkMode={darkMode}
                maxHeight="100%"
                getNickClassName={getNickClassName}
                showTitle={false}
              />
            </div>
          ) : null}
          {isStandaloneTraining && !isTargetRound ? null : targetWaitDevActive ? (
            <div
              ref={onTargetWaitDevSideHostChange}
              className="relative h-[250px] max-h-[34vh] min-h-[220px] flex-none overflow-hidden rounded-xl"
            />
          ) : phase === "playing" && isOcidRound ? (
            <div
              ref={mobileRankingRef}
              className={`relative rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/90 dark:bg-slate-900/90 shadow-sm overflow-hidden box-border ${
                ocidVote ? "flex flex-1 min-h-0 flex-col" : "flex-none"
              }`}
            >
              <div className="text-[10px] font-extrabold tracking-widest text-center text-amber-500 dark:text-amber-300">
                MANCHE OCID
              </div>
              <div className="mt-2 text-[12px] font-semibold opacity-85 text-center leading-snug shrink-0">
                {ocidVote?.definition || specialRound?.ocidDefinition || "Definition indisponible"}
              </div>
              {ocidVote ? (
                <OcidVoteOptionsGrid
                  className="mt-2"
                  compact={true}
                  darkMode={darkMode}
                  onSelect={onSubmitOcidVote}
                  options={ocidVote.options || []}
                  selectedOptionId={ocidSelectedOptionId}
                />
              ) : (
                <div className="mt-2">
                  <div
                    className={`relative min-h-[34px] w-full rounded-lg border px-2 py-1.5 pr-8 text-sm font-black uppercase tracking-wide ${
                      darkMode
                        ? "border-slate-700 bg-slate-800/80 text-slate-100"
                        : "border-slate-300 bg-slate-50 text-slate-900"
                    }`}
                    aria-live="polite"
                  >
                    {ocidProposal ? (
                      <span className="block truncate">{ocidProposal}</span>
                    ) : (
                      <span className="block truncate font-semibold normal-case tracking-normal text-slate-400">
                        Trace ton mot
                      </span>
                    )}
                    {ocidProposal ? (
                      <button
                        type="button"
                        onClick={() => onClearOcidProposal?.()}
                        className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                        aria-label="Changer de proposition"
                      >
                        <span className="material-icons-outlined text-[16px] leading-none">close</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
              <div className="mt-2 shrink-0 text-[11px] font-semibold opacity-70 text-center">
                {ocidStatusMessage ||
                  (ocidVote
                    ? "Vote pour le vrai mot cible."
                    : ocidProposalSubmitted
                    ? `Retenu : ${ocidProposalSubmitted}`
                    : "Trace un mot plausible. Il sera retenu automatiquement.")}
              </div>
            </div>
          ) : phase === "playing" && isTargetRound ? (
            <MobileTargetHintPanel
              darkMode={darkMode}
              formatNumber={formatNumber}
              height={mobileLayoutSizing.targetHintHeight || Math.min(100, mobileLayoutSizing.rankingHeight || 100)}
              nextHintLabel={nextHintLabel}
              onOpenDefinition={onOpenDefinition}
              panelRef={mobileRankingRef}
              shouldDefinitionBlink={shouldDefinitionBlink}
              showSolvedTargetLoupe={showSolvedTargetLoupe}
              solvedTargetWord={solvedTargetWord}
              specialHint={specialHint}
              specialHintDisplay={specialHintDisplay}
              targetScoreMax={targetScoreMax}
              type={specialRound?.type}
            />
          ) : (
            <MobileLiveRankingPanel
              assetVersion={assetVersion}
              canOpenPlayerProfile={canOpenPlayerProfile}
              darkMode={darkMode}
              getNickClassName={getNickClassName}
              gobbleAwardsForLive={gobbleAwardsForLive}
              highlightedPlayers={highlightPlayers}
              isDailyPlay={isDailyPlay}
              isOcidRound={isOcidRound}
              mobileLayoutSizing={mobileLayoutSizing}
              mobileRankingRef={mobileRankingRef}
              nickDecorationKey={nickDecorationKey}
              onOpenPlayerProfile={onOpenPlayerProfile}
              renderNickSuffix={renderNickSuffix}
              rosterConfig={rosterConfig}
              selfNick={selfNick}
            />
          )}

          {!isOcidRound && !targetWaitDevActive ? (
            <MobileWordPreview
              countdownLines={countdownLines}
              darkMode={darkMode}
              getTraceCellLabel={getTraceCellLabel}
              liveWord={liveWord}
              liveWordTiles={liveWordTiles}
              onRotateGrid={onRotateGrid}
              phase={phase}
              previewBlockHeight={previewBlockHeight}
              previewGapPx={previewGapPx}
              previewTileBaseStyle={previewTileBaseStyle}
              previewStats={previewStats}
              traceBoard={traceBoard}
            />
          ) : null}
          {!hideOcidVotePlaySurface ? (
          <div className="flex-1 min-h-0 flex flex-col gap-1 overflow-hidden">
            <div className="relative w-full shrink-0">
            <MobileGrid
              board={boardForRender}
              BONUS_CLASSES={BONUS_CLASSES}
              bonusLetterKey={bonusLetterKey}
              bonusLetterScore={bonusLetterScore}
              bonusEffectMultiplier={bonusEffectMultiplier}
              celebrationOverlay={praiseOverlay}
              darkMode={darkMode}
              gridRef={gridRef}
              gridSize={gridSize}
              implodeActive={implodeActive}
              gridRotationTurns={gridRotationTurns}
              handleMouseDown={handleMouseDown}
              handleMouseMove={handleMouseMove}
              handleMouseUp={handleMouseUp}
              handleTouchEnd={handleTouchEnd}
              handleTouchMove={handleTouchMove}
              handleTouchStart={handleTouchStart}
              inputControllerRef={inputControllerRef}
              hintCellSet={hintCellSet}
              hintCellOverlayStyleMap={hintCellOverlayStyleMap}
              hintCellStyleMap={hintCellStyleMap}
              hintOutlineCellSet={hintOutlineCellSet}
              hintOutlineOverlayStyleMap={hintOutlineOverlayStyleMap}
              hintOutlineStyleMap={hintOutlineStyleMap}
              isMobileLayout={isMobileLayout}
              lightGridSurfaceStyle={lightGridSurfaceStyle}
              MOBILE_LAYOUT_MAX_WIDTH={MOBILE_GRID_MAX_WIDTH}
              mobileGapPx={mobileGapPx}
              mobileGridSide={mobileGridSide}
              mobileTileFontPx={mobileTileFontPx}
              normalizeBonusLabel={normalizeBonusLabel}
              normalizeLetterKey={normalizeLetterKey}
              phase={phase}
              specialIndicatorPreset={specialIndicatorPreset}
              specialSolvedOverlay={specialSolvedOverlay}
              introHideTiles={mobileRoundIntroHideTiles}
              defaultTileBaseClass={defaultTileBaseClass}
              tilePointsVisible={roundTilePointsVisible}
              tileRefs={tileRefs}
              tileMaterialClass={tileMaterialClass}
              tileColorPreset={tileColorPreset}
              tileScore={tileScore}
              tick={clockOverrideSeconds}
              usedSet={usedSet}
              specialStartTileSet={special3LockedStartTileSet}
            />
            {targetWaitDevActive ? (
              <div
                ref={onTargetWaitDevGridHostChange}
                className="absolute inset-0 z-[45] overflow-hidden rounded-xl"
              />
            ) : null}
            </div>
            {!isStandaloneTraining && (showMobileLiveFeed || hasReservedFeed) ? <div
              className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-3 ${compactFeed ? "py-0.5" : "py-2"} shadow-sm flex-1 min-h-0 overflow-hidden box-border`}
              style={hasReservedFeed ? { minHeight: mobileLayoutSizing.liveFeedMinHeight } : undefined}
            >
              <LiveFeedSatellite
                darkMode={darkMode}
                maxHeight="100%"
                getNickClassName={getNickClassName}
                showTitle={false}
                compact={compactFeed}
              />
            </div> : null}
          </div>
          ) : null}
          {mobileLayoutSizing.liveActionBarHeight > 0 ? (
            <MobilePresenterActionBar
              darkMode={darkMode}
              height={mobileLayoutSizing.liveActionBarHeight}
              hostRef={gridRef}
              onOpenChat={onOpenChat}
              onOpenPlayers={onOpenPlayers}
              presentersDisabled={presentersDisabled}
              roundId={roundId}
            />
          ) : null}
        </div>
      </div>
      {mobileResultsPhaseFadeOverlay}
      {mobileRoundIntroOverlay}
      {chatOverlays}
    </>
  );
}

export default React.memo(MobileStandardPlaying);
