import React from "react";
import { normalizeWord } from "./gameLogic";
import WordPointsLabel from "./WordPointsLabel.jsx";

function DesktopResultsWordList({
  analysisWord = "",
  allWordsCount = 0,
  darkMode = false,
  displayList = [],
  gobbleBadgeUrl = "",
  gobbleCandidates = new Map(),
  hoveredResultsWordSet = new Set(),
  inactiveWordColor,
  listItemRefs,
  maxHeight,
  onAnalyzeWord,
  onClearAnalysis,
  onOpenDefinition,
  showAllWords = false,
  suppressWordListScores = false,
}) {
  const foundDotStyle = React.useMemo(
    () => ({
      width: "0.4rem",
      height: "0.4rem",
      borderRadius: "9999px",
      backgroundColor: darkMode ? "#f8fafc" : "#0f172a",
      flexShrink: 0,
    }),
    [darkMode]
  );

  const renderGobbleCandidate = React.useCallback(
    (word) => {
      const meta = gobbleCandidates.get(word);
      if (!meta) return null;
      const count = (meta.best ? 1 : 0) + (meta.long ? 1 : 0);
      if (!count) return null;
      return (
        <span className="inline-flex items-center gap-0.5">
          {Array.from({ length: count }).map((_, idx) =>
            gobbleBadgeUrl ? (
              <img
                key={`gobble-candidate-${word}-${idx}`}
                src={gobbleBadgeUrl}
                alt="G"
                className="block h-3 w-auto"
                style={{ imageRendering: "auto" }}
              />
            ) : (
              <span
                key={`gobble-candidate-${word}-${idx}`}
                className={darkMode ? "text-white" : "text-black"}
              >
                G
              </span>
            )
          )}
        </span>
      );
    },
    [darkMode, gobbleBadgeUrl, gobbleCandidates]
  );

  if (displayList.length === 0) {
    return (
      <div className="text-sm text-gray-500 shrink-0">
        {showAllWords && allWordsCount === 0 ? "Aucun mot (solveur non lancé)" : "Aucun mot trouvé."}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pr-2" style={{ maxHeight }}>
      <ul className="relative flex flex-col text-sm">
        {displayList.map((entry) => {
          const selected = analysisWord === entry.word;
          const status = entry.status;
          const isPending = status === "pending";
          const isRejected = status === "rejected";
          const isFound = entry.isFound || isPending;
          const isFoundByHoveredPlayer = hoveredResultsWordSet.has(normalizeWord(entry.word));
          const bestPts = entry.bestPts;
          const userPts = entry.userPts;
          const showOpt =
            !suppressWordListScores &&
            isFound &&
            typeof bestPts === "number" &&
            typeof userPts === "number" &&
            bestPts !== userPts &&
            !isPending &&
            !isRejected;
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

          return (
            <li
              key={entry.word}
              onMouseEnter={() => onAnalyzeWord?.(entry.word)}
              onMouseLeave={() => onClearAnalysis?.()}
              onClick={(e) => {
                e.stopPropagation();
                if (entry.word) onOpenDefinition?.(entry.word);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (entry.word) onOpenDefinition?.(entry.word);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Voir la définition de ${entry.word}`}
              ref={(el) => {
                if (!listItemRefs?.current) return;
                if (el) listItemRefs.current.set(entry.word, el);
                else listItemRefs.current.delete(entry.word);
              }}
              className={`cursor-pointer rounded px-1 flex items-center justify-between gap-2 transition ${
                selected
                  ? "bg-blue-50 text-blue-800"
                  : isFoundByHoveredPlayer
                  ? darkMode
                    ? "bg-emerald-900/25 text-emerald-100"
                    : "bg-emerald-50 text-emerald-900"
                  : "hover:bg-gray-100"
              }`}
              style={{
                transitionDuration: "220ms",
                transitionProperty: isTrouvable
                  ? "opacity, max-height"
                  : "opacity, transform, max-height",
                opacity: visible ? 1 : 0,
                transform: isTrouvable || visible ? "translateY(0)" : "translateY(-8px)",
                maxHeight: visible ? "48px" : "0px",
                paddingTop: visible ? "2px" : "0px",
                paddingBottom: visible ? "2px" : "0px",
                overflow: "hidden",
                pointerEvents: visible ? "auto" : "none",
                position: "relative",
                color: !isFound && !isPending && darkMode ? inactiveWordColor : undefined,
              }}
            >
              <span className="flex items-center gap-2">
                {isFound ? (
                  <span
                    style={{
                      ...foundDotStyle,
                      opacity: isPending ? 0.4 : 1,
                    }}
                    aria-hidden="true"
                  />
                ) : (
                  <span style={{ ...foundDotStyle, opacity: 0 }} aria-hidden="true" />
                )}
                <span className="flex items-center gap-1 min-w-0">
                  <span className={`${wordClassName} ${fakeTwinsWordClassName}`.trim()}>
                    {entry.word}
                  </span>
                  {renderGobbleCandidate(entry.word)}
                </span>
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                {!suppressWordListScores && typeof userPts === "number" && isFound && (
                  <WordPointsLabel
                    pts={userPts}
                    mode="found"
                    usedFakeTwins={!!entry?.usedFakeTwins}
                    darkMode={darkMode}
                    className={`font-extrabold ${darkMode ? "text-slate-100" : "text-slate-800"}`}
                  />
                )}
                {isPending && <span className="text-[0.65rem] text-gray-400">envoi...</span>}
                {isRejected && (
                  <span className={`text-[0.65rem] ${darkMode ? "text-red-300" : "text-red-600"}`}>
                    refusé
                  </span>
                )}
                {!suppressWordListScores && !isFound && typeof bestPts === "number" && (
                  <WordPointsLabel
                    pts={bestPts}
                    mode="best"
                    usedFakeTwins={!!entry?.usedFakeTwins}
                    darkMode={darkMode}
                    className="text-slate-500 opacity-75"
                  />
                )}
                {showOpt && (
                  <WordPointsLabel
                    pts={bestPts}
                    mode="opt"
                    usedFakeTwins={!!entry?.usedFakeTwins}
                    darkMode={darkMode}
                    className={`text-[0.65rem] ${darkMode ? "text-red-300" : "text-red-600"}`}
                  />
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default React.memo(DesktopResultsWordList);
