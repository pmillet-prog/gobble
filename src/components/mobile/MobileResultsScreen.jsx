import React from "react";
import { createPortal } from "react-dom";

import MobileHeader from "../MobileHeader.jsx";
import RankingWidgetMobile from "../RankingWidgetMobile.jsx";
import WordPointsLabel from "../WordPointsLabel.jsx";

function MobileResultsScreen(props) {
  const {
    WORDS_SCROLL_MAX_HEIGHT = "320px",
    DARK_WORD_INACTIVE = "#e2e8f0",
    SwapFadeTextComponent = null,
    activeRoom = null,
    allSoundOn = true,
    analysis = null,
    assetVersion = "",
    chatOverlays = null,
    countdownLines = null,
    darkMode = false,
    displayList = [],
    duelTeam = null,
    endStats = null,
    foundDotStyle = undefined,
    getRoundRecordsForPlayer = null,
    gobbleAwardsForLive = null,
    gridSize = 4,
    guidedPseudoOverlay = null,
    guidedSwipeOverlay = null,
    guidedWordOverlay = null,
    handleResultsTouchEnd = null,
    handleResultsTouchMove = null,
    handleResultsTouchStart = null,
    isFinaleBanner = false,
    isSpeedRound = false,
    isTargetRound = false,
    listItemRefs = null,
    mobileBodyHeightStyle = undefined,
    mobileBodyPaddingTop = undefined,
    mobileHeaderRef = null,
    mobileResultsPhaseFadeOverlay = null,
    mobileResultsSummaryStyle = undefined,
    mobileViewportContainerStyle = undefined,
    onAnalyzeWord = null,
    onClearAnalysis = null,
    onGoToResultsPage = null,
    onOpenPlayerProfile = null,
    onOpenRoundPlayerModal = null,
    onOpenSettings = null,
    onOpenWordInfoModal = null,
    onSetShowHelp = null,
    onToggleDarkMode = null,
    onToggleSound = null,
    praiseOverlay = null,
    recordBadgesByNickForRound = null,
    renderDesktopResultsDockPanel = null,
    renderGobbleCandidate = null,
    renderNickSuffix = null,
    renderRankDelta = null,
    renderVocabPanel = null,
    resultsCardClassName = "",
    resultsCardStyle = undefined,
    resultsDots = null,
    resultsFadeClass = "",
    resultsHeaderLabel = "",
    resultsHeaderSuffix = "",
    resultsPageKey = "round",
    resultsRankingList = [],
    resultsRankingModeForMobile = "round",
    resultsReorderTick = 0,
    resultsWordsTitle = "",
    selfNick = "",
    showAllWords = false,
    showHelp = false,
    showOfflineResultsLabel = false,
    showResultsWords = false,
    showVocabPage = false,
    slideStyles = "",
    summaryWrapperClass = "",
    suppressWordListScores = false,
    targetSummary = null,
    tick = 0,
    tournament = null,
    visibleWordGuidance = false,
    wordsEmpty = false,
  } = props;

  const SwapFadeText = SwapFadeTextComponent;

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
          playingSeconds={null}
          playerTeam={duelTeam}
          phase="results"
          roomLabelSeparator=" - "
          showHelpButton={false}
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
          <div
            className={resultsCardClassName}
            style={resultsCardStyle}
            onTouchStart={handleResultsTouchStart}
            onTouchMove={handleResultsTouchMove}
            onTouchEnd={handleResultsTouchEnd}
            onTouchCancel={handleResultsTouchEnd}
          >
            {guidedPseudoOverlay}
            {guidedSwipeOverlay}
            {guidedWordOverlay}
            <div className="relative flex-1 min-h-0 overflow-hidden z-10">
              <div className={`flex flex-col gap-2 h-full results-fade-layer ${resultsFadeClass}`}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="font-semibold">
                    {resultsHeaderLabel}
                    {!showResultsWords && resultsHeaderSuffix && SwapFadeText ? (
                      <SwapFadeText value={resultsHeaderSuffix} className="ml-1" />
                    ) : null}
                  </div>
                  {!showResultsWords && tournament?.round && tournament?.totalRounds && (
                    <span className="text-slate-500 dark:text-slate-300 whitespace-nowrap">
                      {tournament.round === tournament.totalRounds ? (
                        <>Manche finale</>
                      ) : (
                        <>
                          Manche {tournament.round}/{tournament.totalRounds}
                        </>
                      )}
                    </span>
                  )}
                  {showResultsWords && SwapFadeText ? (
                    <SwapFadeText
                      value={resultsWordsTitle}
                      className="text-slate-500 dark:text-slate-300 whitespace-nowrap"
                    />
                  ) : null}
                </div>

                {showOfflineResultsLabel ? (
                  <div className="text-[11px] text-amber-500">
                    Vous etiez hors ligne sur cette manche.
                  </div>
                ) : null}

                {showVocabPage ? (
                  renderVocabPanel?.({ panelClassName: "flex-1 min-h-0 pt-2" })
                ) : showResultsWords && !isTargetRound ? (
                  <div className="flex flex-col gap-2 flex-1 min-h-0">
                    {wordsEmpty ? (
                      <div className="text-xs text-slate-500 dark:text-slate-300">
                        {resultsPageKey === "all"
                          ? "Aucun mot (solveur non lance)"
                          : "Aucun mot trouve."}
                      </div>
                    ) : null}
                    <div
                      className="flex-1 min-h-0 overflow-y-auto pr-1"
                      style={{ maxHeight: WORDS_SCROLL_MAX_HEIGHT }}
                    >
                      {displayList.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-xs text-slate-400">
                          Aucun mot trouve.
                        </div>
                      ) : (
                        <ul className="relative flex flex-col text-sm">
                          {displayList.map((entry) => {
                            const selected = analysis?.word === entry.word;
                            const status = entry.status;
                            const isPending = status === "pending";
                            const isRejected = status === "rejected";
                            const isFound = entry.isFound || isPending;
                            const bestPts = entry.bestPts;
                            const userPts = entry.userPts;
                            const showOpt =
                              !suppressWordListScores &&
                              isFound &&
                              typeof bestPts === "number" &&
                              typeof userPts === "number" &&
                              bestPts !== userPts &&
                              !isPending &&
                              !isRejected &&
                              !isSpeedRound;
                            const isTrouvable = !isFound && !isRejected;
                            const visible = showAllWords || isFound || isRejected;
                            const wordClassName = isRejected
                              ? darkMode
                                ? "font-semibold text-red-300 line-through"
                                : "font-semibold text-red-600 line-through"
                              : isPending
                              ? darkMode
                                ? "font-semibold text-slate-300 opacity-70"
                                : "font-semibold text-gray-500 opacity-70"
                              : isFound
                              ? "font-semibold"
                              : "text-gray-600";
                            const fakeTwinsWordClassName =
                              entry?.usedFakeTwins && !isRejected
                                ? darkMode
                                  ? "text-blue-300"
                                  : "text-blue-600"
                                : "";
                            const isGuidedWordTarget =
                              visibleWordGuidance && entry.word === visibleWordGuidance;
                            return (
                              <li
                                key={entry.word}
                                onMouseEnter={() => onAnalyzeWord?.(entry.word)}
                                onMouseLeave={() => onClearAnalysis?.()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (entry.word) onOpenWordInfoModal?.(entry.word);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (entry.word) onOpenWordInfoModal?.(entry.word);
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                aria-label={`Voir les details de ${entry.word}`}
                                ref={(el) => {
                                  if (!listItemRefs?.current) return;
                                  if (el) listItemRefs.current.set(entry.word, el);
                                  else listItemRefs.current.delete(entry.word);
                                }}
                                className={`cursor-pointer rounded px-1 flex items-center justify-between gap-2 transition ${
                                  selected ? "bg-blue-50 text-blue-800" : "hover:bg-gray-100"
                                } ${isGuidedWordTarget ? "guide-highlight guide-blink" : ""}`}
                                style={{
                                  transitionDuration: "220ms",
                                  transitionProperty: isTrouvable
                                    ? "opacity, max-height"
                                    : "opacity, transform, max-height",
                                  opacity: visible ? 1 : 0,
                                  transform:
                                    isTrouvable || visible
                                      ? "translateY(0)"
                                      : "translateY(-8px)",
                                  maxHeight: visible ? "48px" : "0px",
                                  paddingTop: visible ? "2px" : "0px",
                                  paddingBottom: visible ? "2px" : "0px",
                                  overflow:
                                    isGuidedWordTarget && visible ? "visible" : "hidden",
                                  pointerEvents: visible ? "auto" : "none",
                                  position: "relative",
                                  color:
                                    !isFound && !isPending && darkMode
                                      ? DARK_WORD_INACTIVE
                                      : undefined,
                                }}
                              >
                                <button
                                  type="button"
                                  className="flex items-center gap-2 text-left w-1/2 min-w-0"
                                  onClick={() => onOpenWordInfoModal?.(entry.word)}
                                >
                                  {isFound ? (
                                    <span
                                      style={{
                                        ...foundDotStyle,
                                        opacity: isPending ? 0.4 : 1,
                                      }}
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <span
                                      style={{ ...foundDotStyle, opacity: 0 }}
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span className="flex items-center gap-1 min-w-0">
                                    <span
                                      className={`${wordClassName} ${fakeTwinsWordClassName}`.trim()}
                                    >
                                      {entry.word}
                                    </span>
                                    {renderGobbleCandidate?.(entry.word)}
                                  </span>
                                </button>
                                <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                  {!suppressWordListScores &&
                                  typeof userPts === "number" &&
                                  isFound ? (
                                    <WordPointsLabel
                                      pts={userPts}
                                      mode="found"
                                      usedFakeTwins={!!entry?.usedFakeTwins}
                                      darkMode={darkMode}
                                      className={`font-extrabold ${
                                        darkMode ? "text-slate-100" : "text-slate-800"
                                      }`}
                                    />
                                  ) : null}
                                  {isPending ? (
                                    <span className="text-[0.65rem] text-gray-400">envoi...</span>
                                  ) : null}
                                  {isRejected ? (
                                    <span
                                      className={`text-[0.65rem] ${
                                        darkMode ? "text-red-300" : "text-red-600"
                                      }`}
                                    >
                                      refuse
                                    </span>
                                  ) : null}
                                  {!suppressWordListScores &&
                                  !isFound &&
                                  typeof bestPts === "number" ? (
                                    <WordPointsLabel
                                      pts={bestPts}
                                      mode="best"
                                      usedFakeTwins={!!entry?.usedFakeTwins}
                                      darkMode={darkMode}
                                      className="text-slate-500 opacity-75"
                                    />
                                  ) : null}
                                  {showOpt ? (
                                    <WordPointsLabel
                                      pts={bestPts}
                                      mode="opt"
                                      usedFakeTwins={!!entry?.usedFakeTwins}
                                      darkMode={darkMode}
                                      className={`text-[0.65rem] ${
                                        darkMode ? "text-red-300" : "text-red-600"
                                      }`}
                                    />
                                  ) : null}
                                </span>
                                {isGuidedWordTarget ? (
                                  <span className="sr-only">
                                    Cliquez sur ce mot pour savoir qui l&apos;a trouve.
                                  </span>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 flex-1 min-h-0">
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <RankingWidgetMobile
                        fullRanking={resultsRankingList}
                        selfNick={selfNick}
                        darkMode={darkMode}
                        expanded={true}
                        animateRank={false}
                        animateReorderTick={resultsReorderTick}
                        showWheel={false}
                        flatStyle={true}
                        showRoundAward={true}
                        assetVersion={assetVersion}
                        gobbleWordAwardsByNick={gobbleAwardsForLive}
                        renderNickSuffix={renderNickSuffix}
                        stackNickDecorations={true}
                        showGobbleWordAwards={true}
                        renderAfterRank={
                          resultsRankingModeForMobile === "total" ? renderRankDelta : null
                        }
                        recordBadgesByNick={
                          resultsRankingModeForMobile === "round"
                            ? recordBadgesByNickForRound
                            : null
                        }
                        onPlayerNickClick={
                          resultsRankingModeForMobile === "round"
                            ? onOpenRoundPlayerModal
                            : onOpenPlayerProfile
                        }
                        isPlayerNickClickable={
                          resultsRankingModeForMobile === "round"
                            ? (rankingEntry) => {
                                if (!isTargetRound) return true;
                                const nick = String(rankingEntry?.nick || "").trim();
                                if (!nick) return false;
                                return getRoundRecordsForPlayer?.(nick).length > 0;
                              }
                            : (rankingEntry) => {
                                const directUserId = Number(rankingEntry?.userId);
                                if (Number.isInteger(directUserId) && directUserId > 0) return true;
                                const direct = String(rankingEntry?.installId || "").trim();
                                if (/^[1-9]\d*$/.test(direct)) return true;
                                const playerKey = String(rankingEntry?.playerKey || "").trim();
                                if (!playerKey.startsWith("install:")) return false;
                                return /^[1-9]\d*$/.test(playerKey.slice("install:".length));
                              }
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {resultsDots}
          {(isTargetRound ? targetSummary : endStats) && (
            <div className={summaryWrapperClass} style={mobileResultsSummaryStyle}>
              {renderDesktopResultsDockPanel?.()}
            </div>
          )}
        </div>
      </div>
      {mobileResultsPhaseFadeOverlay}
      {praiseOverlay}
      {chatOverlays}
    </>
  );
}

export default React.memo(MobileResultsScreen);
