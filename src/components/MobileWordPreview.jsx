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
        className={`w-full text-center font-bold text-base flex items-center justify-center ${
          shake ? "shake" : ""
        }`}
      >
        {phase !== "playing" ? (
          <span className="text-slate-700 dark:text-white">
            {countdownLines.map((line, idx) => (
              <span
                key={`${line}-${idx}`}
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
