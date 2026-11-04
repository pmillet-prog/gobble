import React from "react";
import { PerformanceControls } from "../../../../dev/infortune-perspective/PerformanceControls.jsx";
import { wheelTestReport } from "./wheelTestReport.js";

export default function WheelTestPerformance({ wheel, size, spins, gestureMode, disabled }) {
  const [copy, setCopy] = React.useState("");
  const [manual, setManual] = React.useState("");
  async function copyReport() {
    const text = wheelTestReport({ report: wheel.performance.report, size, spins, gestureMode,
      status: wheel.renderError || wheel.stageStatus.message || wheel.stageStatus.phase,
      userAgent: navigator.userAgent, pixelRatio: window.devicePixelRatio || 1 });
    try { await navigator.clipboard.writeText(text); setManual(""); setCopy("Bilan copié. Tu peux le joindre à ton retour."); }
    catch { setManual(text); setCopy("Sélectionne et copie le bilan ci-dessous."); }
  }
  return <section className="wheel-test__feedback" aria-label="Performances et retour de test">
    <PerformanceControls performance={wheel.performance} disabled={disabled} />
    <div className="wheel-test__card">
      <h2>Ton retour nous aide</h2>
      <p>Essaie quelques lancers et compare la 3D avec la 2D. Signale les lenteurs au chargement, les saccades et les gestes difficiles à réussir.</p>
      <button type="button" onClick={copyReport}>Copier le bilan technique</button>
      <p className="wheel-test__copy" role="status">{copy}</p>
      {manual && <textarea aria-label="Bilan technique à copier" readOnly value={manual} onFocus={event => event.target.select()} />}
      <small>Ce bilan contient le navigateur, l’affichage et les mesures du test. Aucun envoi automatique.</small>
    </div>
  </section>;
}
