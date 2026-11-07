import React from "react";
import { WHEEL_DIAGNOSTIC_STEPS, diagnosticProfileLabel } from "../../../../shared/wheelDiagnostic.js";
import { readWheelGraphics, readWheelGraphicsPreference, setWheelGraphicsPreference, isWheelGraphicsFallback } from "./wheelGraphicsStorage.js";
import { RELEASE_SCOPE } from "../../../../shared/releaseScope.js";

export default function WheelGraphicsSettings() {
  const [preference, setPreference] = React.useState(readWheelGraphicsPreference);
  const measured = readWheelGraphics();
  if (!RELEASE_SCOPE.infortuneTournament && !import.meta.env.DEV) return null;
  return <section className="rounded-xl border border-slate-400/40 p-3 space-y-2">
    <label className="block font-semibold" htmlFor="wheel-graphics-preference">Affichage de la roue</label>
    <select id="wheel-graphics-preference" className="w-full rounded border border-slate-400 bg-slate-900 text-white p-2"
      value={preference} onChange={event => { setWheelGraphicsPreference(event.target.value); setPreference(event.target.value); }}>
      <option value="auto">Automatique{measured ? ` · ${diagnosticProfileLabel(measured.profile)}` : ""}</option>
      {WHEEL_DIAGNOSTIC_STEPS.map(step => <option key={step.profile} value={step.profile}>{step.label}</option>)}
    </select>
    <p className="text-xs opacity-80">Réglage pour les prochains plateaux sur cet appareil et ce navigateur. La 2D conserve les mêmes règles et les mêmes gains.</p>
    {measured && <p className="text-xs opacity-80">{isWheelGraphicsFallback(measured)
      ? "2D provisoire : le contrôle n’a pas abouti. Ce n’est pas une mesure de puissance de ton appareil."
      : `Conseillé par les mesures : ${diagnosticProfileLabel(measured.profile)}.`} Ton choix manuel reste prioritaire.</p>}
    <a className="inline-block underline text-xs" href="/entrainement/roue/index.html?reglage=1">Refaire la mesure automatique</a>
  </section>;
}
