import React from "react";

export default function MobileHeader({
  activeRoom,
  countdownLines,
  darkMode,
  gridSize,
  headerRef,
  isFinaleBanner = false,
  isTargetRound,
  onOpenSettings,
  phase,
  roundStatsText,
  roomLabelSeparator = " ",
  showRoundStats = false,
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
                {isFinaleBanner || tournament.round === tournament.totalRounds ? (
                  <>Manche finale</>
                ) : (
                  <>
                    Manche {tournament.round}/{tournament.totalRounds}
                  </>
                )}
              </>
            ) : isFinaleBanner ? (
              <>Manche finale</>
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
              onClick={() => onOpenSettings?.()}
              className="px-2 py-1 rounded-lg border text-[10px] bg-slate-100 border-slate-300 text-slate-700 flex items-center justify-center dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
              type="button"
            >
              <span className="material-icons-outlined text-[16px] leading-none" aria-hidden="true">
                settings
              </span>
              <span className="sr-only">Parametres</span>
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
