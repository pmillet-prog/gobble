import React from "react";
import { diagnosticProfileLabel, WHEEL_PREPARATION_STEPS } from "../../../../shared/wheelDiagnostic.js";

const seconds = value => Number.isFinite(value) ? `${(value / 1000).toFixed(3)} s` : "—";
function lines(run) {
  const t = run.timings || {};
  return [`${diagnosticProfileLabel(run.profile)} · total : ${seconds(run.loadingMs)}`,
    `Images : ${seconds(t.assets)} · graphismes : ${seconds(t.graphics)} · calibration : ${seconds(t.measurement)}`,
    ...Object.entries(WHEEL_PREPARATION_STEPS).filter(([key]) => Number.isFinite(t.steps?.[key])).map(([key, label]) => `${label} : ${seconds(t.steps[key])}`),
    `Appels au pilote : ${seconds(t.driverCheckMs)} · attente entre appels : ${seconds(t.driverYieldMs)} · ${t.programCheckCount ?? 0} validations`,
    ...(t.programChecks || []).map(check => `#${check.id} ${check.name || check.type} · ${WHEEL_PREPARATION_STEPS[check.pass] || check.pass} : ${seconds(check.checkMs)}`)];
}

export default function WheelLoadingDetails({ run }) {
  const [copied, setCopied] = React.useState("");
  const details = lines(run);
  async function copy() {
    try { await navigator.clipboard.writeText(details.join("\n")); setCopied("Temps copiés."); }
    catch { setCopied("Copie indisponible ici. Tu peux sélectionner le détail ci-dessus."); }
  }
  return <details className="wheel-diagnostic__loading-details">
    <summary>Détail du chargement</summary>
    {details.map((line, index) => <p key={index}>{line}</p>)}
    <button type="button" onClick={copy}>Copier les temps de chargement</button>
    <span role="status">{copied}</span>
  </details>;
}
