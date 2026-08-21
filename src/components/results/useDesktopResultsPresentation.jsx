import React from "react";
import { MASSIVE_BOGGLE_TYPE } from "../../game/specialRoundTypes.js";
import { pickDefinitionList, sanitizeDefinitionText } from "../../utils/definitionPayload.js";
import { clampValue, formatNumber } from "../../utils/numbers.js";
import AutoScaleInline from "../AutoScaleInline.jsx";
import DefinitionDetails from "../DefinitionDetails.jsx";
import { DAILY_SPECIAL_MODE } from "../daily/dailyModes.js";
import {
  FAKE_TWINS_TYPE,
  computeScore,
  findBestPathForWord,
  normalizeWord,
} from "../gameLogic.js";

export default function useDesktopResultsPresentation(runtime) {
  const {
    analyzeWord,
    board,
    breakCountdown,
    breakKind,
    clearResultsWordAnalysis,
    darkMode,
    duelBlueScore,
    duelRedScore,
    endStats,
    finalResults,
    gobbleBadgeUrl,
    isMobileLayout,
    isSpecial3RoundForResults,
    isSpeedRound,
    isTargetRound,
    nicknameRef,
    normalizeNickKey,
    openDefinition,
    phase,
    renderSpecial3PreviewTiles,
    resultsTeamDelta,
    serverStatus,
    shouldDefinitionBlink,
    specialRound,
    specialScoreConfig,
    standaloneTrainingSession,
    targetDefinition,
    targetSummary,
    tournament,
    upcomingSpecial,
  } = runtime;

  const resultLabelClass = darkMode ? "text-gray-300" : "text-gray-600";
  const resultPillClass = darkMode
    ? "inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-gray-100 text-xs sm:text-sm"
    : "inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-800 text-xs sm:text-sm";
  const renderEndStatsCard = (className = "", withBg = true) => {
    if (!endStats) return null;
    const themeClasses = darkMode
      ? `${withBg ? "bg-slate-900/90" : "bg-transparent"} border-slate-500 text-gray-100`
      : `${withBg ? "bg-white/90" : "bg-transparent"} border-gray-300 text-gray-900`;

    const bc = typeof breakCountdown === "number" ? Math.max(0, breakCountdown) : null;
    const inResults = serverStatus === "break" || phase === "results";
    const showOverlay = inResults && bc !== null && bc > 0 && bc <= 10;
    const minHeightStyle = inResults
      ? { minHeight: "clamp(240px, 40vh, 380px)" }
      : undefined;
    const longestWordRaw =
      typeof endStats.longestWord?.word === "string" ? endStats.longestWord.word.trim() : "";
    const longestWordLen = longestWordRaw ? normalizeWord(longestWordRaw).length : 0;
    const longestWordScale = clampValue(
      Math.pow(0.94, Math.max(0, longestWordLen - 10)),
      0.58,
      1
    );
    const longestWordStyle = {
      fontSize: `${longestWordScale}em`,
      lineHeight: 1.05,
      letterSpacing: longestWordScale < 0.82 ? "-0.02em" : undefined,
      whiteSpace: "nowrap",
    };

    const specialTypeLabel = (() => {
      if (!upcomingSpecial?.isSpecial) return null;
      if (upcomingSpecial.type === "speed") return "JEU RAPIDE";
      if (upcomingSpecial.type === "monstrous") return "GRILLE MONSTRUEUSE";
      if (upcomingSpecial.type === DAILY_SPECIAL_MODE) return "3 MOTS";
      if (upcomingSpecial.type === FAKE_TWINS_TYPE) return "FAUX JUMEAUX";
      if (upcomingSpecial.type === "target_long") return "MOT LE PLUS LONG";
      if (upcomingSpecial.type === "target_score") return "MEILLEUR MOT";
      if (upcomingSpecial.type === "bonus_letter") return "LETTRE EN OR";
      if (upcomingSpecial.type === MASSIVE_BOGGLE_TYPE) return "MASSIVE BOGGLE";
      return String(upcomingSpecial.label || "MANCHE SPECIALE").toUpperCase();
    })();

    const nextRoundLabel = (() => {
      if (breakKind === "training_end") return "Fin de l’entraînement";
      if (breakKind === "tournament_end") return "Retour au salon";
      if (tournament?.nextRound && tournament?.totalRounds) {
        if (tournament.nextRound === tournament.totalRounds) return "Manche finale";
        return `Manche ${tournament.nextRound}`;
      }
      return null;
    })();

    const upcomingSpecialName = (() => {
      if (!upcomingSpecial?.isSpecial) return null;
      if (typeof upcomingSpecial.label === "string" && upcomingSpecial.label.trim()) {
        return upcomingSpecial.label.trim();
      }
      return specialTypeLabel;
    })();

    const selfNickForResults = nicknameRef.current.trim();
    const selfNickKeyForResults = normalizeNickKey(selfNickForResults);
    const selfResultEntry =
      selfNickForResults && Array.isArray(finalResults)
        ? finalResults.find((entry) => normalizeNickKey(entry?.nick) === selfNickKeyForResults)
        : null;
    const showOfflineLabel = !standaloneTrainingSession && !selfResultEntry;
    const compactPillClass = darkMode
      ? "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-gray-100 text-[11px] sm:text-xs"
      : "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-800 text-[11px] sm:text-xs";
    const special3Leader = endStats.special3Leader;
    const renderSpecial3LeaderSummary = (compact = false) => {
      if (!isSpecial3RoundForResults || !special3Leader) return null;
      const pillClass = compactPillClass;
      return (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className={`${resultLabelClass} text-[11px] sm:text-xs font-semibold`}>
              Meilleure combinaison 3 mots
            </span>
            <span className={`${resultLabelClass} text-[10px] whitespace-nowrap`}>
              {special3Leader.score} pts
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className={`${pillClass} break-all`}>{special3Leader.nick || "Joueur"}</span>
          </div>
          <div className="space-y-1.5">
            {special3Leader.slots.map((slot, idx) => (
              <div
                key={`results-special3-leader-${slot.id}-${idx}`}
                className={`rounded-lg border px-2 py-1.5 ${
                  darkMode
                    ? "bg-slate-800/70 border-slate-700"
                    : "bg-slate-50 border-slate-200"
                }`}
              >
                <div className="min-w-0">
                  <div className="min-w-0">
                    {renderSpecial3PreviewTiles(
                      slot.display,
                      `results-special3-leader-${idx}`,
                      slot.path,
                      special3Leader.board,
                      {
                        align: "left",
                        disableRotation: true,
                        edgePadding: true,
                        minScale: 0.3,
                        onClick: () =>
                          openDefinition(slot.word || slot.display, {
                            preferLongDefinition: true,
                          }),
                        title: `Voir la définition de ${slot.display || slot.word}`,
                        ariaLabel: `Voir la définition de ${slot.display || slot.word}`,
                      }
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-2">
                    <span className={`${resultLabelClass} text-[11px] font-bold whitespace-nowrap`}>
                    {Number.isFinite(slot.pts) ? `${slot.pts} pts` : "--"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    };
    const roundRedDelta = Math.max(0, Number(resultsTeamDelta?.red) || 0);
    const roundBlueDelta = Math.max(0, Number(resultsTeamDelta?.blue) || 0);
    const roundRedDeltaClass = darkMode ? "text-red-300" : "text-red-700";
    const roundBlueDeltaClass = darkMode ? "text-blue-300" : "text-blue-700";
    const bestWordFinders = Array.isArray(endStats?.bestWord?.finders)
      ? endStats.bestWord.finders
      : [];
    const longestWordFinders = Array.isArray(endStats?.longestWord?.finders)
      ? endStats.longestWord.finders
      : [];
    const possibleBestWords = Array.isArray(endStats?.possibleBestWords)
      ? endStats.possibleBestWords
      : [];
    const possibleLongestGobbleWords = Array.isArray(endStats?.possibleLongestGobbleWords)
      ? endStats.possibleLongestGobbleWords
      : [];
    const longestWordGobbleDisplayCount =
      Number(endStats?.longestWord?.longGobbleCount) > 0
        ? Number(endStats?.longestWord?.gobbleCount) || 0
        : 0;
    const renderGobbleBadgeCluster = (count, keyPrefix = "gobble") => {
      const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
      if (!safeCount) return null;
      return (
        <span className="inline-flex items-center gap-0.5">
          {Array.from({ length: safeCount }).map((_, idx) =>
            gobbleBadgeUrl ? (
              <img
                key={`${keyPrefix}-${idx}`}
                src={gobbleBadgeUrl}
                alt="G"
                className="block h-3 w-auto"
                style={{ imageRendering: "auto" }}
              />
            ) : (
              <span key={`${keyPrefix}-${idx}`} className={darkMode ? "text-white" : "text-black"}>
                G
              </span>
            )
          )}
        </span>
      );
    };

    return (
      <div
        className={`border rounded-xl shadow-xl p-3 text-sm leading-snug space-y-2 relative overflow-hidden ${themeClasses} ${className}`}
        style={minHeightStyle}
      >
        {showOverlay && (
          <div
            className={`absolute inset-0 z-10 flex items-center justify-center text-center px-4 backdrop-blur-sm pointer-events-none ${
              darkMode ? "bg-black/45 text-white" : "bg-white/65 text-slate-900"
            }`}
          >
            <div className="space-y-2">
               {nextRoundLabel && (
                 <div className="text-xl sm:text-2xl font-black tracking-tight">
                   {nextRoundLabel}
                 </div>
               )}
               {upcomingSpecial?.isSpecial && (
                 <div className="space-y-1">
                   <div className="text-xs font-extrabold tracking-widest text-orange-600 dark:text-orange-300">
                     MANCHE SPECIALE
                   </div>
                   {upcomingSpecialName && (
                     <div className="text-sm font-bold opacity-90">
                       {upcomingSpecialName}
                     </div>
                   )}
                 </div>
               )}
              <div className="text-5xl sm:text-6xl font-black leading-none tabular-nums">
                {bc}s
              </div>
            </div>
          </div>
        )}
        <div className="text-center text-lg font-bold">Bilan</div>
        <div
          className={`rounded-lg border px-2 py-1 ${
            darkMode
              ? "bg-slate-900/60 border-white/10 text-slate-100"
              : "bg-white border-slate-200 text-slate-800"
          }`}
        >
          <div className="text-center text-lg sm:text-xl font-black tabular-nums leading-none">
            <span className={`${roundRedDeltaClass} text-[11px] sm:text-xs align-middle`}>+{roundRedDelta}</span>{" "}
            <span className="text-red-500">🔴 {duelRedScore}</span>{" "}
            <span className="opacity-55 text-sm sm:text-base align-middle">VS</span>{" "}
            <span className="text-blue-500">{duelBlueScore} 🔵</span>{" "}
            <span className={`${roundBlueDeltaClass} text-[11px] sm:text-xs align-middle`}>+{roundBlueDelta}</span>
          </div>
        </div>
        {showOfflineLabel ? (
          <div className="text-center text-[11px] text-amber-500">
            Vous etiez hors ligne sur cette manche.
          </div>
        ) : null}
        <div className="space-y-2">
          {renderSpecial3LeaderSummary(false)}
          {!isSpecial3RoundForResults &&
            !isSpeedRound &&
            specialRound?.type !== MASSIVE_BOGGLE_TYPE &&
            endStats.bestWord && (
            <div
              className="space-y-0.5"
              onMouseEnter={() => {
                if (!isMobileLayout) analyzeWord(endStats.bestWord.word);
              }}
              onMouseLeave={() => {
                if (!isMobileLayout) clearResultsWordAnalysis();
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className={`${resultLabelClass} text-[11px] sm:text-xs font-semibold`}>
                  Meilleur mot
                </span>
                <span className="flex items-center gap-1.5 text-right flex-wrap justify-end">
                  <button
                    type="button"
                    className={`font-bold break-all text-xs sm:text-sm underline-offset-2 hover:underline ${
                      darkMode ? "text-slate-100" : "text-slate-900"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openDefinition(endStats.bestWord.word);
                    }}
                    aria-label={`Voir la définition de ${endStats.bestWord.word}`}
                    title={`Voir la définition de ${endStats.bestWord.word}`}
                  >
                    {endStats.bestWord.word}
                  </button>
                  {renderGobbleBadgeCluster(endStats.bestWord.gobbleCount, "best-word-gobble")}
                  {endStats.bestWord.word && (
                    <button
                      type="button"
                      className={`inline-flex items-center justify-center rounded-full border px-1.5 py-0.5 ${
                        darkMode
                          ? "bg-slate-800 border-slate-600 text-slate-100"
                          : "bg-white border-gray-300 text-gray-700"
                      } ${shouldDefinitionBlink ? "animate-pulse" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openDefinition(endStats.bestWord.word);
                      }}
                      aria-label="Voir la définition"
                      title="Voir la définition"
                    >
                      <svg
                        width="14"
                        height="14"
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
                  <span className={`${resultLabelClass} text-[10px] whitespace-nowrap`}>
                    ({endStats.bestWord.pts} pts)
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {(bestWordFinders.length ? bestWordFinders : [{ nick: endStats.bestWord.nick }]).map(
                  (finder, idx) => (
                    <span
                      key={`best-finder-${finder?.nick || "player"}-${idx}`}
                      className={`${compactPillClass} break-all`}
                    >
                      {finder?.nick || "Joueur"}
                    </span>
                  )
                )}
              </div>
              {possibleBestWords.length ? (
                <div
                  className={`text-[10px] leading-tight flex flex-wrap items-center gap-1 ${
                    darkMode ? "text-amber-200" : "text-amber-800"
                  }`}
                >
                  <span className="font-semibold">Gobbles possibles :</span>
                  {possibleBestWords.slice(0, 8).map((entry, idx) => (
                    <span
                      key={`best-possible-${entry?.word || "word"}-${idx}`}
                      className="inline-flex items-center gap-1"
                    >
                      {entry?.word ? (
                        <button
                          type="button"
                          className={`font-bold underline-offset-2 hover:underline ${
                            darkMode ? "text-amber-100" : "text-amber-900"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openDefinition(entry.word);
                          }}
                          aria-label={`Voir la définition de ${entry.word}`}
                          title={`Voir la définition de ${entry.word}`}
                        >
                          {entry.word}
                        </button>
                      ) : (
                        <span className="font-bold">?</span>
                      )}
                      {renderGobbleBadgeCluster(entry?.gobbleCount || 1, `best-possible-g-${idx}`)}
                    </span>
                  ))}
                  {possibleBestWords.length > 8 ? (
                    <span className="opacity-80">+{possibleBestWords.length - 8}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
          {endStats.longestWord && (
            <div
              className="space-y-0.5"
              onMouseEnter={() => {
                if (!isMobileLayout) analyzeWord(endStats.longestWord.word);
              }}
              onMouseLeave={() => {
                if (!isMobileLayout) clearResultsWordAnalysis();
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className={`${resultLabelClass} text-[11px] sm:text-xs font-semibold`}>
                  Mot le plus long
                </span>
                <span className="flex items-center gap-1.5 text-right justify-end flex-nowrap">
                  <button
                    type="button"
                    className={`font-bold text-xs sm:text-sm underline-offset-2 hover:underline ${
                      darkMode ? "text-slate-100" : "text-slate-900"
                    }`}
                    style={longestWordStyle}
                    onClick={(e) => {
                      e.stopPropagation();
                      openDefinition(endStats.longestWord.word);
                    }}
                    aria-label={`Voir la définition de ${endStats.longestWord.word}`}
                    title={`Voir la définition de ${endStats.longestWord.word}`}
                  >
                    {endStats.longestWord.word}
                  </button>
                  {renderGobbleBadgeCluster(longestWordGobbleDisplayCount, "longest-word-gobble")}
                  {endStats.longestWord.word && (
                    <button
                      type="button"
                      className={`inline-flex items-center justify-center rounded-full border px-1.5 py-0.5 ${
                        darkMode
                          ? "bg-slate-800 border-slate-600 text-slate-100"
                          : "bg-white border-gray-300 text-gray-700"
                      } ${shouldDefinitionBlink ? "animate-pulse" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openDefinition(endStats.longestWord.word);
                      }}
                      aria-label="Voir la définition"
                      title="Voir la définition"
                    >
                      <svg
                        width="14"
                        height="14"
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
                  <span className={`${resultLabelClass} text-[10px] whitespace-nowrap`}>
                    ({endStats.longestWord.len} lettres)
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {(longestWordFinders.length
                  ? longestWordFinders
                  : [{ nick: endStats.longestWord.nick }]).map((finder, idx) => (
                  <span
                    key={`longest-finder-${finder?.nick || "player"}-${idx}`}
                    className={`${compactPillClass} break-all`}
                  >
                    {finder?.nick || "Joueur"}
                  </span>
                ))}
              </div>
              {possibleLongestGobbleWords.length ? (
                <div
                  className={`text-[10px] leading-tight flex flex-wrap items-center gap-1 ${
                    darkMode ? "text-amber-200" : "text-amber-800"
                  }`}
                >
                  <span className="font-semibold">Gobbles possibles :</span>
                  {possibleLongestGobbleWords.slice(0, 8).map((entry, idx) => (
                    <span
                      key={`long-possible-${entry?.word || "word"}-${idx}`}
                      className="inline-flex items-center gap-1"
                    >
                      {entry?.word ? (
                        <button
                          type="button"
                          className={`font-bold underline-offset-2 hover:underline ${
                            darkMode ? "text-amber-100" : "text-amber-900"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openDefinition(entry.word);
                          }}
                          aria-label={`Voir la définition de ${entry.word}`}
                          title={`Voir la définition de ${entry.word}`}
                        >
                          {entry.word}
                        </button>
                      ) : (
                        <span className="font-bold">?</span>
                      )}
                      {renderGobbleBadgeCluster(entry?.gobbleCount || 1, `long-possible-g-${idx}`)}
                    </span>
                  ))}
                  {possibleLongestGobbleWords.length > 8 ? (
                    <span className="opacity-80">+{possibleLongestGobbleWords.length - 8}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
          {endStats.mostWords && (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-3">
                <span className={`${resultLabelClass} text-[11px] sm:text-xs font-semibold`}>
                  Plus de mots
                </span>
                <span className="font-bold text-xs sm:text-sm text-right">
                  {endStats.mostWords.count}
                </span>
              </div>
              <div className="flex justify-start">
                <span className={`${compactPillClass} break-all`}>{endStats.mostWords.nick}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };
  const targetDefinitionHint =
    targetDefinition.phraseGuess && targetDefinition.matchedTitle
      ? `Définition trouvée pour ${targetDefinition.matchedTitle} (lié à '${targetDefinition.word}')`
      : targetDefinition.lemmaGuess && targetDefinition.lemma
      ? targetDefinition.lemmaLabel
        ? `${targetDefinition.lemmaLabel} ${targetDefinition.lemma}`
        : `Forme conjuguée probable - définition de ${targetDefinition.lemma}`
      : targetDefinition.participleGuess &&
        targetDefinition.participleLabel &&
        targetDefinition.participleBase
      ? `${targetDefinition.participleLabel} ${targetDefinition.participleBase}`
      : targetDefinition.inflectionGuess &&
        targetDefinition.inflectionLabel &&
        targetDefinition.inflectionBase
      ? `${targetDefinition.inflectionLabel} ${targetDefinition.inflectionBase}`
      : "";
  const targetDefinitionHintIsLemma = !!(
    targetDefinition.lemmaGuess && targetDefinition.lemma
  );
  const targetDefinitionList = targetDefinition.complete
    ? pickDefinitionList(targetDefinition)
    : [];
  const targetDefinitionEtymology = targetDefinition.complete
    ? sanitizeDefinitionText(targetDefinition.etymology)
    : "";
  const renderTargetDefinitionBody = ({ compact = false } = {}) => {
    if (targetDefinition.loading && !targetDefinition.definition) {
      return <span>Définition en cours...</span>;
    }
    if (targetDefinition.definition) {
      return (
        <DefinitionDetails
          definition={targetDefinition.definition}
          definitions={targetDefinitionList}
          etymology={targetDefinitionEtymology}
          darkMode={darkMode}
          showEtymology={targetDefinition.complete}
          compact={compact}
        />
      );
    }
    return <span>Définition indisponible</span>;
  };
  const renderTargetSummaryCard = (className = "", withBg = true) => {
    if (!isTargetRound || !targetSummary) return null;
    const themeClasses = darkMode
      ? `${withBg ? "bg-slate-900/90" : "bg-transparent"} border-slate-500 text-gray-100`
      : `${withBg ? "bg-white/90" : "bg-transparent"} border-gray-300 text-gray-900`;

    const bc = typeof breakCountdown === "number" ? Math.max(0, breakCountdown) : null;
    const inResults = serverStatus === "break" || phase === "results";
    const showOverlay = inResults && bc !== null && bc > 0 && bc <= 10;

    const specialTypeLabel = (() => {
      if (!upcomingSpecial?.isSpecial) return null;
      if (upcomingSpecial.type === "speed") return "JEU RAPIDE";
      if (upcomingSpecial.type === "monstrous") return "GRILLE MONSTRUEUSE";
      if (upcomingSpecial.type === DAILY_SPECIAL_MODE) return "3 MOTS";
      if (upcomingSpecial.type === FAKE_TWINS_TYPE) return "FAUX JUMEAUX";
      if (upcomingSpecial.type === "target_long") return "MOT LE PLUS LONG";
      if (upcomingSpecial.type === "target_score") return "MEILLEUR MOT";
      if (upcomingSpecial.type === "bonus_letter") return "LETTRE EN OR";
      if (upcomingSpecial.type === MASSIVE_BOGGLE_TYPE) return "MASSIVE BOGGLE";
      return String(upcomingSpecial.label || "MANCHE SPECIALE").toUpperCase();
    })();

    const nextRoundLabel = (() => {
      if (breakKind === "training_end") return "Fin de l’entraînement";
      if (breakKind === "tournament_end") return "Retour au salon";
      if (tournament?.nextRound && tournament?.totalRounds) {
        if (tournament.nextRound === tournament.totalRounds) return "Manche finale";
        return `Manche ${tournament.nextRound}`;
      }
      return null;
    })();

    const upcomingSpecialName = (() => {
      if (!upcomingSpecial?.isSpecial) return null;
      if (typeof upcomingSpecial.label === "string" && upcomingSpecial.label.trim()) {
        return upcomingSpecial.label.trim();
      }
      return specialTypeLabel;
    })();

    const rawWord = typeof targetSummary.word === "string" ? targetSummary.word : "";
    const cleanWord = rawWord.trim();
    const word = cleanWord ? cleanWord.toUpperCase() : "";
    const normWord = cleanWord ? normalizeWord(cleanWord) : "";
    const wordLength = normWord ? normWord.length : 0;
    const targetScore =
      specialRound?.type === "target_score" && normWord && board && board.length
        ? (() => {
            const path = findBestPathForWord(board, normWord, specialScoreConfig);
            if (!path) return null;
            return computeScore(normWord, path, board, specialScoreConfig);
          })()
        : null;

    return (
      <div
        className={`border rounded-xl shadow-xl p-4 text-sm leading-snug space-y-4 relative overflow-hidden ${themeClasses} ${className}`}
      >
        {showOverlay && (
          <div
            className={`absolute inset-0 z-10 flex items-center justify-center text-center px-4 backdrop-blur-sm ${
              darkMode ? "bg-black/60 text-white" : "bg-white/75 text-slate-900"
            }`}
          >
            <div className="space-y-2">
              {nextRoundLabel && (
                <div className="text-xl sm:text-2xl font-black tracking-tight">
                  {nextRoundLabel}
                </div>
              )}
              {upcomingSpecial?.isSpecial && (
                <div className="space-y-1">
                  <div className="text-xs font-extrabold tracking-widest text-orange-600 dark:text-orange-300">
                    MANCHE SPECIALE
                  </div>
                  {upcomingSpecialName && (
                    <div className="text-sm font-bold opacity-90">
                      {upcomingSpecialName}
                    </div>
                  )}
                </div>
              )}
              <div className="text-6xl sm:text-7xl font-black leading-none tabular-nums">
                {bc}s
              </div>
            </div>
          </div>
        )}
        <div className="text-center text-xs font-semibold tracking-widest text-slate-500">
          LE MOT ETAIT
        </div>
        <div className="text-center text-2xl sm:text-3xl font-black tracking-tight">
          <AutoScaleInline
            minScale={wordLength > 10 ? 0.54 : 0.62}
            className="gap-2 align-middle"
          >
            <span>{word || "?"}</span>
            {cleanWord ? (
              <button
                type="button"
                className={`inline-flex items-center justify-center rounded-full border px-2 py-1 ${
                  darkMode
                    ? "bg-slate-800 border-slate-600 text-slate-100"
                    : "bg-white border-gray-300 text-gray-700"
                } ${shouldDefinitionBlink ? "animate-pulse" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  openDefinition(cleanWord, {
                    preferLongDefinition: !targetSummary?.ocid,
                  });
                }}
                aria-label="Voir la définition"
                title="Voir la définition"
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
            ) : null}
          </AutoScaleInline>
        </div>
        {wordLength ? (
          <div className="text-center text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-300">
            {wordLength} lettres
            {Number.isFinite(targetScore) ? ` · ${formatNumber(targetScore)} pts` : ""}
          </div>
        ) : null}
        {targetDefinitionHint ? (
          <div
            className={`text-center text-[11px] sm:text-xs font-semibold ${
              targetDefinitionHintIsLemma
                ? darkMode
                  ? "text-emerald-300"
                  : "text-emerald-700"
                : darkMode
                ? "text-slate-300"
                : "text-slate-600"
            }`}
          >
            {targetDefinitionHint}
          </div>
        ) : null}
        <div className="text-center text-xs sm:text-sm text-slate-500 dark:text-slate-300 leading-snug">
          {renderTargetDefinitionBody()}
        </div>
      </div>
    );
  };
  const renderDesktopResultsDockPanel = () => {
    const panelClass = darkMode
      ? "bg-slate-950 border-slate-700 text-slate-100"
      : "bg-white border-slate-300 text-slate-900";
    const mutedClass = darkMode ? "text-slate-300" : "text-slate-600";
    const finderPillClass = darkMode
      ? "inline-flex items-center px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-semibold"
      : "inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-semibold";
    const roundRedDelta = Math.max(0, Number(resultsTeamDelta?.red) || 0);
    const roundBlueDelta = Math.max(0, Number(resultsTeamDelta?.blue) || 0);
    const roundRedDeltaClass = darkMode ? "text-red-300" : "text-red-700";
    const roundBlueDeltaClass = darkMode ? "text-blue-300" : "text-blue-700";
    const renderGobbleBadgeCluster = (count, keyPrefix = "dock-gobble") => {
      const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
      if (!safeCount) return null;
      return (
        <span className="inline-flex items-center gap-0.5">
          {Array.from({ length: safeCount }).map((_, idx) =>
            gobbleBadgeUrl ? (
              <img
                key={`${keyPrefix}-${idx}`}
                src={gobbleBadgeUrl}
                alt="G"
                className="block h-3 w-auto"
                style={{ imageRendering: "auto" }}
              />
            ) : (
              <span key={`${keyPrefix}-${idx}`} className={darkMode ? "text-white" : "text-black"}>
                G
              </span>
            )
          )}
        </span>
      );
    };
    const special3Leader = endStats?.special3Leader || null;
    const renderDockSpecial3LeaderSummary = () => {
      if (!isSpecial3RoundForResults || !special3Leader) return null;
      return (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className={`text-[11px] font-semibold ${mutedClass}`}>
              Meilleure combinaison 3 mots
            </span>
            <span className={`text-[10px] ${mutedClass}`}>{special3Leader.score} pts</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className={`${finderPillClass} break-all`}>{special3Leader.nick || "Joueur"}</span>
          </div>
          <div className="space-y-1.5">
            {special3Leader.slots.map((slot, idx) => (
              <div
                key={`dock-special3-leader-${slot.id}-${idx}`}
                className={`rounded-lg border px-2 py-1.5 ${
                  darkMode
                    ? "bg-slate-900 border-slate-700 text-slate-100"
                    : "bg-slate-50 border-slate-200 text-slate-800"
                }`}
              >
                <div className="min-w-0">
                  <div className="min-w-0">
                    {renderSpecial3PreviewTiles(
                      slot.display,
                      `dock-special3-leader-${idx}`,
                      slot.path,
                      special3Leader.board,
                      {
                        align: "left",
                        disableRotation: true,
                        edgePadding: true,
                        minScale: 0.3,
                        onClick: () =>
                          openDefinition(slot.word || slot.display, {
                            preferLongDefinition: true,
                          }),
                        title: `Voir la définition de ${slot.display || slot.word}`,
                        ariaLabel: `Voir la définition de ${slot.display || slot.word}`,
                      }
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-2">
                    <span className={`text-[11px] font-bold whitespace-nowrap ${mutedClass}`}>
                      {Number.isFinite(slot.pts) ? `${slot.pts} pts` : "--"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    };

    if (isTargetRound) {
      if (!targetSummary) return null;
      const rawWord = typeof targetSummary.word === "string" ? targetSummary.word : "";
      const cleanWord = rawWord.trim();
      const word = cleanWord ? cleanWord.toUpperCase() : "?";
      const normWord = cleanWord ? normalizeWord(cleanWord) : "";
      const wordLength = normWord ? normWord.length : 0;
      const targetScore =
        specialRound?.type === "target_score" && normWord && board && board.length
          ? (() => {
              const path = findBestPathForWord(board, normWord, specialScoreConfig);
              if (!path) return null;
              return computeScore(normWord, path, board, specialScoreConfig);
            })()
          : null;
      return (
        <div className={`rounded-2xl border p-3 shadow-lg ${panelClass}`}>
          <div className="text-center text-[11px] uppercase tracking-[0.2em] font-extrabold mb-1">
            Bilan cible
          </div>
          <div className="text-center text-xl sm:text-2xl font-black tracking-tight">{word}</div>
          <div className={`text-center text-xs font-semibold mt-1 ${mutedClass}`}>
            {wordLength ? `${wordLength} lettres` : "Longueur inconnue"}
            {Number.isFinite(targetScore) ? ` · ${formatNumber(targetScore)} pts` : ""}
          </div>
          {targetDefinitionHint ? (
            <div
              className={`mt-1 text-center text-[11px] font-semibold ${
                targetDefinitionHintIsLemma
                  ? darkMode
                    ? "text-emerald-300"
                    : "text-emerald-700"
                  : mutedClass
              }`}
            >
              {targetDefinitionHint}
            </div>
          ) : null}
          <div className={`mt-1 text-center text-xs leading-snug ${mutedClass}`}>
            {renderTargetDefinitionBody({ compact: true })}
          </div>
          {!targetSummary?.ocid ? (
            <div className="mt-2 text-center">
              <button
                type="button"
                className={`inline-flex items-center justify-center rounded-full border px-2 py-1 text-xs font-semibold ${
                  darkMode
                    ? "bg-slate-800 border-slate-600 text-slate-100"
                    : "bg-white border-gray-300 text-gray-700"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (cleanWord) openDefinition(cleanWord, { preferLongDefinition: true });
                }}
              >
                Définition complète
              </button>
            </div>
          ) : null}
        </div>
      );
    }

    if (!endStats) return null;
    const bestFinders = Array.isArray(endStats?.bestWord?.finders)
      ? endStats.bestWord.finders
      : [];
    const longestFinders = Array.isArray(endStats?.longestWord?.finders)
      ? endStats.longestWord.finders
      : [];
    const possibleBestWords = Array.isArray(endStats?.possibleBestWords)
      ? endStats.possibleBestWords
      : [];
    const possibleLongestGobbleWords = Array.isArray(endStats?.possibleLongestGobbleWords)
      ? endStats.possibleLongestGobbleWords
      : [];
    const longestWordGobbleDisplayCount =
      Number(endStats?.longestWord?.longGobbleCount) > 0
        ? Number(endStats?.longestWord?.gobbleCount) || 0
        : 0;
    const selfNickForResults = nicknameRef.current.trim();
    const selfNickKeyForResults = normalizeNickKey(selfNickForResults);
    const selfResultEntry =
      selfNickForResults && Array.isArray(finalResults)
        ? finalResults.find((entry) => normalizeNickKey(entry?.nick) === selfNickKeyForResults)
        : null;
    const showOfflineLabel = !standaloneTrainingSession && !selfResultEntry;

    return (
      <div className={`rounded-2xl border p-3 shadow-lg space-y-2 ${panelClass}`}>
        <div className="text-center text-[11px] uppercase tracking-[0.2em] font-extrabold">
          Bilan manche
        </div>
        <div
          className={`rounded-lg border px-2 py-1 ${
            darkMode
              ? "bg-slate-900 border-slate-700 text-slate-100"
              : "bg-slate-50 border-slate-200 text-slate-800"
          }`}
        >
          <div className="text-center text-lg font-black tabular-nums leading-none">
            <span className={`${roundRedDeltaClass} text-[11px] align-middle`}>+{roundRedDelta}</span>{" "}
            <span className="text-red-500">🔴 {duelRedScore}</span>{" "}
            <span className="opacity-55 text-sm align-middle">VS</span>{" "}
            <span className="text-blue-500">{duelBlueScore} 🔵</span>{" "}
            <span className={`${roundBlueDeltaClass} text-[11px] align-middle`}>+{roundBlueDelta}</span>
          </div>
        </div>
        {showOfflineLabel ? (
          <div className="text-center text-[11px] text-amber-500">
            Vous étiez hors ligne sur cette manche.
          </div>
        ) : null}
        {renderDockSpecial3LeaderSummary()}
        {!isSpecial3RoundForResults &&
        !isSpeedRound &&
        specialRound?.type !== MASSIVE_BOGGLE_TYPE &&
        endStats.bestWord ? (
          <div
            className="space-y-1"
            onMouseEnter={() => {
              if (!isMobileLayout) analyzeWord(endStats.bestWord.word);
            }}
            onMouseLeave={() => {
              if (!isMobileLayout) clearResultsWordAnalysis();
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className={`text-[11px] font-semibold ${mutedClass}`}>Meilleur mot</span>
              <span className="flex items-center gap-1.5 text-right flex-wrap justify-end">
                <button
                  type="button"
                  className={`font-bold text-xs sm:text-sm underline-offset-2 hover:underline ${
                    darkMode ? "text-slate-100" : "text-slate-900"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openDefinition(endStats.bestWord.word);
                  }}
                  aria-label={`Voir la définition de ${endStats.bestWord.word}`}
                  title={`Voir la définition de ${endStats.bestWord.word}`}
                >
                  {endStats.bestWord.word}
                </button>
                {renderGobbleBadgeCluster(endStats.bestWord.gobbleCount, "dock-best-main")}
                <span className={`text-[10px] ${mutedClass}`}>({endStats.bestWord.pts} pts)</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {(bestFinders.length ? bestFinders : [{ nick: endStats.bestWord.nick }]).map((finder, idx) => (
                <span key={`dock-best-finder-${finder?.nick || "player"}-${idx}`} className={finderPillClass}>
                  {finder?.nick || "Joueur"}
                </span>
              ))}
            </div>
            {possibleBestWords.length ? (
              <div className={`text-[10px] leading-tight flex flex-wrap items-center gap-1 ${mutedClass}`}>
                <span className="font-semibold">Gobbles possibles :</span>
                {possibleBestWords.slice(0, 8).map((entry, idx) => (
                  <span
                    key={`dock-best-possible-${entry?.word || "word"}-${idx}`}
                    className="inline-flex items-center gap-1"
                  >
                    {entry?.word ? (
                      <button
                        type="button"
                        className={`font-bold underline-offset-2 hover:underline ${
                          darkMode ? "text-amber-100" : "text-amber-900"
                        }`}
                        onMouseEnter={() => {
                          if (!isMobileLayout) analyzeWord(entry.word);
                        }}
                        onMouseLeave={() => {
                          if (!isMobileLayout) clearResultsWordAnalysis();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openDefinition(entry.word);
                        }}
                        aria-label={`Voir la définition de ${entry.word}`}
                        title={`Voir la définition de ${entry.word}`}
                      >
                        {entry.word}
                      </button>
                    ) : (
                      <span className="font-bold">?</span>
                    )}
                    {renderGobbleBadgeCluster(entry?.gobbleCount || 1, `dock-best-possible-g-${idx}`)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {endStats.longestWord ? (
          <div
            className="space-y-1"
            onMouseEnter={() => {
              if (!isMobileLayout) analyzeWord(endStats.longestWord.word);
            }}
            onMouseLeave={() => {
              if (!isMobileLayout) clearResultsWordAnalysis();
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className={`text-[11px] font-semibold ${mutedClass}`}>Mot le plus long</span>
              <span className="flex items-center gap-1.5 text-right flex-wrap justify-end">
                <button
                  type="button"
                  className={`font-bold text-xs sm:text-sm underline-offset-2 hover:underline ${
                    darkMode ? "text-slate-100" : "text-slate-900"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openDefinition(endStats.longestWord.word);
                  }}
                  aria-label={`Voir la définition de ${endStats.longestWord.word}`}
                  title={`Voir la définition de ${endStats.longestWord.word}`}
                >
                  {endStats.longestWord.word}
                </button>
                {renderGobbleBadgeCluster(longestWordGobbleDisplayCount, "dock-long-main")}
                <span className={`text-[10px] ${mutedClass}`}>
                  ({endStats.longestWord.len} lettres)
                </span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {(longestFinders.length ? longestFinders : [{ nick: endStats.longestWord.nick }]).map(
                (finder, idx) => (
                  <span key={`dock-long-finder-${finder?.nick || "player"}-${idx}`} className={finderPillClass}>
                    {finder?.nick || "Joueur"}
                  </span>
                )
              )}
            </div>
            {possibleLongestGobbleWords.length ? (
              <div className={`text-[10px] leading-tight flex flex-wrap items-center gap-1 ${mutedClass}`}>
                <span className="font-semibold">Gobbles possibles :</span>
                {possibleLongestGobbleWords.slice(0, 8).map((entry, idx) => (
                  <span
                    key={`dock-long-possible-${entry?.word || "word"}-${idx}`}
                    className="inline-flex items-center gap-1"
                  >
                    {entry?.word ? (
                      <button
                        type="button"
                        className={`font-bold underline-offset-2 hover:underline ${
                          darkMode ? "text-amber-100" : "text-amber-900"
                        }`}
                        onMouseEnter={() => {
                          if (!isMobileLayout) analyzeWord(entry.word);
                        }}
                        onMouseLeave={() => {
                          if (!isMobileLayout) clearResultsWordAnalysis();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openDefinition(entry.word);
                        }}
                        aria-label={`Voir la définition de ${entry.word}`}
                        title={`Voir la définition de ${entry.word}`}
                      >
                        {entry.word}
                      </button>
                    ) : (
                      <span className="font-bold">?</span>
                    )}
                    {renderGobbleBadgeCluster(entry?.gobbleCount || 1, `dock-long-possible-g-${idx}`)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return { renderDesktopResultsDockPanel };
}
