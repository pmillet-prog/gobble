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
  onToggleSound,
  onToggleDarkMode,
  playingSeconds = null,
  playerTeam = null,
  phase,
  roundStatsText,
  roomLabelSeparator = " ",
  soundEnabled = true,
  showThemeToggle = true,
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
  const teamHeaderClass =
    playerTeam === "red"
      ? darkMode
        ? "bg-red-900 border-red-700"
        : "bg-red-200 border-red-300"
      : playerTeam === "blue"
      ? darkMode
        ? "bg-blue-900 border-blue-700"
        : "bg-blue-200 border-blue-300"
      : "border-slate-200/70 dark:border-slate-700/70";
  const metaTextClass = playerTeam
    ? darkMode
      ? "text-slate-200"
      : "text-slate-700"
    : "text-slate-500 dark:text-slate-400";
  const hasPlayingCountdown = phase === "playing" && Number.isFinite(playingSeconds);
  return (
    <div
      ref={headerRef}
      className={`relative px-3 pt-2 pb-1 border-b ${teamHeaderClass}`}
      style={headerStyle}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <div className="text-lg font-extrabold tracking-tight leading-none">GOBBLE</div>
          <div className={`text-[0.7rem] leading-tight ${metaTextClass}`}>
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
          {phase === "playing" &&
            showRoundStats &&
            roundStatsText &&
            !isTargetRound && (
            <div className={`text-[0.65rem] leading-tight mt-0.5 ${metaTextClass}`}>
              {roundStatsText}
            </div>
            )}
        </div>
        <div className="flex items-center gap-2">
          {!hasPlayingCountdown ? (
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
          ) : null}
          <div className="flex items-center gap-1 relative z-[2]">
            {showThemeToggle && (
              <button
                onClick={() => onToggleDarkMode?.()}
                className="px-2 py-1 rounded-lg border text-[10px] bg-slate-100 border-slate-300 text-slate-700 flex items-center justify-center dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
                type="button"
                title={darkMode ? "Passer en mode clair" : "Passer en mode sombre"}
                aria-label={darkMode ? "Passer en mode clair" : "Passer en mode sombre"}
              >
                <span className="material-icons-outlined text-[16px] leading-none" aria-hidden="true">
                  {darkMode ? "light_mode" : "dark_mode"}
                </span>
              </button>
            )}
            <button
              onClick={(e) => onToggleSound?.(e)}
              className="px-2 py-1 rounded-lg border text-[10px] bg-slate-100 border-slate-300 text-slate-700 flex items-center justify-center dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
              type="button"
              title={soundEnabled ? "Couper le son" : "Activer le son"}
              aria-label={soundEnabled ? "Couper le son" : "Activer le son"}
            >
              <span className="material-icons-outlined text-[16px] leading-none" aria-hidden="true">
                {soundEnabled ? "volume_up" : "volume_off"}
              </span>
            </button>
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
      {hasPlayingCountdown ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="block text-[clamp(44px,13vw,68px)] font-black tracking-tight tabular-nums leading-none">
            {Math.max(0, Math.round(Number(playingSeconds) || 0))}
          </span>
        </div>
      ) : null}
    </div>
  );
}
