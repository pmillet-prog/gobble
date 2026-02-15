import React from "react";

export default function DuelWeeklyWidget({
  darkMode = false,
  redScore = 0,
  blueScore = 0,
  onClick = null,
  className = "",
  showHint = false,
  playerTeam = null,
}) {
  const interactive = typeof onClick === "function";
  const Component = interactive ? "button" : "div";
  const isRed = playerTeam === "red";
  const isBlue = playerTeam === "blue";
  const borderClass = isRed
    ? darkMode
      ? "border-red-500/70"
      : "border-red-400"
    : isBlue
    ? darkMode
      ? "border-blue-500/70"
      : "border-blue-400"
    : darkMode
    ? "border-white/10"
    : "border-slate-200";
  const hoverClass = interactive
    ? isRed
      ? "hover:border-red-400/90 hover:shadow-md active:scale-[0.995] transition"
      : isBlue
      ? "hover:border-blue-400/90 hover:shadow-md active:scale-[0.995] transition"
      : "hover:border-blue-400/70 hover:shadow-md active:scale-[0.995] transition"
    : "";
  const hintColorClass = isRed
    ? "text-red-500"
    : isBlue
    ? "text-blue-500"
    : "opacity-75";

  return (
    <Component
      type={interactive ? "button" : undefined}
      onClick={interactive ? onClick : undefined}
      className={`w-full rounded-xl border px-3 py-3 text-left ${
        darkMode
          ? "bg-slate-900/50 text-slate-100"
          : "bg-white text-slate-800"
      } ${borderClass} ${hoverClass} ${className}`}
    >
      <div className="text-center text-3xl sm:text-4xl font-black tabular-nums leading-none">
        <span className="text-red-500">🔴 {redScore}</span>{" "}
        <span className="opacity-55 text-xl sm:text-2xl align-middle">VS</span>{" "}
        <span className="text-blue-500">{blueScore} 🔵</span>
      </div>
      {showHint ? (
        <div className={`mt-2 text-center text-xs font-semibold ${hintColorClass}`}>Voir détails</div>
      ) : null}
    </Component>
  );
}
