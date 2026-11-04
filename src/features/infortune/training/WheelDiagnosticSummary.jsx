import React from "react";
import { diagnosticProfileLabel } from "../../../../shared/wheelDiagnostic.js";
import WheelLoadingDetails from "./WheelLoadingDetails.jsx";
export const diagnosticSeconds = value => Number.isFinite(value) ? `${(value / 1000).toFixed(1)} s` : "—";
export function DiagnosticMetrics({ run }) {
  return <dl className="wheel-diagnostic__metrics">
    <div><dt>Chargement du plateau</dt><dd>{diagnosticSeconds(run.loadingMs)}</dd></div>
    {run.profile !== "flat" && <div><dt>Fluidité de l’intro</dt><dd>{run.phases?.intro ? `${Math.round(run.phases.intro.fps)} images/s` : "—"}</dd></div>}
    <div><dt>Fluidité du lancer</dt><dd>{run.phases?.spin ? `${Math.round(run.phases.spin.fps)} images/s` : "—"}</dd></div>
    <div><dt>Images lentes pendant le lancer</dt><dd>{run.phases?.spin ? `${Math.round(run.phases.spin.slowRatio * 100)} %` : "—"}</dd></div>
  </dl>;
}
export default function WheelDiagnosticSummary({ runs, detailed = false }) {
  return <div className="wheel-diagnostic__summaries">{runs.map((run, index) => <section className="wheel-test__card" key={index}>
    <h3>{diagnosticProfileLabel(run.profile)}{run.attempt > 1 ? " · second passage" : ""}</h3>
    <p>{({ complete: "Lancer terminé", skipped: "Passage interrompu", error: "Erreur d’affichage", timeout: "Chargement interrompu après attente" })[run.status]}</p>
    {run.reason && <p>{run.reason}</p>}<DiagnosticMetrics run={run} />
    <WheelLoadingDetails run={run} />
    {!!run.hiddenCount && <p>Onglet masqué {run.hiddenCount} fois : ces pauses sont exclues de la mesure de fluidité.</p>}
    {detailed && <details><summary>Détail des mesures</summary>
      <p>Images : {diagnosticSeconds(run.timings?.assets)} · préparation graphique : {diagnosticSeconds(run.timings?.graphics)} · calibration : {diagnosticSeconds(run.timings?.measurement)}</p>
      <p>Avant l’intro (son compris) : {diagnosticSeconds(run.introWaitMs)} · onglet masqué : {diagnosticSeconds(run.hiddenMs)}</p>
      <p>Chargement total, pauses comprises : {diagnosticSeconds(run.loadingWallMs)}</p>
      <p>Geste : {run.gestureMode} · son : {run.audioStatus} · plateau : {Math.round(run.size?.width || 0)} × {Math.round(run.size?.height || 0)}</p>
      <p>Compilation parallèle : {run.parallelShaders === null ? "non renseignée" : run.parallelShaders ? "oui" : "non"} · programmes : {run.programs ?? "—"}</p>
      <p>Blocages du thread principal : {run.longTasks?.supported ? `${run.longTasks.count} (${diagnosticSeconds(run.longTasks.totalMs)}), maximum ${diagnosticSeconds(run.longTasks.maxMs)}` : "API indisponible sur ce navigateur"}</p>
      {Object.entries(run.phases || {}).filter(([, m]) => m).map(([phase, m]) => <p key={phase}>{phase} : {Math.round(m.fps)} images/s,
        p95 {Math.round(m.p95)} ms, maximum {Math.round(m.max)} ms, {m.samples} intervalles mesurés.</p>)}
    </details>}
  </section>)}</div>;
}
