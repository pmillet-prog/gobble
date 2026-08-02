import React from "react";
import GridPathOverlay from "./GridPathOverlay.jsx";

export default function TargetWaitPuzzleGrid({
  puzzle,
  revealAnswer = false,
  darkMode = false,
  wordLength = 0,
  feedbackCorrect = null,
}) {
  const grid = String(puzzle?.grid || "").padEnd(16, " ").slice(0, 16).split("");
  const blankIndex = Number(puzzle?.blankIndex);
  const solutionPath = new Set(Array.isArray(puzzle?.path) ? puzzle.path : []);

  return (
    <div
      className={`relative aspect-square w-full overflow-hidden rounded-[1.4rem] border-2 p-2 shadow-2xl ${
        darkMode
          ? "border-amber-300/55 bg-slate-950/65"
          : "border-amber-700/45 bg-amber-950/12"
      }`}
    >
      <div className="grid h-full w-full grid-cols-4 gap-2">
        {grid.map((rawLetter, index) => {
          const isBlank = index === blankIndex;
          const isPathTile = revealAnswer && solutionPath.has(index);
          const letter = isBlank && revealAnswer ? puzzle?.answer : rawLetter === "_" ? "" : rawLetter;
          const displayLetter = letter === "Q" ? "Qu" : letter;
          return (
            <div
              key={`${puzzle?.id || "puzzle"}-${index}`}
              className={`relative flex min-h-0 items-center justify-center rounded-[clamp(.55rem,1.4vw,1rem)] border text-[clamp(1.6rem,5.2vw,4.2rem)] font-black uppercase leading-none shadow-[inset_0_2px_1px_rgba(255,255,255,.72),0_4px_8px_rgba(15,23,42,.28)] transition-colors duration-150 ${
                isPathTile
                  ? "border-emerald-200 bg-gradient-to-br from-emerald-100 to-emerald-400 text-emerald-950"
                  : isBlank
                  ? darkMode
                    ? "border-dashed border-amber-200/70 bg-slate-900/85 text-amber-100"
                    : "border-dashed border-amber-800/55 bg-amber-50/70 text-amber-950"
                  : "border-amber-700/35 bg-gradient-to-br from-amber-50 via-amber-100 to-amber-300 text-slate-900"
              }`}
            >
              {displayLetter || <span className="h-3 w-3 rounded-full bg-amber-400/45" />}
              {isBlank && !revealAnswer ? (
                <span className="absolute inset-1 rounded-[inherit] border-2 border-dashed border-amber-400/45 animate-pulse" />
              ) : null}
            </div>
          );
        })}
      </div>
      <GridPathOverlay path={puzzle?.path} visible={revealAnswer} />
      <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
        <span className="inline-flex whitespace-nowrap rounded-full border border-amber-300/60 bg-slate-950/85 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-amber-200 shadow-lg">
          Mot de {wordLength || String(puzzle?.word || "").length} lettres
        </span>
      </div>
      {revealAnswer ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 flex justify-center">
          <div
            className={`rounded-2xl border px-5 py-2 text-center shadow-2xl backdrop-blur ${
              feedbackCorrect
                ? "border-emerald-200 bg-emerald-950/90 text-emerald-100"
                : "border-rose-200 bg-rose-950/90 text-rose-100"
            }`}
          >
            <div className="text-[9px] font-black uppercase tracking-[0.18em] opacity-75">
              Mot à trouver
            </div>
            <div className="text-xl font-black tracking-wide">{puzzle?.word || "?"}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
