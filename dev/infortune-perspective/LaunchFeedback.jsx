import React from "react";
import { LaunchMeters } from "./LaunchMeters.jsx";

const FEEDBACK_MS = 1600;

// Only phase changes enter React. The gauge itself is updated by the wheel's
// animation frame, and keeps the exact released power while this card stays up.
export function LaunchFeedback({ view, gauges, bonusCaption = "À LA CAGNOTTE" }) {
  const { phase, launchGame: game, launchQuality: quality } = view;
  const [expired, setExpired] = React.useState(null);
  React.useEffect(() => {
    if (!quality) return;
    const timeout = setTimeout(() => setExpired(quality), FEEDBACK_MS);
    return () => clearTimeout(timeout);
  }, [quality]);
  const active = phase === "dragging" || phase === "aiming";
  if (!game || active && game.skill || game.skillResult?.mode === "trace" || (!active && (!quality || expired === quality))) return null;
  const celebration = !active && ["good", "perfect"].includes(quality?.kind);
  return <div className="launch-feedback" data-quality={active ? undefined : quality.kind} data-skill-replay={!active && Boolean(game.skillResult)}
    data-complete={!active} style={{ "--feedback-duration": `${FEEDBACK_MS}ms` }}>
    {celebration && <div className="launch-feedback__sparks" aria-hidden="true">
      {Array.from({ length: 10 }, (_, index) => <i key={index} style={{ "--spark-angle": `${index * 36}deg`, "--spark-delay": `${index % 3 * 80}ms` }} />)}
    </div>}
    <LaunchMeters game={game} gauges={gauges} slot="hud" />
    {!active && <div className="launch-feedback__result" role="status" aria-live="polite">
      {celebration && <span className="launch-feedback__star" aria-hidden="true">✦</span>}
      <strong>{quality.label}</strong>
      {quality.detail && <p className="launch-feedback__detail">{quality.detail}</p>}
      <span className="launch-feedback__bonus">{quality.bonus ? `+${quality.bonus}` : "0"}</span>
      <span>{quality.bonus ? bonusCaption : "BONUS DE LANCER"}</span>
    </div>}
  </div>;
}
