import React from "react";

function getRemainingSeconds(targetTs, nowTs) {
  const target = Number(targetTs) || 0;
  if (!target) return 0;
  return Math.max(0, Math.ceil((target - nowTs) / 1000));
}

export default function MiniTournamentStartOverlay({ lobby = null }) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (lobby?.phase !== "countdown" && lobby?.phase !== "intro") return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [lobby?.phase, lobby?.countdownEndsAt, lobby?.introEndsAt]);

  const phase = lobby?.phase || "";
  const countdownLeft = getRemainingSeconds(lobby?.countdownEndsAt, now);
  const introLeft = getRemainingSeconds(lobby?.introEndsAt, now);
  const showCountdown = phase === "countdown";
  const showIntro = phase === "intro" && introLeft > 0;
  const showPreparing = phase === "starting" || (phase === "intro" && introLeft <= 0);
  if (!showCountdown && !showIntro && !showPreparing) return null;

  return (
    <div className="fixed inset-0 z-[21000] flex items-center justify-center bg-slate-950/90 px-4 text-white backdrop-blur-sm transition-opacity duration-500">
      <style>
        {`@keyframes miniTournamentFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}
      </style>
      <div
        className="w-full max-w-lg text-center"
        style={{ animation: "miniTournamentFadeIn 420ms ease-out both" }}
      >
        {showCountdown ? (
          <>
            <div className="text-[96px] font-black leading-none tabular-nums sm:text-[128px]">
              {Math.max(1, countdownLeft)}
            </div>
            <div className="mt-4 text-sm font-bold uppercase tracking-[0.35em] text-orange-200">
              Mini-tournoi
            </div>
          </>
        ) : showIntro ? (
          <>
            <div className="text-3xl font-black uppercase tracking-[0.16em] sm:text-5xl">
              Debut de mini TOURNOI
            </div>
            <div className="mx-auto mt-5 max-w-md text-sm font-semibold leading-relaxed text-slate-200">
              5 manches. Les meilleurs scores gagnent des points, la derniere manche compte double.
              Les gobbles departagent et peuvent faire basculer le classement.
            </div>
          </>
        ) : (
          <>
            <div className="text-3xl font-black uppercase tracking-[0.16em] sm:text-5xl">
              Preparation de la grille
            </div>
            <div className="mx-auto mt-6 h-10 w-10 animate-spin rounded-full border-4 border-white/25 border-t-orange-300" />
          </>
        )}
      </div>
    </div>
  );
}
