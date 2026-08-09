import React from "react";
import useDeadlineCountdown from "../../hooks/useDeadlineCountdown.js";

const styles = `
@keyframes miniTournamentBannerIn {
  from { opacity: 0; transform: translate(-50%, -10px) scale(0.97); }
  to { opacity: 1; transform: translate(-50%, 0) scale(1); }
}
.mini-tournament-start-banner {
  position: fixed;
  z-index: 21000;
  left: 50%;
  top: 1%;
  width: 40%;
  height: clamp(92px, 11.75vw, 210px);
  pointer-events: none;
  animation: miniTournamentBannerIn 420ms ease-out both;
}
.mini-tournament-start-banner-card {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 2px solid rgba(253, 186, 116, 0.7);
  border-radius: 999px 999px 38% 38%;
  background:
    radial-gradient(circle at 50% 0%, rgba(251, 146, 60, 0.3), transparent 58%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(30, 18, 10, 0.93));
  color: white;
  text-align: center;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5), inset 0 0 28px rgba(251, 146, 60, 0.12);
  backdrop-filter: blur(6px);
}
.mini-tournament-start-kicker {
  color: #fed7aa;
  font-size: clamp(9px, 0.72vw, 13px);
  font-weight: 900;
  letter-spacing: 0.28em;
  line-height: 1;
  text-transform: uppercase;
}
.mini-tournament-start-title {
  margin-top: 0.34em;
  font-size: clamp(18px, 2.05vw, 38px);
  font-weight: 950;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}
.mini-tournament-start-count {
  display: inline-block;
  min-width: 1.2em;
  color: #fdba74;
  font-size: 1.55em;
  line-height: 0.7;
  vertical-align: -0.08em;
}
.mini-tournament-start-detail {
  margin-top: 0.65em;
  color: #e2e8f0;
  font-size: clamp(9px, 0.78vw, 14px);
  font-weight: 750;
  letter-spacing: 0.035em;
  line-height: 1.15;
}
@media (max-aspect-ratio: 1/1) {
  .mini-tournament-start-banner {
    top: calc(1% + env(safe-area-inset-top));
    width: 80%;
    height: clamp(78px, 23.5vw, 132px);
  }
  .mini-tournament-start-kicker {
    font-size: clamp(8px, 2.5vw, 11px);
  }
  .mini-tournament-start-title {
    font-size: clamp(15px, 5.2vw, 27px);
  }
  .mini-tournament-start-detail {
    margin-top: 0.45em;
    padding: 0 8%;
    font-size: clamp(8px, 2.45vw, 12px);
  }
}
`;

export default function MiniTournamentStartOverlay({
  lobby = null,
  preparing = false,
  serverNowMs = null,
}) {
  const phase = lobby?.phase || "";
  const activeDeadlineMs =
    phase === "countdown"
      ? lobby?.countdownEndsAt
      : phase === "intro"
      ? lobby?.introEndsAt
      : null;
  const remainingSeconds = useDeadlineCountdown({
    active: phase === "countdown" || phase === "intro",
    deadlineServerMs: activeDeadlineMs,
    serverNowMs,
  });
  const countdownLeft = phase === "countdown" ? remainingSeconds : 0;
  const introLeft = phase === "intro" ? remainingSeconds : 0;
  const showCountdown = phase === "countdown" && countdownLeft > 0;
  const showIntro = phase === "intro" && introLeft > 0;
  const showPreparing = !!preparing;
  if (!showCountdown && !showIntro && !showPreparing) return null;

  if (showPreparing) {
    return (
      <div className="fixed inset-0 z-[21000] flex items-center justify-center bg-slate-950/90 px-4 text-white backdrop-blur-sm transition-opacity duration-500">
        <style>
          {`@keyframes miniTournamentFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}
        </style>
        <div
          className="w-full max-w-lg text-center"
          style={{ animation: "miniTournamentFadeIn 420ms ease-out both" }}
        >
          <div className="text-3xl font-black uppercase tracking-[0.16em] sm:text-5xl">
            Préparation de la grille
          </div>
          <div className="mx-auto mt-6 h-10 w-10 animate-spin rounded-full border-4 border-white/25 border-t-orange-300" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="mini-tournament-start-banner"
      role="status"
      aria-live="polite"
      aria-label={
        showCountdown
          ? `Départ du mini-tournoi dans ${countdownLeft} secondes`
          : "Début du mini-tournoi"
      }
    >
      <style>{styles}</style>
      <div className="mini-tournament-start-banner-card">
        {showCountdown ? (
          <>
            <div className="mini-tournament-start-kicker">Mini-tournoi</div>
            <div className="mini-tournament-start-title">
              Départ dans <span className="mini-tournament-start-count tabular-nums">{countdownLeft}</span>
            </div>
          </>
        ) : (
          <>
            <div className="mini-tournament-start-kicker">C'est parti</div>
            <div className="mini-tournament-start-title">Début du mini-tournoi</div>
            <div className="mini-tournament-start-detail">
              5 manches · finale ×2 · les gobbles peuvent faire basculer le classement
            </div>
          </>
        )}
      </div>
    </div>
  );
}
