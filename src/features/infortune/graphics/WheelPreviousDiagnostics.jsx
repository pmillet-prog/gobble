import React from "react";
import { diagnosticProfileLabel } from "../../../../shared/wheelDiagnostic.js";

function browserLabel(agent = "") {
  const browser = /Firefox/.test(agent) ? "Firefox" : /Edg/.test(agent) ? "Edge" : /Chrome/.test(agent) ? "Chrome" : /Safari/.test(agent) ? "Safari" : "Navigateur du bilan";
  const system = /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iPhone / iPad" : /Windows/.test(agent) ? "Windows" : /Macintosh/.test(agent) ? "Mac" : /Linux/.test(agent) ? "Linux" : "";
  return [browser, system].filter(Boolean).join(" · ");
}
export default function WheelPreviousDiagnostics({ entries, onChoose }) {
  return <section className="wheel-graphics-setup__previous"><h2>Ton diagnostic est déjà disponible</h2>
    <p>Confirme le bilan réalisé sur cet appareil pour réutiliser son réglage. Tu n’as pas besoin de refaire le test.</p>
    {entries.map(entry => <div key={entry.reportId}>
      <p>{new Date(entry.createdAt).toLocaleDateString("fr-FR")} · {browserLabel(entry.environment.userAgent)}<br />
        <strong>{entry.preference ? "Ton choix" : "Réglage conseillé"} : {diagnosticProfileLabel(entry.preference || entry.recommendation.profile)}</strong></p>
      <button type="button" onClick={() => onChoose(entry.reportId)}>C’est cet appareil · utiliser ce résultat</button>
    </div>)}
  </section>;
}
