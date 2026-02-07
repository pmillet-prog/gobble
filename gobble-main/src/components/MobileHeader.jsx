import React from "react";

export default function MobileHeader({
  activeRoom,
  countdownLines,
  darkMode,
  gridSize,
  headerRef,
  isMuted,
  isTargetRound,
  phase,
  roundStatsText,
  roomLabelSeparator = " ",
  showRoundStats = false,
  setDarkMode,
  setIsMuted,
  setShowHelp,
  showHelpButton = false,
  tournament,
}) {
  const headerStyle = {
    position: "sticky",
    top: "env(safe-area-inset-top)",
    zIndex: 30,
  };
  return (
    <div
      ref={headerRef}
      className="px-3 pt-2 pb-1 border-b border-slate-200/70 dark:border-slate-700/70"
      style={headerStyle}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <div className="text-lg font-extrabold tracking-tight leading-none">GOBBLE</div>
          <div className="text-[0.7rem] text-slate-500 dark:text-slate-400 leading-tight">
            {tournament?.round && tournament?.totalRounds ? (
              <>
                {tournament.round === tournament.totalRounds ? (
                  <>Manche finale</>
                ) : (
                  <>
                    Manche {tournament.round}/{tournament.totalRounds}
                  </>
                )}
              </>
            ) : (
              <>
                {activeRoom?.label || "Salon"}{roomLabelSeparator}{gridSize}x{gridSize}
              </>
            )}
          </div>
          {phase === "playing" && showRoundStats && roundStatsText && !isTargetRound && (
            <div className="text-[0.65rem] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
              {roundStatsText}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right leading-tight text-xs font-bold">
            {countdownLines.map((line, idx) => (
              <span
                key={`${line}-${idx}`}
                className={`block ${
                  /^\d+$/.test(line)
                    ? "text-xl font-black leading-none"
                    : String(line).startsWith("MANCHE SPECIALE")
                    ? "text-[0.65rem] font-extrabold tracking-widest text-orange-600 dark:text-orange-300"
                    : ""
                }`}
              >
                {line}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMuted((v) => !v)}
              className="px-2 py-1 rounded-lg border text-[10px] bg-slate-100 border-slate-300 text-slate-700 flex items-center justify-center dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
              type="button"
            >
              {isMuted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M11 5L6 9H3v6h3l5 4z" />
                  <line x1="14" y1="9" x2="20" y2="15" />
                  <line x1="20" y1="9" x2="14" y2="15" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M11 5L6 9H3v6h3l5 4z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                </svg>
              )}
              <span className="sr-only">{isMuted ? "Son coupé" : "Son actif"}</span>
            </button>
            <button
              onClick={() => setDarkMode((v) => !v)}
              className="px-2 py-1 rounded-lg border text-[10px] bg-slate-100 border-slate-300 text-slate-700 flex items-center justify-center dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
              type="button"
            >
              {darkMode ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" />
                  <path d="M12 20v2" />
                  <path d="m4.93 4.93 1.41 1.41" />
                  <path d="m17.66 17.66 1.41 1.41" />
                  <path d="M2 12h2" />
                  <path d="M20 12h2" />
                  <path d="m6.34 17.66-1.41 1.41" />
                  <path d="m19.07 4.93-1.41 1.41" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                </svg>
              )}
              <span className="sr-only">{darkMode ? "Mode clair" : "Mode sombre"}</span>
            </button>
            {showHelpButton && (
              <button
                onClick={() => setShowHelp((v) => !v)}
                className="px-2 py-1 rounded-lg border text-[10px] bg-slate-100 border-slate-300 text-slate-700 flex items-center justify-center dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
                type="button"
              >
                ?
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

