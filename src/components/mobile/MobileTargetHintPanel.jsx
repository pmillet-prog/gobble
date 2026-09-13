import React from "react";
import AutoScaleInline from "../AutoScaleInline.jsx";
import TargetHintPattern from "../TargetHintPattern.jsx";
import "./mobileTargetHint.css";

function MobileTargetHintPanel({
  darkMode = false,
  formatNumber = String,
  height = 100,
  nextHintLabel = "",
  onOpenDefinition,
  panelRef,
  shouldDefinitionBlink = false,
  showSolvedTargetLoupe = false,
  solvedTargetWord = "",
  specialHint,
  specialHintDisplay = "",
  targetScoreMax = 0,
  type,
}) {
  const solved = Boolean(String(solvedTargetWord).trim());
  const hintLabel = nextHintLabel.replace(/^Nouvel indice dans\s*:\s*/, "Indice dans ");
  return (
    <section
      ref={panelRef}
      aria-label="Mot cible et indices"
      className="mobile-target-hint rounded-xl border border-slate-200 bg-white/90 shadow-sm dark:border-slate-700 dark:bg-slate-900/90"
      style={{ height: `${height}px` }}
    >
      <div className="mobile-target-hint-content">
        <div className="mobile-target-hint-title text-amber-500 dark:text-amber-300">
          {type === "target_score" ? "TROUVE LE MEILLEUR MOT" : "TROUVE LE PLUS LONG MOT"}
        </div>
        <div className="mobile-target-hint-word">
          <div className="min-w-0 flex-1">
            <AutoScaleInline minScale={0.35}>
              {specialHintDisplay ? (
                <TargetHintPattern
                  className={solved ? "tracking-normal" : "tracking-wider"}
                  display={specialHintDisplay}
                  revealedWordIndices={specialHint?.wordIndices}
                  solved={solved}
                  wordLength={specialHint?.length}
                />
              ) : <span className="text-sm tracking-normal opacity-80">MOT MYSTÈRE</span>}
            </AutoScaleInline>
          </div>
          {showSolvedTargetLoupe ? (
            <button
              type="button"
              className={`mobile-target-hint-definition rounded-full border ${darkMode ? "bg-slate-800 border-slate-600 text-slate-100" : "bg-white border-gray-300 text-gray-700"} ${shouldDefinitionBlink ? "animate-pulse" : ""}`}
              onClick={(event) => { event.stopPropagation(); onOpenDefinition?.(solvedTargetWord); }}
              aria-label="Voir la définition"
              title="Voir la définition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <line x1="16.65" y1="16.65" x2="21" y2="21" />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="mobile-target-hint-meta">
          <span>
            {specialHint?.length ? `${specialHint.length} lettres` : ""}
            {type === "target_score" ? `${specialHint?.length ? " · " : ""}${Number.isFinite(targetScoreMax) && targetScoreMax > 0 ? formatNumber(targetScoreMax) : "--"} pts` : ""}
          </span>
          <span>{solved ? "Mot trouvé !" : hintLabel}</span>
        </div>
      </div>
    </section>
  );
}

export default React.memo(MobileTargetHintPanel);
