import React from "react";
import { getTrophyCountLabel, getTrophyMetal, getTrophyRewardName } from "./trophyPresentation.js";
import TrophyArt from "./TrophyArt.jsx";
import "./trophyMetalLighting.css";
import "./trophySpotlight.css";

const SPARKLES = Object.freeze(Array.from({ length: 32 }, (_, index) => {
  const angle = index * 2.3999632297;
  const radius = 31 + (index % 5) * 3.6;
  return {
    left: `${50 + Math.cos(angle) * radius}%`,
    top: `${50 + Math.sin(angle) * radius * .91}%`,
    "--spark-size": `${2 + index % 5}px`,
    "--spark-drift-x": `${Math.cos(angle) * (5 + index % 4)}px`,
    "--spark-drift-y": `${Math.sin(angle) * (5 + index % 4) - 3}px`,
    "--spark-duration": `${1.65 + index % 7 * .23}s`,
    "--spark-delay": `${-index * .31}s`,
  };
}));

export default function TrophySpotlight({ trophy, count = 0, metal, onClose, returnFocusRef, children }) {
  const closeButton = React.useRef(null);
  const close = React.useRef(onClose);
  close.current = onClose;
  const titleId = React.useId();
  const statusId = React.useId();
  const open = Boolean(trophy);
  const obtained = Math.max(0, Math.trunc(Number(count) || 0));

  React.useEffect(() => {
    if (!open) return undefined;
    const returnTarget = returnFocusRef?.current;
    closeButton.current?.focus({ preventScroll: true });
    // The profile listens on document capture; this inline detail owns Escape first.
    const keydown = event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close.current?.();
    };
    window.addEventListener("keydown", keydown, true);
    return () => {
      window.removeEventListener("keydown", keydown, true);
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    };
  }, [open, returnFocusRef]);

  if (!trophy) return null;
  const fallbackMetal = getTrophyMetal(trophy);
  const displayedMetal = ["bronze", "silver", "gold"].includes(metal) ? metal : fallbackMetal;
  return <div className="trophy-spotlight trophy-metal-lighting" data-trophy-metal={displayedMetal}
    role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={statusId}
    onClick={event => { if (event.target === event.currentTarget) close.current?.(); }}>
    <button ref={closeButton} type="button" className="trophy-spotlight-close" aria-label="Fermer le trophée agrandi"
      onClick={event => { event.stopPropagation(); close.current?.(); }}>×</button>
    <div className="trophy-spotlight-figure">
      <div className="trophy-spotlight-halo" aria-hidden="true">
        {SPARKLES.map((style, index) => <i key={index} className={`trophy-spotlight-spark${index % 4 === 0 ? " is-star" : ""}`} style={style} />)}
      </div>
      <TrophyArt trophy={trophy} large locked={!obtained} className="trophy-spotlight-image" loading="eager" />
    </div>
    <div className="trophy-spotlight-caption">
      <h3 id={titleId}>{getTrophyRewardName(trophy)}</h3>
      <p id={statusId}>{getTrophyCountLabel(trophy, obtained)}</p>
      {children}
    </div>
  </div>;
}
