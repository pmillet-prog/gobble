import React from "react";
import { DEFAULT_REFLECTIONS, REFLECTION_FOCAL_REFERENCE, reflectionRadius } from "./sphericalReflections.js";

export function ReflectionControls({ focal, value, onChange }) {
  const radius = reflectionRadius(focal, value.radiusAtReference);
  return <section className="perspective-workshop__camera" aria-label="Réglages des reflets">
    <h2>Reflets des personnages</h2>
    <div className="perspective-workshop__reflection-modes"><button type="button" aria-pressed={value.actors}
      onClick={() => onChange(current => ({ ...current, actors: !current.actors }))}>Personnages : {value.actors ? "activés" : "masqués"}</button></div>
    <p className="perspective-workshop__camera-note">Le dessus du meuble reflète leur position réelle. La focale et le cadrage sont suivis automatiquement.</p>
    <details className="perspective-workshop__composition"><summary>Ambiance · essai sphérique</summary>
    <div className="perspective-workshop__reflection-modes" role="group" aria-label="Comparer les reflets">
      <button type="button" aria-pressed={!value.enabled} onClick={() => onChange(current => ({ ...current, enabled: false }))}>Lointaine</button>
      <button type="button" aria-pressed={value.enabled} onClick={() => onChange(current => ({ ...current, enabled: true }))}>Sphère synchronisée</button>
    </div>
    <p className="perspective-workshop__camera-note">{value.enabled
      ? "La sphère suit la focale pour l’ambiance seule : public sombre et éclairages. Les personnages en sont exclus."
      : "Public sombre et éclairages lointains. Les reflets des personnages sont calculés séparément."}</p>
    <div className="perspective-workshop__reflection-radius">Rayon calculé à {focal} mm <output>{Math.round(radius)} u.</output></div>
    <details className="perspective-workshop__composition"><summary>Calibrer la taille de départ</summary>
      <label>Rayon à {REFLECTION_FOCAL_REFERENCE} mm <output>{value.radiusAtReference} u.</output>
        <input type="range" min="520" max="4000" step="10" value={value.radiusAtReference} disabled={!value.enabled}
          onChange={event => onChange(current => ({ ...current, radiusAtReference: Number(event.target.value) }))} />
      </label>
      <p className="perspective-workshop__camera-note">La sphère reste autour du meuble. Sa marge augmente avec la focale ; ce réglage sert à calibrer l’essai.</p>
      <button className="perspective-workshop__text-button" type="button" onClick={() => onChange(DEFAULT_REFLECTIONS)}>Réinitialiser l’essai</button>
    </details>
    </details>
  </section>;
}
