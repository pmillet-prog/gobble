import React from "react";

import AutoScaleInline from "../AutoScaleInline.jsx";
import {
  getTraceStateSnapshot,
  subscribeTraceState,
} from "../traceStateStore.js";

const READY_LABEL = "Prêt à jouer";

export default function TraceAwareDesktopPreviewContent({
  board = [],
  countdownLines = [],
  currentDisplay = "",
  getTraceCellLabel = null,
  phase = "",
  previewTileStyle = undefined,
  scoreLabel = "0",
  showPreviewStats = false,
  showPreviewStatus = false,
  totalScoreLabel = "?",
  totalWordsLabel = "?",
  wordsFoundLabel = "0",
}) {
  const traceSnapshot = React.useSyncExternalStore(
    subscribeTraceState,
    getTraceStateSnapshot,
    getTraceStateSnapshot
  );
  const traceChunks =
    phase === "playing"
      ? Array.isArray(traceSnapshot.highlightPath) && traceSnapshot.highlightPath.length
        ? traceSnapshot.highlightPath
            .map((index) => {
              const cell = Array.isArray(board) ? board[index] : null;
              return typeof getTraceCellLabel === "function"
                ? getTraceCellLabel(cell)
                : String(cell?.letter || "");
            })
            .filter((chunk) => String(chunk || "").trim())
        : Array.isArray(traceSnapshot.currentTiles)
        ? traceSnapshot.currentTiles
        : []
      : [];

  if (phase !== "playing") {
    return (
      <span className="text-gray-800 dark:text-white">
        {countdownLines.map((line, index) => (
          <span
            key={`${line}-${index}`}
            className={`block ${
              /^\d+$/.test(line)
                ? "text-2xl font-black leading-none"
                : String(line).startsWith("MANCHE SPECIALE")
                ? "text-[0.7rem] font-extrabold tracking-widest text-orange-600 dark:text-orange-300"
                : ""
            }`}
          >
            {line}
          </span>
        ))}
      </span>
    );
  }

  if (traceChunks.length) {
    return (
      <AutoScaleInline
        minScale={0.42}
        estimatedContentWidth={
          traceChunks.length * 32 + Math.max(0, traceChunks.length - 1) * 4
        }
        measurePaddingPx={8}
        reserveScaledWidth
        className="gap-1 py-1"
      >
        {traceChunks.map((chunk, index) => {
          const angle = ((index * 17 + traceChunks.length * 13) % 11) - 5;
          return (
            <div
              key={index}
              className="preview-tile"
              style={{ ...previewTileStyle, transform: `rotate(${angle}deg)` }}
            >
              {chunk}
            </div>
          );
        })}
      </AutoScaleInline>
    );
  }

  if (showPreviewStatus) {
    return (
      <span className="text-gray-700 dark:text-slate-200">
        {currentDisplay.toUpperCase()}
      </span>
    );
  }

  if (showPreviewStats) {
    return (
      <div className="text-gray-700 dark:text-slate-200 text-sm leading-tight font-semibold">
        <div>{`mots : ${wordsFoundLabel} / ${totalWordsLabel}`}</div>
        <div>{`score : ${scoreLabel} / ${totalScoreLabel}`}</div>
      </div>
    );
  }

  return <span className="text-gray-700 dark:text-slate-200">{READY_LABEL}</span>;
}
