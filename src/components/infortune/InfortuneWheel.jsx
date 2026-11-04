import React from "react";
import { MAX_LAUNCH_SPEED, MIN_LAUNCH_SPEED } from "../../features/infortune/wheelConfig.js";
import { useInfortuneWheel } from "../../features/infortune/useInfortuneWheel.js";
import InfortuneWheelFace from "./InfortuneWheelFace.jsx";
import "./infortuneWheel.css";

export default function InfortuneWheel({ physics, onResult, onPhaseChange, children }) {
  const [muted, setMuted] = React.useState(false);
  const id = `infortune-${React.useId().replace(/:/g, "")}`;
  const wheel = useInfortuneWheel({ physics, muted, onResult, onPhaseChange });
  const { phase, message, result } = wheel.view;
  const busy = phase === "spinning" || phase === "dragging" || phase === "charging";
  const instruction = message || (phase === "spinning" ? "Les jeux sont faits…"
    : phase === "dragging" ? "Donnez de l’élan, puis lâchez !"
    : phase === "charging" ? "Relâchez après le repère pour lancer."
    : phase === "finished" ? "Le cliquet a le dernier mot."
    : "Attrapez le bord, faites glisser et lâchez.");
  return <div className="infortune" data-phase={phase}>
    <div className="infortune__stage">
      <div className="infortune__stage-caption"><span />LE SORT EST ENTRE VOS MAINS<span /></div>
      <InfortuneWheelFace surface={wheel.surface} rotor={wheel.rotor} pawl={wheel.pawl} id={id} />
      <div className="infortune__stage-footer"><span>24 secteurs</span><i /><span>Un seul verdict</span></div>
    </div>
    <aside className="infortune__console" aria-label="Lancer et résultat">
      <div className="infortune__console-top"><span className="infortune__eyebrow">VOTRE TOUR</span>
        <button className="infortune__sound" type="button" onClick={() => { wheel.setSoundFromGesture(muted); setMuted(!muted); }} aria-pressed={!muted} aria-label="Activer le son des taquets">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M 4 9 H 8 L 13 5 V 19 L 8 15 H 4 Z" />
            {muted ? <path d="m 17 9 5 6 m 0 -6 -5 6" /> : <><path d="M 16 8 Q 20 12 16 16" /><path d="M 19 5 Q 26 12 19 19" /></>}
          </svg>{muted ? "Son coupé" : "Son activé"}
        </button>
      </div>
      <div className="infortune__verdict" data-kind={result?.kind || "idle"} role="status" aria-live="polite" aria-atomic="true">
        <span className="infortune__result-label">{phase === "finished" ? "LA ROUE A PARLÉ" : phase === "spinning" ? "LA ROUE TOURNE" : "À VOUS DE JOUER"}</span>
        <strong className={`infortune__result${result?.kind && result.kind !== "amount" ? " infortune__result--word" : ""}`}>
          {result ? result.kind === "amount" ? <>{result.amount.toLocaleString("fr-FR")}<small>€</small></> : result.label : <span className="infortune__waiting-mark">✦</span>}
        </strong>
        <span className="infortune__result-note">{result?.kind === "pass" ? "Aucun gain pour ce secteur." : result?.kind === "bankrupt" ? "Aïe… la case noire !" : result?.kind === "bonus" ? "La case dorée vous sourit !" : result ? "C’est votre résultat pour ce lancer." : "Un bon geste. Un peu de suspense."}</span>
      </div>
      <p className="infortune__instruction" id={`${id}-instruction`} role="status">{instruction}</p>
      <div className="infortune__force" aria-hidden="true">
        <div className="infortune__force-track"><span ref={wheel.forceFill} /><i style={{ left: `${MIN_LAUNCH_SPEED / MAX_LAUNCH_SPEED * 100}%` }} /></div>
        <div className="infortune__force-labels"><span>Élan</span><span>Minimum au repère</span></div>
      </div>
      <button ref={wheel.chargeButton} type="button" className="infortune__launch" disabled={phase === "spinning" || phase === "finished" || phase === "dragging"} aria-describedby={`${id}-instruction ${id}-keyboard`}>
        {phase === "charging" ? "Relâchez pour lancer ↗" : phase === "spinning" ? "Suspense…" : "Maintenir pour lancer ↗"}
      </button>
      <p className="infortune__keyboard" id={`${id}-keyboard`}>Ou maintenez <kbd>Espace</kbd> sur ce bouton.</p>
      <button type="button" className="infortune__again" disabled={busy || !result} onClick={wheel.reset}>Un autre tour <span aria-hidden="true">↻</span></button>
      {children}
    </aside>
  </div>;
}
