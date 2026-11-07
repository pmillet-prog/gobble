import React from "react";
import { InfortuneGameDialog } from "./InfortuneGameSurface.jsx";
import { WHEEL_PROFILES } from "../../../dev/infortune-perspective/wheelPerformance.js";

export default function InfortuneWheelSettings({ wheel, busy, launchSettings, settings, onClose }) {
  const [page, setPage] = React.useState("graphics");
  return <InfortuneGameDialog title="Réglages de la roue" onClose={onClose}>
    {launchSettings && <nav className="infortune-game-dialog__tabs" aria-label="Réglages de l’atelier">
      {[["graphics", "Graphismes"], ["launch", "Lancer"], ...(settings ? [["workshop", "Atelier"]] : [])].map(([id, label]) =>
        <button type="button" key={id} aria-pressed={page === id} onClick={() => setPage(id)}>{label}</button>)}
    </nav>}
    {(!launchSettings || page === "graphics") && <>
      <button type="button" aria-pressed={!wheel.muted} onClick={wheel.toggleSound}>{wheel.muted ? "Activer le son" : "Couper le son"}</button>
      <label>Graphismes<select value={wheel.performance.report.preference} disabled={busy} onChange={event => wheel.performance.choose(event.target.value)}>
        <option value="auto">Automatique</option>{Object.entries(WHEEL_PROFILES).map(([id, profile]) => <option key={id} value={id}>{profile.label}</option>)}
      </select></label>
      <p>{wheel.gestureOnly ? "Glisse sur le bord de la roue, puis relâche. La vitesse du geste détermine la puissance."
        : "Au bouton : démarre la jauge, puis appuie de nouveau pour lancer. Vise la zone verte et son centre doré."}</p>
    </>}
    {launchSettings && page === "launch" && launchSettings}
    {(!launchSettings || page === "workshop") && settings}
  </InfortuneGameDialog>;
}
