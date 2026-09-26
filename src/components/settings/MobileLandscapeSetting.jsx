import React from "react";
import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";

export default function MobileLandscapeSetting({ darkMode = false }) {
  const preferences = useFeatureRuntime("preferences");
  const { mobileLandscapeDesktopEnabled: enabled } = useFeatureFields(preferences, ["mobileLandscapeDesktopEnabled"]);
  const descriptionId = React.useId();
  return <section className={`rounded-xl border p-3 ${darkMode ? "border-amber-200/25 bg-slate-950/35" : "border-amber-300/45 bg-white/70"}`}>
    <button type="button" role="switch" aria-checked={enabled} aria-describedby={descriptionId}
      onClick={() => preferences.set("mobileLandscapeDesktopEnabled", value => !value)}
      className="flex w-full items-center justify-between gap-3 text-left">
      <span className="font-semibold">Affichage ordinateur en paysage</span>
      <span aria-hidden="true" className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 ${enabled ? "bg-emerald-600" : "bg-slate-500"}`}>
        <span className={`h-5 w-5 rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} />
      </span>
    </button>
    <div id={descriptionId} className="mt-2 space-y-2 text-xs leading-relaxed">
      <p>Sur mobile, tourne ton appareil pour utiliser la présentation ordinateur. En portrait, la présentation reste mobile.</p>
      <p className={darkMode ? "text-amber-200" : "text-amber-900"}>
        Attention : les textes et boutons seront plus petits. Ce mode peut être moins lisible et ralentir le jeu sur mobile.
      </p>
    </div>
  </section>;
}
