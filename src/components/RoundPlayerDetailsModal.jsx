import React from "react";
import { createPortal } from "react-dom";
import WordPointsLabel from "./WordPointsLabel.jsx";

const WORDS_SCROLL_MAX_HEIGHT = "clamp(320px, calc(100vh - 280px), 720px)";
const DARK_WORD_INACTIVE = "#e2e8f0";
const RESULTS_SWIPE_THRESHOLD = 52;

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function formatTargetTime(ms) {
  if (!Number.isFinite(ms)) return "PAS TROUVE";
  const seconds = Math.max(0, ms) / 1000;
  return `${seconds.toFixed(1).replace(".", ",")}s`;
}

function formatRecordRankLabel(record) {
  if (!record) return "Hors classement";
  const rank = record.rank;
  const total = record.rankTotal;
  if (Number.isFinite(rank)) {
    return Number.isFinite(total) ? `#${rank} / ${total}` : `#${rank}`;
  }
  return "Hors classement";
}

function formatRecordValueLabel(record) {
  if (!record) return "";
  if (record.categoryKey === "bestWord") {
    if (!record.word) return "";
    const pts = Number.isFinite(record.pts) ? ` (${record.pts} pts)` : "";
    return `Mot : ${record.word}${pts}`;
  }
  if (record.categoryKey === "bestRoundScore") {
    return Number.isFinite(record.pts) ? `Score : ${record.pts} pts` : "";
  }
  if (record.categoryKey === "longestWord") {
    if (!record.word) return "";
    const len = Number.isFinite(record.len) ? ` (${record.len} lettres)` : "";
    return `Mot : ${record.word}${len}`;
  }
  if (record.categoryKey === "bestSpecial3Score") {
    return Number.isFinite(record.pts) ? `Score : ${record.pts} pts` : "";
  }
  if (record.categoryKey === "mostWordsInGame") {
    return Number.isFinite(record.wordsCount)
      ? `Mots : ${record.wordsCount} par manche`
      : "";
  }
  if (
    record.categoryKey === "bestTimeTargetLong" ||
    record.categoryKey === "bestTimeTargetScore"
  ) {
    return Number.isFinite(record.timeMs)
      ? `Temps : ${formatTargetTime(record.timeMs)}`
      : "";
  }
  return "";
}

function formatPlayerRankLabel(rank, total) {
  if (!Number.isFinite(rank) || rank <= 0) return "";
  const safeRank = Math.max(1, Math.trunc(rank));
  const ordinal = safeRank === 1 ? "1er" : `${safeRank}e`;
  if (Number.isFinite(total) && total > 0) {
    return `${ordinal} / ${Math.trunc(total)}`;
  }
  return ordinal;
}

export default function RoundPlayerDetailsModal({
  open = false,
  darkMode = false,
  playerNick = "",
  records = [],
  words = [],
  allWords = [],
  anchorRect = null,
  targetBoardKey = "",
  targetBoardLabel = "",
  targetBoardEntries = [],
  gobbleBadgeUrl = "",
  isSpeedRound = false,
  showWordScores = true,
  playerRank = null,
  playerRankTotal = 0,
  canGoPrev = false,
  canGoNext = false,
  onPrevPlayer = null,
  onNextPlayer = null,
  onToggleWordViewSound = null,
  onClose = null,
  onOpenDefinition = null,
}) {
  const PANEL_ANIM_MS = 280;
  const CONTENT_FADE_MS = 300;
  const [mounted, setMounted] = React.useState(open);
  const [expanded, setExpanded] = React.useState(false);
  const [contentVisible, setContentVisible] = React.useState(false);
  const [showAllWords, setShowAllWords] = React.useState(false);
  const closePanelTimerRef = React.useRef(null);
  const closeUnmountTimerRef = React.useRef(null);
  const openContentTimerRef = React.useRef(null);
  const listItemRefs = React.useRef(new Map());
  const wordListFlipPrevRectsRef = React.useRef(new Map());
  const wordListFlipPendingRef = React.useRef(false);
  const wordListFlipRafIdsRef = React.useRef([]);
  const wordListFlipTimersRef = React.useRef(new Map());
  const wordsTouchRef = React.useRef({ startX: null, startY: null });
  const wordsSlideWidthRef = React.useRef(1);
  const wordsDraggingRef = React.useRef(false);

  const clearAnimationTimers = React.useCallback(() => {
    if (closePanelTimerRef.current) {
      clearTimeout(closePanelTimerRef.current);
      closePanelTimerRef.current = null;
    }
    if (closeUnmountTimerRef.current) {
      clearTimeout(closeUnmountTimerRef.current);
      closeUnmountTimerRef.current = null;
    }
    if (openContentTimerRef.current) {
      clearTimeout(openContentTimerRef.current);
      openContentTimerRef.current = null;
    }
  }, []);

  const clearWordListFlipArtifacts = React.useCallback(() => {
    if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
      wordListFlipRafIdsRef.current.forEach((id) => window.cancelAnimationFrame(id));
    }
    wordListFlipRafIdsRef.current = [];
    wordListFlipTimersRef.current.forEach((id) => clearTimeout(id));
    wordListFlipTimersRef.current.clear();
  }, []);

  const isFoundLikeEntry = React.useCallback((entry) => !!entry?.isFound, []);

  const prepareWordListFlip = React.useCallback(
    (list) => {
      if (typeof window === "undefined") return;
      const map = new Map();
      (list || []).forEach((entry) => {
        if (!isFoundLikeEntry(entry)) return;
        const el = listItemRefs.current.get(entry.word);
        if (!el) return;
        map.set(entry.word, el.getBoundingClientRect());
      });
      wordListFlipPrevRectsRef.current = map;
      wordListFlipPendingRef.current = map.size > 0;
    },
    [isFoundLikeEntry]
  );

  React.useEffect(() => {
    if (open) {
      clearAnimationTimers();
      clearWordListFlipArtifacts();
      wordListFlipPrevRectsRef.current = new Map();
      wordListFlipPendingRef.current = false;
      setExpanded(false);
      setContentVisible(false);
      setShowAllWords(false);
      setMounted(true);
      let raf1 = 0;
      let raf2 = 0;
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setExpanded(true);
          openContentTimerRef.current = setTimeout(() => {
            setContentVisible(true);
            openContentTimerRef.current = null;
          }, PANEL_ANIM_MS);
        });
      });
      return () => {
        if (raf1) cancelAnimationFrame(raf1);
        if (raf2) cancelAnimationFrame(raf2);
      };
    }
    if (!mounted) return;
    clearAnimationTimers();
    clearWordListFlipArtifacts();
    // Le contenu disparaît d'abord, puis la bulle se replie vers le pseudo.
    setContentVisible(false);
    closePanelTimerRef.current = setTimeout(() => {
      setExpanded(false);
      closePanelTimerRef.current = null;
    }, CONTENT_FADE_MS);
    closeUnmountTimerRef.current = setTimeout(() => {
      setMounted(false);
      closeUnmountTimerRef.current = null;
    }, CONTENT_FADE_MS + PANEL_ANIM_MS);
    return clearAnimationTimers;
  }, [open, mounted, clearAnimationTimers, clearWordListFlipArtifacts]);

  React.useEffect(() => () => clearAnimationTimers(), [clearAnimationTimers]);
  React.useEffect(() => () => clearWordListFlipArtifacts(), [clearWordListFlipArtifacts]);

  React.useEffect(() => {
    if (!mounted || typeof document === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mounted, onClose]);

  const recordsList = Array.isArray(records) ? records : [];
  const foundWordsList = Array.isArray(words) ? words : [];
  const fullWordPool = Array.isArray(allWords) ? allWords : [];
  const hasTargetBoard = Array.isArray(targetBoardEntries) && targetBoardEntries.length > 0;
  const foundWordsMap = React.useMemo(() => {
    const map = new Map();
    foundWordsList.forEach((entry) => {
      const word = String(entry?.word || "").trim();
      if (!word) return;
      const gobbleCount = Math.max(
        0,
        Math.trunc(Number(entry?.gobbleCount) || (entry?.isGobble ? 1 : 0))
      );
      map.set(word, {
        word,
        userPts: Number.isFinite(entry?.pts) ? entry.pts : null,
        isGobble: gobbleCount > 0,
        gobbleCount,
        usedFakeTwins: !!entry?.usedFakeTwins,
      });
    });
    return map;
  }, [foundWordsList]);
  const comparableWordsList = React.useMemo(() => {
    const map = new Map();
    fullWordPool.forEach((entry) => {
      const word = String(entry?.word || "").trim();
      if (!word) return;
      const gobbleCount = Math.max(
        0,
        Math.trunc(Number(entry?.gobbleCount) || (entry?.isGobble ? 1 : 0))
      );
      map.set(word, {
        word,
        bestPts: Number.isFinite(entry?.pts) ? entry.pts : null,
        isGobble: gobbleCount > 0,
        gobbleCount,
        usedFakeTwins: !!entry?.usedFakeTwins,
      });
    });
    foundWordsMap.forEach((meta, word) => {
      if (!map.has(word)) {
        map.set(word, {
          word,
          bestPts: Number.isFinite(meta?.userPts) ? meta.userPts : null,
          isGobble: !!meta?.isGobble,
          gobbleCount: Math.max(
            0,
            Math.trunc(Number(meta?.gobbleCount) || (meta?.isGobble ? 1 : 0))
          ),
          usedFakeTwins: !!meta?.usedFakeTwins,
        });
      }
    });
    const list = Array.from(map.values()).map((entry) => {
      const foundMeta = foundWordsMap.get(entry.word);
      return {
        word: entry.word,
        isFound: !!foundMeta,
        status: foundMeta ? "accepted" : "idle",
        userPts: foundMeta?.userPts ?? null,
        bestPts: entry.bestPts,
        isGobble: !!(entry?.isGobble || foundMeta?.isGobble),
        usedFakeTwins: !!(entry?.usedFakeTwins || foundMeta?.usedFakeTwins),
        gobbleCount: Math.max(
          0,
          Math.trunc(
            Math.max(
              Number(entry?.gobbleCount) || (entry?.isGobble ? 1 : 0),
              Number(foundMeta?.gobbleCount) || (foundMeta?.isGobble ? 1 : 0)
            )
          )
        ),
      };
    });
    list.sort((a, b) => {
      const ptsDiff = (Number(b?.bestPts) || 0) - (Number(a?.bestPts) || 0);
      if (ptsDiff !== 0) return ptsDiff;
      return String(a?.word || "").localeCompare(String(b?.word || ""), "fr", {
        sensitivity: "base",
      });
    });
    return list;
  }, [fullWordPool, foundWordsMap]);
  const foundWordsCount = foundWordsList.length;
  const setWordView = React.useCallback(
    (nextShowAll, { withSound = true } = {}) => {
      setShowAllWords((prev) => {
        if (prev === nextShowAll) return prev;
        prepareWordListFlip(comparableWordsList);
        if (withSound) onToggleWordViewSound?.();
        return nextShowAll;
      });
    },
    [comparableWordsList, onToggleWordViewSound, prepareWordListFlip]
  );

  const handleWordsTouchStart = React.useCallback((e) => {
    const touch = e?.touches?.[0];
    if (!touch) return;
    wordsTouchRef.current.startX = touch.clientX;
    wordsTouchRef.current.startY = touch.clientY;
    wordsSlideWidthRef.current =
      (e?.currentTarget?.getBoundingClientRect?.().width ?? window.innerWidth ?? 1) || 1;
    wordsDraggingRef.current = false;
  }, []);

  const handleWordsTouchMove = React.useCallback((e) => {
    const startX = wordsTouchRef.current.startX;
    const startY = wordsTouchRef.current.startY;
    if (startX == null || startY == null) return;
    const touch = e?.touches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (!wordsDraggingRef.current) {
      if (Math.abs(deltaX) < 8) return;
      if (Math.abs(deltaX) < Math.abs(deltaY)) {
        wordsTouchRef.current.startX = null;
        wordsTouchRef.current.startY = null;
        wordsDraggingRef.current = false;
        return;
      }
      wordsDraggingRef.current = true;
    }
  }, []);

  const handleWordsTouchEnd = React.useCallback(
    (e) => {
      const startX = wordsTouchRef.current.startX;
      const startY = wordsTouchRef.current.startY;
      wordsTouchRef.current.startX = null;
      wordsTouchRef.current.startY = null;
      const width = wordsSlideWidthRef.current || window.innerWidth || 1;
      const touch = e?.changedTouches?.[0];
      wordsDraggingRef.current = false;
      if (startX == null || startY == null || !touch) return;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const threshold = Math.max(RESULTS_SWIPE_THRESHOLD, width * 0.12);
      if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY)) return;
      setWordView(deltaX < 0, { withSound: true });
    },
    [setWordView]
  );

  const foundDotStyle = {
    width: "0.4rem",
    height: "0.4rem",
    borderRadius: "9999px",
    backgroundColor: darkMode ? "#f8fafc" : "#0f172a",
    flexShrink: 0,
  };
  const gobbleMaxPts = isSpeedRound
    ? 0
    : comparableWordsList.reduce((max, entry) => {
        const pts = entry?.bestPts;
        if (!Number.isFinite(pts)) return max;
        return Math.max(max, pts);
      }, 0);
  const gobbleMaxLen = comparableWordsList.reduce((max, entry) => {
    const len = String(entry?.word || "").trim().length;
    return Math.max(max, len);
  }, 0);
  const gobbleCandidates = React.useMemo(() => {
    const map = new Map();
    if (gobbleMaxPts <= 0 && gobbleMaxLen <= 0) return map;
    comparableWordsList.forEach((entry) => {
      const len = String(entry?.word || "").trim().length;
      const isBest = !isSpeedRound && Number.isFinite(entry?.bestPts) && entry.bestPts === gobbleMaxPts;
      const isLong = len > 0 && len === gobbleMaxLen;
      const explicitCount = Math.max(
        0,
        Math.trunc(Number(entry?.gobbleCount) || (entry?.isGobble ? 1 : 0))
      );
      if (!isBest && !isLong && explicitCount <= 0) return;
      map.set(entry.word, {
        best: isBest,
        long: isLong,
        explicitCount,
      });
    });
    return map;
  }, [comparableWordsList, gobbleMaxLen, gobbleMaxPts, isSpeedRound]);

  const renderGobbleCandidate = React.useCallback(
    (word) => {
      const meta = gobbleCandidates.get(word);
      if (!meta) return null;
      const computedCount = (meta.best ? 1 : 0) + (meta.long ? 1 : 0);
      const count = Math.max(0, Number(meta.explicitCount) || 0, computedCount);
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

  React.useLayoutEffect(() => {
    if (!wordListFlipPendingRef.current) return;
    const prevRects = wordListFlipPrevRectsRef.current;
    wordListFlipPendingRef.current = false;
    if (!prevRects || prevRects.size === 0) return;

    clearWordListFlipArtifacts();
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      return;
    }

    const startRaf = window.requestAnimationFrame(() => {
      comparableWordsList.forEach((entry) => {
        if (!isFoundLikeEntry(entry)) return;
        const el = listItemRefs.current.get(entry.word);
        if (!el) return;
        const prevRect = prevRects.get(entry.word);
        if (!prevRect) return;
        const nextRect = el.getBoundingClientRect();
        const dx = prevRect.left - nextRect.left;
        const dy = prevRect.top - nextRect.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.style.willChange = "transform";

        const settleRaf = window.requestAnimationFrame(() => {
          if (!el.isConnected) return;
          el.style.transition = "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)";
          el.style.transform = "";
          const timeoutId = setTimeout(() => {
            if (!el.isConnected) return;
            el.style.transition = "";
            el.style.transform = "";
            el.style.willChange = "";
          }, 280);
          wordListFlipTimersRef.current.set(entry.word, timeoutId);
        });
        wordListFlipRafIdsRef.current.push(settleRaf);
      });
    });

    wordListFlipRafIdsRef.current.push(startRaf);
  }, [comparableWordsList, isFoundLikeEntry, clearWordListFlipArtifacts, showAllWords]);

  if (!mounted || typeof document === "undefined") return null;

  const viewportWidth = Math.max(
    320,
    Math.round(window.innerWidth || document.documentElement?.clientWidth || 0)
  );
  const viewportHeight = Math.max(
    320,
    Math.round(window.innerHeight || document.documentElement?.clientHeight || 0)
  );
  const bubbleSize = 34;
  const anchorX = isFiniteNumber(anchorRect?.left)
    ? anchorRect.left + (anchorRect?.width || 0) / 2
    : viewportWidth / 2;
  const anchorY = isFiniteNumber(anchorRect?.top)
    ? anchorRect.top + (anchorRect?.height || 0) / 2
    : viewportHeight / 2;

  const panelWidth = Math.min(560, viewportWidth - 20);
  const panelHeight = Math.min(Math.max(320, Math.round(viewportHeight * 0.78)), viewportHeight - 20);
  const panelLeft = Math.max(10, Math.round((viewportWidth - panelWidth) / 2));
  const panelTop = Math.max(10, Math.round((viewportHeight - panelHeight) / 2));

  const fromLeft = Math.round(anchorX - bubbleSize / 2);
  const fromTop = Math.round(anchorY - bubbleSize / 2);

  const panelStyle = {
    left: expanded ? panelLeft : fromLeft,
    top: expanded ? panelTop : fromTop,
    width: expanded ? panelWidth : bubbleSize,
    height: expanded ? panelHeight : bubbleSize,
    borderRadius: expanded ? 18 : 9999,
    transform: expanded ? "translate3d(0,0,0) scale(1)" : "translate3d(0,0,0) scale(0.6)",
    opacity: expanded ? 1 : 0.82,
    transition:
      "left 280ms cubic-bezier(0.22,1,0.36,1), top 280ms cubic-bezier(0.22,1,0.36,1), width 280ms cubic-bezier(0.22,1,0.36,1), height 280ms cubic-bezier(0.22,1,0.36,1), border-radius 280ms cubic-bezier(0.22,1,0.36,1), transform 280ms cubic-bezier(0.22,1,0.36,1), opacity 220ms ease",
    transformOrigin: `${Math.round(anchorX)}px ${Math.round(anchorY)}px`,
  };
  return createPortal(
    <div className="fixed inset-0 z-[12075]">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{
          backgroundColor: darkMode ? "rgba(2,6,23,0.62)" : "rgba(15,23,42,0.35)",
          opacity: expanded ? 1 : 0,
          transition: "opacity 220ms ease",
        }}
        onClick={() => onClose?.()}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`absolute border shadow-2xl overflow-hidden ${
          darkMode
            ? "bg-slate-900/95 border-slate-700 text-slate-100"
            : "bg-white/95 border-slate-200 text-slate-900"
        }`}
        style={panelStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="h-full w-full flex flex-col min-h-0">
          <div
            className={`flex items-center justify-between gap-2 px-4 py-3 border-b ${
              darkMode ? "border-slate-700" : "border-slate-200"
            }`}
          >
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.16em] font-bold opacity-70">
                {hasTargetBoard ? "Classement hebdo" : "Mots de manche"}
              </div>
              <div className="text-base font-extrabold truncate">
                {hasTargetBoard ? targetBoardLabel || "Classement cible" : playerNick || "Joueur"}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canGoPrev ? (
                <button
                  type="button"
                  className={`h-8 w-8 rounded-full border text-lg font-bold leading-none ${
                    darkMode
                      ? "bg-slate-800 border-slate-600 text-slate-100"
                      : "bg-white border-slate-300 text-slate-700"
                  }`}
                  onClick={() => onPrevPlayer?.()}
                  aria-label="Joueur précédent"
                >
                  &#8249;
                </button>
              ) : null}
              {Number.isFinite(playerRank) ? (
                <div className="text-[11px] font-bold tabular-nums opacity-80 min-w-[72px] text-center">
                  {formatPlayerRankLabel(playerRank, playerRankTotal)}
                </div>
              ) : null}
              {canGoNext ? (
                <button
                  type="button"
                  className={`h-8 w-8 rounded-full border text-lg font-bold leading-none ${
                    darkMode
                      ? "bg-slate-800 border-slate-600 text-slate-100"
                      : "bg-white border-slate-300 text-slate-700"
                  }`}
                  onClick={() => onNextPlayer?.()}
                  aria-label="Joueur suivant"
                >
                  &#8250;
                </button>
              ) : null}
              <button
                type="button"
                className={`h-8 px-3 rounded-full text-xs font-semibold border ${
                  darkMode
                    ? "bg-slate-800 border-slate-600 text-slate-100"
                    : "bg-white border-slate-300 text-slate-700"
                }`}
                onClick={() => onClose?.()}
              >
                Fermer
              </button>
            </div>
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar custom-scrollbar-gray"
            style={{
              opacity: contentVisible ? 1 : 0,
              transition: `opacity ${CONTENT_FADE_MS}ms ease`,
              pointerEvents: contentVisible ? "auto" : "none",
            }}
          >
            {recordsList.length ? (
              <div className="space-y-2">
                {recordsList.map((record) => (
                  <div
                    key={record.id || `${record.categoryKey}-${record.nick || playerNick}`}
                    className={`rounded-xl border px-3 py-2 ${
                      darkMode
                        ? "border-white/10 bg-slate-900/40"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="text-[11px] font-extrabold">
                      {record.categoryLabel || "Record"}
                    </div>
                    <div className="text-[10px] opacity-70">
                      Classement hebdo : {formatRecordRankLabel(record)}
                    </div>
                    {formatRecordValueLabel(record) ? (
                      <div className="text-[11px] font-semibold">
                        {formatRecordValueLabel(record)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {hasTargetBoard ? (
              <div className="space-y-1">
                {targetBoardEntries.map((entry, index) => (
                  <div
                    key={`${targetBoardKey || "target"}-${entry?.nick || "player"}-${index}`}
                    className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-2 ${
                      darkMode
                        ? "border-slate-700 bg-slate-900/35"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="text-[11px] font-bold opacity-70 tabular-nums">
                        #{Number(entry?.rank) || index + 1}
                      </span>
                      <span
                        className={`text-sm font-semibold truncate ${
                          entry?.isSelf ? "text-blue-600 dark:text-blue-300" : ""
                        }`}
                      >
                        {entry?.nick || "Joueur"}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold tabular-nums opacity-80 whitespace-nowrap">
                      {Number.isFinite(entry?.ms) ? formatTargetTime(entry.ms) : "--"}
                    </span>
                  </div>
                ))}
              </div>
            ) : comparableWordsList.length ? (
              <div className="flex flex-col min-h-0 gap-2">
                <div className="flex items-center justify-between shrink-0">
                  <div>
                    <h2 className="text-lg font-bold">Mots</h2>
                    <div className="text-xs text-gray-500 dark:text-slate-300">
                      {showAllWords
                        ? `Tous (${comparableWordsList.length})`
                        : `Trouvés (${foundWordsCount})`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div
                      className={`inline-flex rounded-full overflow-hidden ${
                        darkMode ? "border border-slate-700" : "border border-gray-300"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setWordView(false, { withSound: true })}
                        className={`px-3 py-1 transition ${
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
                        onClick={() => setWordView(true, { withSound: true })}
                        className={`px-3 py-1 transition ${
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
                <div
                  className="min-h-0 overflow-y-auto pr-2"
                  style={{ maxHeight: WORDS_SCROLL_MAX_HEIGHT }}
                  onTouchStart={handleWordsTouchStart}
                  onTouchMove={handleWordsTouchMove}
                  onTouchEnd={handleWordsTouchEnd}
                  onTouchCancel={handleWordsTouchEnd}
                >
                  <ul className="relative flex flex-col text-sm">
                    {comparableWordsList.map((entry) => {
                      const status = entry.status || "idle";
                      const isPending = status === "pending";
                      const isRejected = status === "rejected";
                      const isFound = entry.isFound || isPending;
                      const bestPts = entry.bestPts;
                      const userPts = entry.userPts;
                      const showOpt =
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
                          ref={(el) => {
                            if (el) listItemRefs.current.set(entry.word, el);
                            else listItemRefs.current.delete(entry.word);
                          }}
                          className={`rounded px-1 flex items-center justify-between gap-2 transition ${
                            darkMode ? "hover:bg-slate-800/70" : "hover:bg-gray-100"
                          }`}
                          style={{
                            transitionDuration: "220ms",
                            transitionProperty: isTrouvable
                              ? "opacity, max-height"
                              : "opacity, transform, max-height",
                            opacity: visible ? 1 : 0,
                            transform:
                              isTrouvable || visible ? "translateY(0)" : "translateY(-8px)",
                            maxHeight: visible ? "48px" : "0px",
                            paddingTop: visible ? "2px" : "0px",
                            paddingBottom: visible ? "2px" : "0px",
                            overflow: "hidden",
                            pointerEvents: visible ? "auto" : "none",
                            position: "relative",
                            color:
                              !isFound && !isPending && darkMode ? DARK_WORD_INACTIVE : undefined,
                          }}
                        >
                          <button
                            type="button"
                            className="flex items-center gap-2 text-left w-1/2 min-w-0"
                            onClick={() => onOpenDefinition?.(entry.word)}
                            aria-label={`Voir la definition de ${entry.word}`}
                            title="Voir la definition"
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
                              <span className={`${wordClassName} ${fakeTwinsWordClassName}`.trim()}>
                                {entry.word}
                              </span>
                              {renderGobbleCandidate(entry.word)}
                            </span>
                          </button>
                          <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                            {showWordScores && typeof userPts === "number" && isFound && (
                              <WordPointsLabel
                                pts={userPts}
                                mode="found"
                                usedFakeTwins={!!entry?.usedFakeTwins}
                                darkMode={darkMode}
                                className={`font-extrabold ${
                                  darkMode ? "text-slate-100" : "text-slate-800"
                                }`}
                              />
                            )}
                            {isPending && (
                              <span className="text-[0.65rem] text-gray-400">envoi...</span>
                            )}
                            {isRejected && (
                              <span
                                className={`text-[0.65rem] ${
                                  darkMode ? "text-red-300" : "text-red-600"
                                }`}
                              >
                                refusé
                              </span>
                            )}
                            {showWordScores && !isFound && typeof bestPts === "number" && (
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
                                className={`text-[0.65rem] ${
                                  darkMode ? "text-red-300" : "text-red-600"
                                }`}
                              />
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="text-sm opacity-70 py-4 text-center">
                {targetBoardKey
                  ? "Classement cible indisponible."
                  : "Aucun mot trouvé sur cette manche."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
