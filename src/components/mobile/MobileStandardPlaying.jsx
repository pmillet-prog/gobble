import React from "react";

import HelpOverlay from "../HelpOverlay.jsx";
import LiveFeed from "../LiveFeed.jsx";
import MobileGrid from "../MobileGrid.jsx";
import MobileHeader from "../MobileHeader.jsx";
import MobileWordPreview from "../MobileWordPreview.jsx";
import TargetHintPattern from "../TargetHintPattern.jsx";
import OcidVoteOptionsGrid from "../ocid/OcidVoteOptionsGrid.jsx";
import { MobileLiveRankingPanel } from "../../features/live/LiveRosterSatellites.jsx";

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
    currentDisplay = "",
    darkMode = false,
    defaultTileBaseClass = "",
    duelTeam = null,
    formatNumber = (value) => String(value ?? ""),
    liveFeedBannerText = "",
    gobbleAwardsForLive = null,
    gridRef = null,
    gridRotationTurns = 0,
    gridShake = false,
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
    isChatOpenMobile = false,
    isDailyPlay = false,
    isFinaleBanner = false,
    isMobileLayout = true,
    isOcidRound = false,
    isStandaloneTraining = false,
    isTargetRound = false,
    lightGridSurfaceStyle = undefined,
    liveFeedMinHeight = 0,
    liveWord = "",
    liveWordTiles = [],
    mobileAnnouncements = [],
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
    onOpenPlayerProfile = null,
    onOpenPlayersOverlaySnapshot = null,
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
    praiseOverlay = null,
    previewBlockHeight = 0,
    previewGapPx = 0,
    previewTileBaseStyle = undefined,
    getNickClassName = null,
    nickDecorationKey = "",
    renderNickSuffix = null,
    rosterConfig = null,
    roundTypeLabel = "",
    roundStats = null,
    roundTilePointsVisible = false,
    scoreLabel = "",
    selfNick = "",
    shake = false,
    shouldDefinitionBlink = false,
    showHelp = false,
    showPreviewStats = false,
    showSolvedTargetLoupe = false,
    solvedTargetWord = "",
    special3LockedStartTileSet = null,
    specialBlockHeight = 0,
    specialHint = "",
    specialHintDisplay = "",
    specialIndicatorPreset = null,
    specialMetaFont = 10,
    specialPadY = 6,
    specialRound = null,
    specialScale = 1,
    specialSolvedOverlay = null,
    specialTitleFont = 9,
    specialWordFont = 16,
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
    wordsFoundLabel = "",
  } = props;

  const hideOcidVotePlaySurface = phase === "playing" && isOcidRound && !!ocidVote;
  const solvedTargetLength = String(solvedTargetWord || "").trim().length;
  const isSolvedTargetDisplay = solvedTargetLength > 0;
  const solvedTargetFontPx = isSolvedTargetDisplay
    ? Math.max(
        11,
        Math.min(
          specialWordFont,
          Math.round((specialWordFont * 12) / Math.max(12, solvedTargetLength))
        )
      )
    : specialWordFont;
  const previewStats = React.useMemo(
    () => ({
      show: showPreviewStats,
      wordsFoundLabel,
      totalWordsLabel,
      scoreLabel,
      totalScoreLabel,
    }),
    [showPreviewStats, wordsFoundLabel, totalWordsLabel, scoreLabel, totalScoreLabel]
  );
  const closeHelpOverlay = React.useCallback(() => {
    onSetShowHelp?.(false);
  }, [onSetShowHelp]);

  return (
    <>
      <div
        className={`flex flex-col ${
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
              <LiveFeed
                items={mobileAnnouncements}
                darkMode={darkMode}
                maxHeight="100%"
                bannerText={liveFeedBannerText}
                getNickClassName={getNickClassName}
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
            <div
              ref={mobileRankingRef}
              className="relative rounded-xl border border-slate-200 dark:border-slate-700 px-3 bg-white/90 dark:bg-slate-900/90 shadow-sm flex-none overflow-hidden box-border"
              style={
                specialBlockHeight > 0
                  ? {
                      height: `${specialBlockHeight}px`,
                      maxHeight: `${specialBlockHeight}px`,
                      minHeight: 0,
                      paddingTop: `${specialPadY}px`,
                      paddingBottom: `${specialPadY}px`,
                    }
                  : { paddingTop: `${specialPadY}px`, paddingBottom: `${specialPadY}px` }
              }
            >
              <div
                className="font-extrabold tracking-widest text-center text-amber-500 dark:text-amber-300"
                style={{ fontSize: `${specialTitleFont}px` }}
              >
                {specialRound?.type === "target_long"
                  ? "TROUVE LE PLUS LONG MOT"
                  : specialRound?.type === "target_score"
                  ? "TROUVE LE MEILLEUR MOT"
                  : "MANCHE SPECIALE"}
              </div>
              <div
                className={`mt-2 text-center font-black tabular-nums ${
                  isSolvedTargetDisplay ? "tracking-normal" : "tracking-widest"
                }`}
                style={{ fontSize: `${specialWordFont}px` }}
              >
                {specialHintDisplay ? (
                  <span
                    className={`inline-flex items-center justify-center gap-2 ${
                      isSolvedTargetDisplay ? "max-w-full min-w-0" : ""
                    }`}
                  >
                    <TargetHintPattern
                      display={specialHintDisplay}
                      revealedWordIndices={specialHint?.wordIndices}
                      solved={isSolvedTargetDisplay}
                      wordLength={specialHint?.length}
                      className={
                        isSolvedTargetDisplay
                          ? "block max-w-full whitespace-nowrap tracking-normal"
                          : ""
                      }
                      style={
                        isSolvedTargetDisplay
                          ? {
                              fontSize: `${solvedTargetFontPx}px`,
                              letterSpacing: 0,
                            }
                          : undefined
                      }
                    />
                    {showSolvedTargetLoupe && (
                      <button
                        type="button"
                        className={`inline-flex items-center justify-center rounded-full border px-2 py-1 ${
                          darkMode
                            ? "bg-slate-800 border-slate-600 text-slate-100"
                            : "bg-white border-gray-300 text-gray-700"
                        } ${shouldDefinitionBlink ? "animate-pulse" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDefinition?.(solvedTargetWord);
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
                  </span>
                ) : (
                  <span
                    className="tracking-normal opacity-80"
                    style={{ fontSize: `${Math.max(11, Math.round(13 * specialScale))}px` }}
                  >
                    MOT MYSTERE
                  </span>
                )}
              </div>
              {specialRound?.type === "target_score" ? (
                <div
                  className="mt-1 font-semibold opacity-80 text-center"
                  style={{ fontSize: `${specialMetaFont}px` }}
                >
                  {Number.isFinite(targetScoreMax) && targetScoreMax > 0
                    ? `${formatNumber(targetScoreMax)} pts`
                    : "-- pts"}
                </div>
              ) : null}
              {specialHint?.length ? (
                <div
                  className="mt-1 font-semibold opacity-70 text-center"
                  style={{ fontSize: `${specialMetaFont}px` }}
                >
                  {specialHint.length} lettres
                </div>
              ) : null}
              <div
                className="mt-1 font-semibold opacity-80 text-center"
                style={{ fontSize: `${specialMetaFont}px` }}
              >
                {nextHintLabel}
              </div>
            </div>
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
              onOpenPlayersOverlaySnapshot={onOpenPlayersOverlaySnapshot}
              renderNickSuffix={renderNickSuffix}
              rosterConfig={rosterConfig}
              selfNick={selfNick}
            />
          )}

          {!isOcidRound && !targetWaitDevActive ? (
            <MobileWordPreview
              countdownLines={countdownLines}
              currentDisplay={currentDisplay}
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
              shake={shake}
            />
          ) : null}
          {!hideOcidVotePlaySurface ? (
          <div className="flex-1 min-h-0 flex flex-col gap-1">
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
              gridShake={gridShake}
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
            {!isStandaloneTraining ? <div
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-3 py-2 shadow-sm flex-1 min-h-0 box-border"
              style={{
                minHeight: `${liveFeedMinHeight}px`,
                flexBasis: `${liveFeedMinHeight}px`,
              }}
            >
              <LiveFeed
                items={mobileAnnouncements}
                darkMode={darkMode}
                maxHeight="100%"
                bannerText={liveFeedBannerText}
                getNickClassName={getNickClassName}
                wrapAroundBottomRight={!isChatOpenMobile}
                wrapAroundWidth="clamp(44px, 11vw, 68px)"
                wrapAroundHeight="clamp(44px, 11vw, 68px)"
              />
            </div> : null}
          </div>
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
