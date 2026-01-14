import React from "react";

const READY_LABEL = "Pr\u00eat \u00e0 jouer";

export default function MobileWordPreview({
  countdownLines,
  currentDisplay,
  darkMode,
  liveWord,
  onRotateGrid,
  phase,
  previewBlockHeight,
  previewGapPx,
  previewTileBaseStyle,
  previewStats,
  shake,
}) {
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
  const previewScale = liveWord
    ? Math.min(1, Math.max(0.6, 11 / Math.max(1, liveWord.length)))
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
        className={`flex-1 min-w-0 overflow-hidden text-center font-bold flex items-center justify-center ${
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
        ) : liveWord ? (
          <div
            className="flex justify-center items-center max-w-full overflow-hidden"
            style={{
              gap: `${previewGapPx}px`,
              transform: `scale(${previewScale})`,
              transformOrigin: "center",
            }}
          >
            {liveWord.split("").map((ch, idx) => {
              const angle = ((idx * 17 + liveWord.length * 13) % 11) - 5;
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
        ) : currentDisplay ? (
          <span className="text-slate-700 dark:text-slate-200">
            {currentDisplay.toUpperCase()}
          </span>
        ) : showStats ? (
          <div
            className="text-slate-700 dark:text-slate-200 font-semibold"
            style={{ fontSize: `${smallFontPx}px`, lineHeight: 1.1 }}
          >
            <div>{`mots : ${previewStats.wordsFoundLabel} / ${previewStats.totalWordsLabel}`}</div>
            <div>{`score : ${previewStats.scoreLabel} / ${previewStats.totalScoreLabel}`}</div>
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
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: "translate(-1px, 1px)" }}
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1 2.13-9.36L23 10" />
          </svg>
          <span className="sr-only">Rotation 90 deg</span>
        </button>
      ) : (
        <div className="w-8 shrink-0" />
      )}
    </div>
  );
}
