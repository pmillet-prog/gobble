import React from "react";
import { createPortal } from "react-dom";

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
  if (record.categoryKey === "longestWord") {
    if (!record.word) return "";
    const len = Number.isFinite(record.len) ? ` (${record.len} lettres)` : "";
    return `Mot : ${record.word}${len}`;
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

export default function RoundPlayerDetailsModal({
  open = false,
  darkMode = false,
  playerNick = "",
  records = [],
  words = [],
  anchorRect = null,
  targetBoardKey = "",
  targetBoardLabel = "",
  targetBoardEntries = [],
  gobbleBadgeUrl = "",
  showWordScores = true,
  onClose = null,
  onOpenDefinition = null,
}) {
  const PANEL_ANIM_MS = 280;
  const CONTENT_FADE_MS = 300;
  const [mounted, setMounted] = React.useState(open);
  const [expanded, setExpanded] = React.useState(false);
  const [contentVisible, setContentVisible] = React.useState(false);
  const closePanelTimerRef = React.useRef(null);
  const closeUnmountTimerRef = React.useRef(null);
  const openContentTimerRef = React.useRef(null);

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

  React.useEffect(() => {
    if (open) {
      clearAnimationTimers();
      setExpanded(false);
      setContentVisible(false);
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
  }, [open, mounted, clearAnimationTimers]);

  React.useEffect(() => () => clearAnimationTimers(), [clearAnimationTimers]);

  React.useEffect(() => {
    if (!mounted || typeof document === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mounted, onClose]);

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
  const recordsList = Array.isArray(records) ? records : [];
  const wordsList = Array.isArray(words) ? words : [];
  const hasTargetBoard = Array.isArray(targetBoardEntries) && targetBoardEntries.length > 0;

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
            ) : wordsList.length ? (
              <div className="space-y-1">
                {wordsList.map((entry, index) => (
                  <div
                    key={`${entry.word}-${index}`}
                    className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-2 ${
                      darkMode
                        ? "border-slate-700 bg-slate-900/35"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                        <span>{entry.word}</span>
                        {entry?.isGobble ? (
                          gobbleBadgeUrl ? (
                            <img
                              src={gobbleBadgeUrl}
                              alt="G"
                              className="block h-3 w-auto flex-none"
                              style={{ imageRendering: "auto" }}
                            />
                          ) : (
                            <span className="text-amber-500 dark:text-amber-300 font-extrabold">
                              G
                            </span>
                          )
                        ) : null}
                      </div>
                      {showWordScores && Number.isFinite(entry?.pts) ? (
                        <div className="text-[11px] opacity-70">+{entry.pts} pts</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={`inline-flex items-center justify-center rounded-full border px-2 py-1 text-[11px] ${
                        darkMode
                          ? "bg-slate-800 border-slate-600 text-slate-100"
                          : "bg-white border-gray-300 text-gray-700"
                      }`}
                      onClick={() => onOpenDefinition?.(entry.word)}
                      aria-label={`Voir la definition de ${entry.word}`}
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
                  </div>
                ))}
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
