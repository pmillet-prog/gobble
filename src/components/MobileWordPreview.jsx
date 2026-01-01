import React from "react";

export default function MobileWordPreview({
  countdownLines,
  currentDisplay,
  darkMode,
  liveWord,
  phase,
  previewBlockHeight,
  previewGapPx,
  previewTileBaseStyle,
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
  return (
    <div
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-2.5 py-1.5 shadow-sm flex-none box-border"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: `${previewBlockHeight}px`,
        height: `${previewBlockHeight}px`,
      }}
    >
      <div
        className={`w-full text-center font-bold flex items-center justify-center ${
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
          <div className="flex justify-center items-center" style={{ gap: `${previewGapPx}px` }}>
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
        ) : (
          <span className="text-slate-700 dark:text-slate-200">
            {(currentDisplay || "Prêt à jouer").toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}
