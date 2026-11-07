import React from "react";
import { LaunchMeters } from "./LaunchMeters.jsx";
import { LaunchButton } from "../../src/components/infortune/LaunchButton.jsx";
import { GESTURE_MODES } from "../../src/features/infortune/wheelSkillShot.js";

export function LaunchControls({ wheel, gestureMode = "power", onGestureModeChange,
  bankLabel = "Cagnotte d’essai · bonus de lancer", bankValue, editableRewards = true }) {
  const { phase, message, result, launchGame: game, launchQuality: quality } = wheel.view;
  const ready = phase === "ready" && !wheel.renderError && !wheel.inputLocked;
  const title = phase === "finished" ? "Lancer terminé" : wheel.inputLocked ? "Le plateau se prépare…" : phase === "aiming" ? "Bloquer la puissance et lancer"
    : phase === "spinning" ? "La roue tourne…" : "Commencer le lancer au clic";
  return <section className="perspective-workshop__play launch-game" aria-label="Qualité du lancer">
    <div className="perspective-workshop__play-heading"><h2>Le lancer</h2>
      <button type="button" className="perspective-workshop__sound" onClick={wheel.toggleSound} aria-pressed={!wheel.muted}>Son {wheel.muted ? "coupé" : "activé"}</button></div>
    {onGestureModeChange && <label className="launch-game__mode">Mini-jeu au geste
      <select value={gestureMode} onChange={event => onGestureModeChange(event.target.value)} disabled={phase !== "ready" || Boolean(wheel.renderError)}>
        {Object.entries(GESTURE_MODES).map(([id, mode]) => <option key={id} value={id}>{mode.label}</option>)}
      </select>
    </label>}
    <LaunchMeters game={game} gauges={wheel.gauges} />
    <p className="launch-game__instructions">{GESTURE_MODES[gestureMode].instructions}</p>
    <p className="launch-game__legend">{gestureMode === "power" ? "Zone verte : beau lancer ; centre doré : lancer parfait."
      : "Cible verte : beau lancer ; centre doré : lancer parfait. Les repères apparaissent dès que vous attrapez la roue."}</p>
    {!wheel.gestureOnly && <p className="launch-game__instructions">{gestureMode === "power" ? "Au clic : démarrer la jauge, puis cliquer pour lancer."
      : "Pour tester cette variante, glissez directement sur la roue. Le bouton ci-dessous sert uniquement à la jauge au clic."}</p>}
    <LaunchButton className="perspective-workshop__launch" wheel={wheel}>{title}</LaunchButton>
    {!wheel.gestureOnly && <p className="perspective-workshop__keyboard">Clic, Espace ou Entrée. La cible reste fixe pendant l’essai.</p>}
    {phase === "aiming" && <button className="launch-game__cancel" type="button" onClick={wheel.cancelLaunch}>Annuler la préparation</button>}
    <div className="launch-game__quality" data-quality={quality?.kind} role="status" aria-live="polite">
      {quality ? <><strong>{quality.label}</strong><span>{quality.bonus ? `+${quality.bonus} à la cagnotte` : "Bonus de lancer : 0"}</span>
        {quality.detail && <span>{quality.detail}</span>}</>
        : <span>{message || (phase === "aiming" ? "Visez le centre doré de la jauge." : "Attrapez la roue pour commencer le geste.")}</span>}
    </div>
    <div className="launch-game__bank"><span>{bankLabel}</span><strong>{bankValue ?? wheel.launchBank}</strong></div>
    <div className="perspective-workshop__result" role="status" aria-live="polite">{result
      ? <><span>RÉSULTAT DE LA ROUE</span><strong>{result.label}</strong>{result.kind === "pass" && <span>AUCUN GAIN POUR CE SECTEUR</span>}</>
      : <><span>{phase === "spinning" ? "LE DERNIER TAQUET DÉCIDERA…" : "RÉSULTAT DE LA ROUE"}</span><strong>✦</strong></>}</div>
    {editableRewards && <details className="launch-game__rewards"><summary>Barème d’essai</summary>
      {[ ["good", "Beau lancer"], ["perfect", "Lancer parfait"] ].map(([key, label]) => <label key={key}>{label}
        <input type="number" min="0" max="100000" step="10" disabled={!ready} value={game?.rewards[key] ?? ""}
          onChange={event => wheel.setLaunchOptions({ rewards: { [key]: Number(event.target.value) } })} /></label>)}
      <p>Ces bonus s’ajoutent une fois au départ du lancer. Ils ne modifient ni la roue ni son secteur final. La cagnotte d’essai est locale et repart à zéro au rechargement.</p>
    </details>}
  </section>;
}
