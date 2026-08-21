import React from "react";
import { formatNumber } from "../../utils/numbers.js";
import { getVocabLevelMeta } from "../../vocabRanks.js";
import FantasyPanelShell from "../home/FantasyPanelShell.jsx";
import WeeklyNickLine from "./WeeklyNickLine.jsx";
import {
  formatMsShort,
  formatWeeklyDate,
  formatWeeklyDayTime,
} from "./weeklyStatsModel.js";

export default function WeeklyStatsScreen({ runtime }) {
  const {
    activeWeeklyBoard,
    closeWeeklyStatsOverlay,
    darkMode,
    getImageUrl,
    getSeasonPages,
    getUserIdFromPlayerProfileTarget,
    goToSeasonPage,
    goToWeeklyBoard,
    handleStatsTouchEnd,
    handleStatsTouchMove,
    handleStatsTouchStart,
    installId,
    isCrownedEntry,
    menuDarkMode,
    openDefinition,
    openPlayerProfile,
    playCloseSound,
    renderCrownIcon,
    renderVocabPanel,
    safeWeeklyIndex,
    seasonActiveIndex,
    seasonSwipeBlockRef,
    seasonSwipeTrack,
    seasonVocabEntries,
    selfNick,
    setStatsTab,
    shiftSeasonPage,
    shiftWeeklyBoard,
    shouldIgnoreSwipeClick,
    statsTab,
    weeklyBoardsMeta,
    weeklyEntriesByBoard,
    weeklyStatsError,
    weeklyStatsLoading,
    weeklySwipeBlockRef,
    weeklySwipeTrack,
    weeklyVocabLookup,
    weeklyVocabSelfCount,
    weeklyVocabSelfRank,
    weeklyWeekNumber,
  } = runtime;

  function renderWeeklyRow(
    boardKey,
    entry,
    idx,
    { showVocabIcon = false, showVocabLabel = true } = {}
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
    const statsSwipeBlockRef = statsTab === "season" ? seasonSwipeBlockRef : weeklySwipeBlockRef;
    const openWeeklyProfile = profileUserId
      ? (e) => {
          e.stopPropagation();
          if (shouldIgnoreSwipeClick(statsSwipeBlockRef)) return;
          openPlayerProfile({ userId: profileUserId, nick: baseNick });
        }
      : null;

    return (
      <div
        key={`${boardKey}-${entry.playerKey || entry.word || entry.roundId || idx}`}
        className={`flex items-center justify-between gap-2 py-1 border-b border-slate-200/60 dark:border-white/10 last:border-0 ${
          isSelfEntry
            ? darkMode
              ? "bg-emerald-900/30 text-emerald-100"
              : "bg-emerald-50 text-emerald-800"
            : ""
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 text-center text-xs font-bold text-amber-500">{rank}</span>
          <div className="min-w-0">
            <WeeklyNickLine
              nick={baseNick}
              metaLabel={metaLabel}
              vocabImageUrl={
                vocabMetaForRow?.imageKey ? getImageUrl(vocabMetaForRow.imageKey) : ""
              }
              vocabLabel={vocabMetaForRow?.label || "Niveau"}
              showVocabLabel={showVocabLabel}
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
        <div className="text-right text-sm font-bold tabular-nums whitespace-nowrap">
          {valueParts.join(" ")}
        </div>
      </div>
    );
  }

  const weeklyVocabRaceBanner = (
    <div
      className={`mx-4 mt-2 rounded-xl border px-3 py-2 shadow-sm ${
        darkMode
          ? "border-amber-300/40 bg-gradient-to-r from-amber-300/18 via-slate-900/80 to-amber-500/12 text-amber-50"
          : "border-amber-300/70 bg-gradient-to-r from-amber-50 via-white to-yellow-50 text-slate-900"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-widest opacity-75">
            Course vocabulaire hebdo
          </div>
          <div className="mt-0.5 text-xs font-semibold leading-snug">
            Le podium de la semaine affichera son pseudo en or, argent et bronze la semaine suivante.
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-2 text-sm font-black tabular-nums ${
              darkMode
                ? "border-amber-200/70 bg-amber-300/20 text-amber-100"
                : "border-amber-400 bg-amber-100 text-amber-800"
            }`}
          >
            {Number.isFinite(weeklyVocabSelfRank) ? `#${weeklyVocabSelfRank}` : "-"}
          </div>
          <div className="mt-1 text-[10px] font-bold tabular-nums opacity-80">
            {Number.isFinite(weeklyVocabSelfCount)
              ? `${formatNumber(weeklyVocabSelfCount) ?? 0} mots`
              : "Non classe"}
          </div>
        </div>
      </div>
    </div>
  );
  const showWeeklyDots = weeklyBoardsMeta.length > 1;
  const weeklyDots = showWeeklyDots ? (
    <div className="flex items-center justify-center gap-2 py-2">
      <button
        type="button"
        className={`hidden md:inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition ${
          darkMode
            ? "border-slate-600 text-slate-100 hover:bg-slate-800"
            : "border-slate-200 text-slate-700 hover:bg-slate-100"
        }`}
        onClick={() => {
          if (shouldIgnoreSwipeClick(weeklySwipeBlockRef)) return;
          shiftWeeklyBoard(-1);
        }}
        aria-label="Page precedente"
      >
        {"<"}
      </button>
      {weeklyBoardsMeta.map((board, idx) => {
        const isActive = idx === safeWeeklyIndex;
        const dotColor = isActive
          ? darkMode
            ? "bg-slate-100"
            : "bg-slate-900"
          : darkMode
          ? "bg-white/30"
          : "bg-slate-300";
        return (
          <button
            key={board.key}
            type="button"
            className={`h-2.5 w-2.5 rounded-full transition ${dotColor} ${
              isActive ? "scale-110" : ""
            }`}
            aria-label={`Page ${idx + 1}`}
            aria-current={isActive ? "true" : undefined}
            onClick={() => {
              if (shouldIgnoreSwipeClick(weeklySwipeBlockRef)) return;
              goToWeeklyBoard(idx);
            }}
          />
        );
      })}
      <button
        type="button"
        className={`hidden md:inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition ${
          darkMode
            ? "border-slate-600 text-slate-100 hover:bg-slate-800"
            : "border-slate-200 text-slate-700 hover:bg-slate-100"
        }`}
        onClick={() => {
          if (shouldIgnoreSwipeClick(weeklySwipeBlockRef)) return;
          shiftWeeklyBoard(1);
        }}
        aria-label="Page suivante"
      >
        {">"}
      </button>
    </div>
  ) : null;
  const seasonPages = getSeasonPages();
  const safeSeasonIndex =
    seasonActiveIndex >= 0 && seasonActiveIndex < seasonPages.length ? seasonActiveIndex : 0;
  const showSeasonDots = seasonPages.length > 1;
  const seasonDots = showSeasonDots ? (
    <div className="flex items-center justify-center gap-2 py-2">
      <button
        type="button"
        className={`hidden md:inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition ${
          darkMode
            ? "border-slate-600 text-slate-100 hover:bg-slate-800"
            : "border-slate-200 text-slate-700 hover:bg-slate-100"
        }`}
        onClick={() => {
          if (shouldIgnoreSwipeClick(seasonSwipeBlockRef)) return;
          shiftSeasonPage(-1);
        }}
        aria-label="Page precedente"
      >
        {"<"}
      </button>
      {seasonPages.map((page, idx) => {
        const isActive = idx === safeSeasonIndex;
        const dotColor = isActive
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
            }`}
            aria-label={`Page ${idx + 1}`}
            aria-current={isActive ? "true" : undefined}
            onClick={() => {
              if (shouldIgnoreSwipeClick(seasonSwipeBlockRef)) return;
              goToSeasonPage(idx);
            }}
          />
        );
      })}
      <button
        type="button"
        className={`hidden md:inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition ${
          darkMode
            ? "border-slate-600 text-slate-100 hover:bg-slate-800"
            : "border-slate-200 text-slate-700 hover:bg-slate-100"
        }`}
        onClick={() => {
          if (shouldIgnoreSwipeClick(seasonSwipeBlockRef)) return;
          shiftSeasonPage(1);
        }}
        aria-label="Page suivante"
      >
        {">"}
      </button>
    </div>
  ) : null;

  const statsHeaderToggle = (
    <div className="flex items-center gap-2">
      <div
        className={`inline-flex rounded-full overflow-hidden border ${
          menuDarkMode ? "border-slate-700" : "border-slate-200"
        }`}
      >
        <button
          type="button"
          onClick={() => setStatsTab("weekly")}
          className={`px-3 py-1 text-xs font-semibold transition ${
            statsTab === "weekly"
              ? menuDarkMode
                ? "bg-blue-700 text-white"
                : "bg-blue-600 text-white"
              : menuDarkMode
              ? "bg-slate-900 text-slate-300"
              : "bg-white text-slate-600"
          }`}
        >
          Hebdo
        </button>
        <button
          type="button"
          onClick={() => {
            setStatsTab("season");
            goToSeasonPage(0);
          }}
          className={`px-3 py-1 text-xs font-semibold transition ${
            statsTab === "season"
              ? menuDarkMode
                ? "bg-blue-700 text-white"
                : "bg-blue-600 text-white"
              : menuDarkMode
              ? "bg-slate-900 text-slate-300"
              : "bg-white text-slate-600"
          }`}
        >
          Saison
        </button>
      </div>
    </div>
  );

  return (
      <FantasyPanelShell
        className="relative z-10 w-full max-w-none h-full"
        bodyClassName="flex flex-col min-h-0"
        eyebrow="Gobble stats"
        title={statsTab === "weekly" ? activeWeeklyBoard?.label : "Vocabulaire"}
        subtitle={
          statsTab === "weekly"
            ? `${weeklyWeekNumber ? `Semaine ${weeklyWeekNumber}` : "Semaine en cours"} - Reset : lundi a minuit`
            : "Progression vocabulaire"
        }
        headerControls={statsHeaderToggle}
        onClose={() => {
          playCloseSound();
          closeWeeklyStatsOverlay();
        }}
        onTouchStart={handleStatsTouchStart}
        onTouchMove={handleStatsTouchMove}
        onTouchEnd={handleStatsTouchEnd}
      >
        {statsTab === "weekly" ? (
          <div className="px-4 pt-2 text-[11px] font-semibold opacity-75">
            Slide gauche/droite pour changer de categorie
          </div>
        ) : null}
        {statsTab === "weekly" && activeWeeklyBoard?.key === "weeklyVocab"
          ? weeklyVocabRaceBanner
          : null}
        {statsTab === "weekly" ? weeklyDots : null}
        {statsTab === "season" ? seasonDots : null}
        {statsTab === "weekly" ? (
          <div className="relative px-2 sm:px-4 pb-4 flex-1 min-h-0 flex flex-col">
            <div className="overflow-hidden rounded-2xl border-0 bg-transparent flex-1 min-h-0">
              <div
                ref={weeklySwipeTrack.trackRef}
                className="flex w-full h-full"
                style={{
                  transform: `translate3d(${safeWeeklyIndex * -100}%, 0, 0)`,
                  transition: "transform 0.25s ease-out",
                  willChange: "auto",
                }}
              >
                {weeklyBoardsMeta.map((board, idx) => {
                  const entries = weeklyEntriesByBoard[board.key] || [];
                  const shouldRenderRows = Math.abs(idx - safeWeeklyIndex) <= 1;
                  return (
                    <div key={board.key} className="w-full shrink-0 px-0 flex flex-col min-h-0 h-full">
                      <div className="p-4 space-y-3 flex flex-col min-h-0 h-full">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="text-sm font-semibold opacity-80">{board.subtitle || ""}</div>
                          {weeklyStatsLoading && idx === safeWeeklyIndex ? (
                            <div className="text-xs opacity-70">Mise a jour...</div>
                          ) : null}
                          {weeklyStatsError && idx === safeWeeklyIndex ? (
                            <div className="text-xs text-red-400">Erreur ({weeklyStatsError})</div>
                          ) : null}
                        </div>
                        {shouldRenderRows && entries.length > 0 ? (
                          <div
                            className="flex-1 min-h-0 overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1"
                            data-stats-scroll="true"
                            style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
                          >
                            {entries.map((entry, entryIdx) => renderWeeklyRow(board.key, entry, entryIdx))}
                          </div>
                        ) : shouldRenderRows ? (
                          <div className="text-sm opacity-70 py-8 text-center flex-1 min-h-0 flex items-center justify-center">
                            {weeklyStatsLoading && idx === safeWeeklyIndex
                              ? "Chargement..."
                              : weeklyStatsError && idx === safeWeeklyIndex
                              ? "Impossible de recuperer les stats"
                              : "Pas encore de stats cette semaine."}
                          </div>
                        ) : (
                          <div className="flex-1 min-h-0" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="relative px-2 sm:px-4 pb-4 flex-1 min-h-0 flex flex-col">
            <div className="overflow-hidden rounded-2xl border-0 bg-transparent flex-1 min-h-0">
              <div
                ref={seasonSwipeTrack.trackRef}
                className="flex w-full min-h-0 h-full"
                style={{
                  transform: `translate3d(${safeSeasonIndex * -100}%, 0, 0)`,
                  transition: "transform 0.25s ease-out",
                  willChange: "auto",
                }}
              >
                {seasonPages.map((page) => (
                  <div key={page} className="w-full shrink-0 px-0 flex flex-col min-h-0 h-full">
                    {page === "vocab_rank" ? (
                      <div className="p-4 space-y-3 flex flex-col min-h-0 h-full">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="text-sm font-semibold opacity-80">Mots uniques</div>
                          {weeklyStatsLoading ? (
                            <div className="text-xs opacity-70">Mise a jour...</div>
                          ) : null}
                          {weeklyStatsError ? (
                            <div className="text-xs text-red-400">Erreur ({weeklyStatsError})</div>
                          ) : null}
                        </div>
                        {seasonVocabEntries.length > 0 ? (
                          <div
                            className="flex-1 min-h-0 overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1"
                            data-stats-scroll="true"
                            style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
                          >
                            {seasonVocabEntries.map((entry, entryIdx) =>
                              renderWeeklyRow("vocab", entry, entryIdx, {
                                showVocabIcon: true,
                                showVocabLabel: false,
                              })
                            )}
                          </div>
                        ) : (
                          <div className="text-sm opacity-70 py-8 text-center flex-1 min-h-0 flex items-center justify-center">
                            {weeklyStatsLoading
                              ? "Chargement..."
                              : weeklyStatsError
                              ? "Impossible de recuperer les stats"
                              : "Pas encore de stats cette saison."}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className="p-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1"
                        data-stats-scroll="true"
                        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
                      >
                        {renderVocabPanel({ showDelta: false, showHeading: false })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </FantasyPanelShell>
    );
}
