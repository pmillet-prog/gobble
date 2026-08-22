import React from "react";

import {
  getTraceStateSnapshot,
  subscribeTraceState,
} from "./traceStateStore.js";
import { formatNumber } from "../utils/numbers.js";
import {
  useGameProgressFields,
  useGameStatusText,
} from "../features/progress/GameProgressSatellites.jsx";

const READY_LABEL = "Pr\u00eat \u00e0 jouer";
const PREVIEW_PROGRESS_FIELDS = Object.freeze(["foundWordsCount", "score"]);

function MobileWordPreview({
  countdownLines,
  darkMode,
  getTraceCellLabel = null,
  liveWord,
  liveWordTiles = [],
  onRotateGrid,
  phase,
  previewBlockHeight,
  previewGapPx,
  previewTileBaseStyle,
  previewStats,
  traceBoard = [],
  shake,
}) {
  const { foundWordsCount, score } = useGameProgressFields(
    PREVIEW_PROGRESS_FIELDS
  );
  const statusText = useGameStatusText();
  const traceSnapshot = React.useSyncExternalStore(
    subscribeTraceState,
    getTraceStateSnapshot,
    getTraceStateSnapshot
  );
  const previewHeight = Number.isFinite(previewBlockHeight)
    ? previewBlockHeight
    : 52;
  const baseFontPx = Math.min(
    16,
    Math.max(11, Math.round(previewHeight * 0.35))
  );
  const bigFontPx = Math.min(
    24,
    Math.max(16, Math.round(previewHeight * 0.58))
  );
  const smallFontPx = Math.min(
    12,
    Math.max(9, Math.round(previewHeight * 0.26))
  );
  const traceChunks =
    phase === "playing"
      ? Array.isArray(traceSnapshot.highlightPath) && traceSnapshot.highlightPath.length
        ? traceSnapshot.highlightPath
            .map((idx) => {
              const cell = Array.isArray(traceBoard) ? traceBoard[idx] : null;
              return typeof getTraceCellLabel === "function"
                ? getTraceCellLabel(cell)
                : String(cell?.letter || "");
            })
            .filter((chunk) => String(chunk || "").trim())
        : Array.isArray(traceSnapshot.currentTiles)
        ? traceSnapshot.currentTiles
        : []
      : [];
  const previewChunks =
    traceChunks.length
      ? traceChunks
      : Array.isArray(liveWordTiles) && liveWordTiles.length
      ? liveWordTiles
      : liveWord
      ? liveWord.split("")
      : [];
  const previewScale = previewChunks.length
    ? Math.min(1, Math.max(0.6, 11 / Math.max(1, previewChunks.join("").length)))
    : 1;
  const canRotate = typeof onRotateGrid === "function";
  const showStats = Boolean(previewStats?.show);
  return (
    <div
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-2.5 py-1.5 shadow-sm flex-none box-border"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: `${previewBlockHeight}px`,
        height: `${previewBlockHeight}px`,
      }}
    >
      <div className="w-8 shrink-0" />
      <div
        className={`flex-1 min-w-0 overflow-visible text-center font-bold flex items-center justify-center ${
          shake ? "shake" : ""
        }`}
        style={{ fontSize: `${baseFontPx}px`, lineHeight: 1.1 }}
      >
        {phase !== "playing" ? (
          <span className="text-slate-700 dark:text-white">
            {countdownLines.map((line, idx) => (
              <span
                key={`${line}-${idx}`}
                className={`block ${
                  /^\d+$/.test(line)
                    ? "font-black leading-none"
                    : String(line).startsWith("MANCHE SPECIALE")
                    ? "font-extrabold tracking-widest text-orange-600 dark:text-orange-300"
                    : ""
                }`}
                style={
                  /^\d+$/.test(line)
                    ? { fontSize: `${bigFontPx}px` }
                    : String(line).startsWith("MANCHE SPECIALE")
                    ? { fontSize: `${smallFontPx}px` }
                    : undefined
                }
              >
                {line}
              </span>
            ))}
          </span>
        ) : previewChunks.length ? (
          <div
            className="flex justify-center items-center max-w-full overflow-visible"
            style={{
              gap: `${previewGapPx}px`,
              transform: `scale(${previewScale})`,
              transformOrigin: "center",
            }}
          >
            {previewChunks.map((ch, idx) => {
              const angle = ((idx * 17 + previewChunks.length * 13) % 11) - 5;
              return (
                <div
                  key={idx}
                  className="preview-tile"
                  style={{ ...previewTileBaseStyle, transform: `rotate(${angle}deg)` }}
                >
                  {ch}
                </div>
              );
            })}
          </div>
        ) : statusText ? (
          <span className="text-slate-700 dark:text-slate-200">
            {statusText.toUpperCase()}
          </span>
        ) : showStats ? (
          <div
            className="text-slate-700 dark:text-slate-200 font-semibold"
            style={{ fontSize: `${smallFontPx}px`, lineHeight: 1.1 }}
          >
            <div>{`mots : ${formatNumber(foundWordsCount) ?? "0"} / ${previewStats.totalWordsLabel}`}</div>
            <div>{`score : ${formatNumber(score) ?? "0"} / ${previewStats.totalScoreLabel}`}</div>
          </div>
        ) : (
          <span className="text-slate-700 dark:text-slate-200">
            {READY_LABEL}
          </span>
        )}
      </div>
      {canRotate ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRotateGrid();
          }}
          className="w-8 h-8 shrink-0 rounded-lg border border-slate-200 bg-white/80 text-slate-700 shadow-sm transition hover:bg-white flex items-center justify-center dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-800/80"
          title="Rotation 90 deg"
        >
          <span
            className="material-icons-outlined text-[16px] leading-none"
            aria-hidden="true"
          >
            autorenew
          </span>
          <span className="sr-only">Rotation 90 deg</span>
        </button>
      ) : (
        <div className="w-8 shrink-0" />
      )}
    </div>
  );
}

export default React.memo(MobileWordPreview);
