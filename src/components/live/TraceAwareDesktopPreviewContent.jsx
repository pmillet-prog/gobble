import React from "react";

import AutoScaleInline from "../AutoScaleInline.jsx";
import { useTraceSnapshot } from "../../features/trace/TraceRuntime.jsx";
import {
  LivePreviewProgressStats,
  useGameStatusText,
} from "../../features/progress/GameProgressSatellites.jsx";

const READY_LABEL = "Prêt à jouer";

export default function TraceAwareDesktopPreviewContent({
  board = [],
  countdownLines = [],
  getTraceCellLabel = null,
  phase = "",
  previewTileStyle = undefined,
  showPreviewStats = false,
  totalScoreLabel = "?",
  totalWordsLabel = "?",
}) {
  const statusText = useGameStatusText();
  const traceSnapshot = useTraceSnapshot();
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

  if (statusText) {
    return (
      <span className="text-gray-700 dark:text-slate-200">
        {statusText.toUpperCase()}
      </span>
    );
  }

  if (showPreviewStats) {
    return (
      <div className="text-gray-700 dark:text-slate-200 text-sm leading-tight font-semibold">
        <LivePreviewProgressStats
          totalScoreLabel={totalScoreLabel}
          totalWordsLabel={totalWordsLabel}
        />
      </div>
    );
  }

  return <span className="text-gray-700 dark:text-slate-200">{READY_LABEL}</span>;
}
