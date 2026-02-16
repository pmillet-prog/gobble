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
  const scoreViewportRef = React.useRef(null);
  const scoreLineRef = React.useRef(null);
  const [scoreScale, setScoreScale] = React.useState(1);

  React.useLayoutEffect(() => {
    const viewportEl = scoreViewportRef.current;
    const lineEl = scoreLineRef.current;
    if (!viewportEl || !lineEl) return undefined;

    const recomputeScale = () => {
      const viewportWidth = viewportEl.clientWidth || 0;
      const lineWidth = lineEl.scrollWidth || 0;
      if (viewportWidth <= 0 || lineWidth <= 0) {
        setScoreScale(1);
        return;
      }
      const ratio = viewportWidth / lineWidth;
      const next = Number.isFinite(ratio) ? Math.max(0.65, Math.min(1, ratio)) : 1;
      setScoreScale((prev) => (Math.abs(prev - next) > 0.01 ? next : prev));
    };

    recomputeScale();

    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(recomputeScale);
      observer.observe(viewportEl);
      observer.observe(lineEl);
    } else if (typeof window !== "undefined") {
      window.addEventListener("resize", recomputeScale);
    }

    return () => {
      if (observer) observer.disconnect();
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", recomputeScale);
      }
    };
  }, [redScore, blueScore]);

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
      <div ref={scoreViewportRef} className="w-full overflow-hidden flex justify-center">
        <div
          ref={scoreLineRef}
          className="inline-flex items-baseline justify-center gap-2 whitespace-nowrap text-3xl sm:text-4xl font-black tabular-nums leading-none"
          style={{
            transform: `scale(${scoreScale})`,
            transformOrigin: "center top",
          }}
        >
          <span className="text-red-500">🔴 {redScore}</span>
          <span className="opacity-55 text-xl sm:text-2xl align-middle">VS</span>
          <span className="text-blue-500">{blueScore} 🔵</span>
        </div>
      </div>
      {showHint ? (
        <div className={`mt-2 text-center text-xs font-semibold ${hintColorClass}`}>Voir détails</div>
      ) : null}
    </Component>
  );
}
