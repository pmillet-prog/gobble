import React from "react";
import { createPortal } from "react-dom";

import LiveFeed from "../LiveFeed.jsx";
import MobileGrid from "../MobileGrid.jsx";
import MobileHeader from "../MobileHeader.jsx";
import MobileWordPreview from "../MobileWordPreview.jsx";
import RankingWidgetMobile from "../RankingWidgetMobile.jsx";

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
    chatOverlays = null,
    countdownLines = null,
    currentDisplay = "",
    darkMode = false,
    defaultTileBaseClass = "",
    duelTeam = null,
    formatNumber = (value) => String(value ?? ""),
    fullRanking = [],
    liveFeedBannerText = "",
    gobbleAwardsForLive = null,
    gridRef = null,
    gridRotationTurns = 0,
    gridShake = false,
    gridSize = 4,
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
    isChatOpenMobile = false,
    isDailyPlay = false,
    isFinaleBanner = false,
    isMobileLayout = true,
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
    normalizeBonusLabel = (value) => value,
    normalizeLetterKey = (value) => value,
    canOpenPlayerProfile = null,
    onOpenDefinition = null,
    onOpenPlayerProfile = null,
    onOpenPlayersOverlaySnapshot = null,
    onOpenSettings = null,
    onRotateGrid = null,
    onSetShowHelp = null,
    onToggleDarkMode = null,
    onToggleSound = null,
    phase = "playing",
    praiseOverlay = null,
    previewBlockHeight = 0,
    previewGapPx = 0,
    previewTileBaseStyle = undefined,
    renderNickSuffix = null,
    roundStats = null,
    roundTilePointsVisible = false,
    scoreLabel = "",
    selfNick = "",
    shake = false,
    shouldDefinitionBlink = false,
    showHelp = false,
    showPreviewStats = false,
    showSolvedTargetLoupe = false,
    slideStyles = "",
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
    tick = 0,
    tileColorPreset = null,
    tileMaterialClass = "",
    tileRefs = null,
    tileScore = null,
    totalScoreLabel = "",
    totalWordsLabel = "",
    tournament = null,
    usedSet = null,
    wordsFoundLabel = "",
  } = props;

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

  return (
    <>
      <div
        className={`flex flex-col ${
          darkMode ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"
        }`}
        style={mobileViewportContainerStyle}
      >
        <style>{slideStyles}</style>

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
          playingSeconds={phase === "playing" ? Math.max(0, Number(tick) || 0) : null}
          playerTeam={duelTeam}
          phase={phase}
          roomLabelSeparator=" - "
          roundStatsText={
            phase === "playing" && roundStats && !isTargetRound
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
        {showHelp && typeof document !== "undefined"
          ? createPortal(
              <div
                className="fixed inset-0 z-[20150] flex items-start justify-center bg-black/45 px-4 pt-20 pb-6"
                onClick={() => onSetShowHelp?.(false)}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  className={`w-full max-w-sm rounded-2xl border px-4 py-3 shadow-xl ${
                    darkMode
                      ? "bg-slate-900/90 text-slate-100 border-slate-700"
                      : "bg-white/90 text-slate-900 border-slate-200"
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-[11px] font-extrabold tracking-widest uppercase text-amber-500">
                    Aide rapide
                  </div>
                  <div className="mt-2 text-[12px] font-semibold">Principes de base</div>
                  <ul className="mt-1 text-[11px] list-disc list-inside space-y-1">
                    <li>Forme des mots en reliant des tuiles qui se touchent (diagonales OK).</li>
                    <li>Une tuile ne peut pas etre reutilisee dans le meme mot.</li>
                    <li>Entree valide le mot, Backspace efface.</li>
                  </ul>
                  <div className="mt-3 text-[12px] font-semibold">Bareme</div>
                  <ul className="mt-1 text-[11px] list-disc list-inside space-y-1">
                    <li>Score = somme des lettres + bonus de longueur.</li>
                    <li>Bonus L2/L3 multiplient la lettre.</li>
                    <li>Bonus M2/M3 multiplient le mot.</li>
                  </ul>
                  <div className="mt-3 text-[12px] font-semibold">Manches speciales</div>
                  <ul className="mt-1 text-[11px] list-disc list-inside space-y-1">
                    <li>Lettre bonus : une lettre rapporte plus de points.</li>
                    <li>Rapidite : tous les mots valent 11 points.</li>
                    <li>Monstrueuse : grille plus grande, plus de mots possibles.</li>
                    <li>3 mots : place les bonus puis garde 3 mots avec des tuiles de départ différentes.</li>
                    <li>Faux jumeaux : une case vaut 2 lettres possibles, seuls les mots de 4+ lettres comptent.</li>
                    <li>Objectif : trouver le mot le plus long ou le plus rentable.</li>
                  </ul>
                  <div className="mt-3 text-[12px] font-semibold">Support</div>
                  <p className="mt-1 text-[11px]">
                    <a
                      href="mailto:support@gobble.fr"
                      className="underline underline-offset-2 text-amber-600 dark:text-amber-400"
                    >
                      support@gobble.fr
                    </a>
                  </p>
                </div>
              </div>,
              document.body
            )
          : null}

        <div
          className="flex-1 flex flex-col gap-1 px-3 pt-1 pb-2 overflow-hidden box-border"
          style={{
            ...mobileBodyHeightStyle,
            paddingTop: mobileBodyPaddingTop,
          }}
        >
          {phase === "playing" && isTargetRound ? (
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
                    <span
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
                    >
                      {specialHintDisplay}
                    </span>
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
              {phase === "playing" && !isDailyPlay && !isTargetRound ? (
                <button
                  type="button"
                  className={`absolute bottom-2 right-2 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide backdrop-blur ${
                    darkMode
                      ? "bg-slate-900/70 text-white border border-white/10"
                      : "bg-white/80 text-slate-900 border border-slate-200"
                  }`}
                  onClick={() => onOpenPlayersOverlaySnapshot?.(fullRanking)}
                >
                  Liste des joueurs
                </button>
              ) : null}
            </div>
          ) : (
            <div
              ref={mobileRankingRef}
              className="relative rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/90 dark:bg-slate-900/90 shadow-sm flex-none overflow-hidden box-border"
              style={
                mobileLayoutSizing.rankingHeight > 0
                  ? {
                      height: `${Math.round(mobileLayoutSizing.rankingHeight)}px`,
                      maxHeight: `${Math.round(mobileLayoutSizing.rankingHeight)}px`,
                      minHeight: 0,
                    }
                  : undefined
              }
            >
              {phase === "playing" && !isDailyPlay && !isTargetRound ? (
                <button
                  type="button"
                  className={`absolute top-2 right-2 z-10 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide backdrop-blur ${
                    darkMode
                      ? "bg-slate-900/70 text-white border border-white/10"
                      : "bg-white/80 text-slate-900 border border-slate-200"
                  }`}
                  onClick={() => onOpenPlayersOverlaySnapshot?.(fullRanking)}
                >
                  Liste des joueurs
                </button>
              ) : null}
              <RankingWidgetMobile
                fullRanking={fullRanking}
                selfNick={selfNick}
                darkMode={darkMode}
                expanded={false}
                flatStyle={true}
                highlightedPlayers={highlightPlayers}
                fitHeight={false}
                animateRank={false}
                assetVersion={assetVersion}
                gobbleWordAwardsByNick={gobbleAwardsForLive}
                onPlayerNickClick={onOpenPlayerProfile}
                isPlayerNickClickable={canOpenPlayerProfile}
                renderNickSuffix={renderNickSuffix}
                showGobbleWordAwards={true}
                className="h-full"
              />
            </div>
          )}

          <MobileWordPreview
            countdownLines={countdownLines}
            currentDisplay={currentDisplay}
            darkMode={darkMode}
            liveWord={liveWord}
            liveWordTiles={liveWordTiles}
            onRotateGrid={onRotateGrid}
            phase={phase}
            previewBlockHeight={previewBlockHeight}
            previewGapPx={previewGapPx}
            previewTileBaseStyle={previewTileBaseStyle}
            previewStats={{
              show: showPreviewStats,
              wordsFoundLabel,
              totalWordsLabel,
              scoreLabel,
              totalScoreLabel,
            }}
            shake={shake}
          />
          <div className="flex-1 min-h-0 flex flex-col gap-1">
            <MobileGrid
              board={boardForRender}
              BONUS_CLASSES={BONUS_CLASSES}
              bonusLetterKey={bonusLetterKey}
              bonusLetterScore={bonusLetterScore}
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
              tick={tick}
              usedSet={usedSet}
              specialStartTileSet={special3LockedStartTileSet}
            />
            <div
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
                wrapAroundBottomRight={!isChatOpenMobile}
                wrapAroundWidth="clamp(44px, 11vw, 68px)"
                wrapAroundHeight="clamp(44px, 11vw, 68px)"
              />
            </div>
          </div>
        </div>
      </div>
      {mobileResultsPhaseFadeOverlay}
      {mobileRoundIntroOverlay}
      {chatOverlays}
    </>
  );
}

export default React.memo(MobileStandardPlaying);
