import React from "react";
import { WHEEL_PROFILES } from "./wheelPerformance.js";
import "./performanceControls.css";

export function PerformanceControls({ performance: perf, disabled = false }) {
  const { report } = perf, profile = WHEEL_PROFILES[report.profile], metrics = report.metrics;
  return <section className="wheel-performance" aria-label="Performances et affichage">
    <h2>Affichage et fluidité</h2>
    <label>Qualité <select value={report.preference} onChange={event => perf.choose(event.target.value)} disabled={disabled}>
      <option value="auto">Automatique</option>
      {Object.entries(WHEEL_PROFILES).map(([id, value]) => <option key={id} value={id}>{value.label}</option>)}
    </select></label>
    <p><strong>{profile.label}</strong>{report.profile !== "flat" && ` · objectif ${profile.fps} images/s`}</p>
    <p role="status">{report.reason || "Préparation de la mesure…"}</p>
    {metrics && report.profile !== "flat" && <p>{Math.round(metrics.fps)} images/s mesurées · 95 % des images en moins de {Math.round(metrics.p95)} ms</p>}
    {report.timings && <details><summary>Temps de préparation</summary>
      <p>{report.timings.reusedContext ? "Contexte graphique réutilisé pour ce passage." : "Nouveau contexte graphique pour ce passage."}</p>
      <p>Images et avatars : {(report.timings.assets / 1000).toFixed(1)} s<br />
        Préparation graphique : {(report.timings.graphics / 1000).toFixed(1)} s<br />
        Mesure de fluidité : {(report.timings.measurement / 1000).toFixed(1)} s</p>
      {Object.entries(report.timings.steps || {}).map(([id, ms]) => <p key={id}>{({ environment: "Environnement lumineux", textures: "Textures",
        shaders: "Shaders du plateau", shadows: "Ombres", studioReflection: "Reflet du studio", actorReflections: "Reflets des avatars", firstFrame: "Première image" })[id] || id} : {(ms / 1000).toFixed(2)} s</p>)}
      <p>Compilation parallèle : {report.timings.parallelShaders ? "disponible" : "indisponible"} · {report.timings.programs ?? "—"} programmes graphiques</p>
    </details>}
    <small>Choix mémorisé sur cet appareil. La 2D conserve le lancer, sa physique et ses bonus.</small>
    {report.profile === "flat" && <button type="button" disabled={disabled} onClick={() => perf.choose("auto")}>Réessayer la 3D en automatique</button>}
  </section>;
}
