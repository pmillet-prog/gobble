import React from "react";
import { RESULT_SOUND_VARIANTS } from "./wheelSoundPlan.js";
import { AUDIENCE_REACTIONS } from "./wheelAudienceReactions.js";

export function ResultSoundControls({ soundtrack, disabled }) {
  return <section className="perspective-workshop__camera" aria-label="Bruitages du résultat">
    <h2>Bruitages du bilan</h2>
    <p className="perspective-workshop__camera-note">Scintillement du contour, souffle du pivot et notes qui accompagnent les caractères. La variante suit le résultat de la roue.</p>
    <details className="perspective-workshop__composition"><summary>Écouter les variantes</summary>
      <div className="perspective-workshop__reflection-modes perspective-workshop__pawl-modes">
        {RESULT_SOUND_VARIANTS.map(([id, label]) => <button key={id} type="button" disabled={disabled}
          onClick={() => soundtrack.preview(id)} aria-label={`Écouter le bruitage ${label}`}>{label} ♪</button>)}
      </div>
      <p className="perspective-workshop__camera-note">Essais de synthèse sonore, sans modifier le résultat. Échange est uniquement une écoute de préfiguration.</p>
    </details>
    <details className="perspective-workshop__composition"><summary>Réactions du public</summary>
      <div className="perspective-workshop__reflection-modes perspective-workshop__pawl-modes">
        {AUDIENCE_REACTIONS.map(([id, label]) => <button key={id} type="button" disabled={disabled}
          onClick={() => soundtrack.previewAudience(id)} aria-label={`Écouter le public ${label}`}>{label} ♪</button>)}
      </div>
      <p className="perspective-workshop__camera-note">À l’arrêt réel : 100 / 150 → Pas ouf 1 ou 2 au hasard ; 200 à 300 → Honorable ; 400 / 500 → 500 ; 1 000 / Bonus → Top prix.</p>
    </details>
  </section>;
}
