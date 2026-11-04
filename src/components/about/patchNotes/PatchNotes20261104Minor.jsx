import React from "react";

export default function PatchNotes20261104Minor({ menuDarkMode = false }) {
  return (
    <article className={`rounded-xl border p-3 ${menuDarkMode
      ? "border-sky-300/25 bg-sky-400/10"
      : "border-sky-200 bg-sky-50/75"}`}>
      <h2 className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        Mise à jour mineure du <time dateTime="2026-11-04">4 novembre 2026</time>
      </h2>
      <ul className="mt-2 list-disc pl-5 space-y-2">
        <li>
          <strong>Des mots plus accessibles dans Gotus.</strong> La sélection des mots
          à trouver écarte désormais une partie des termes les plus rares, en partie
          comme à l’entraînement. Les mots retirés du tirage restent acceptés dans
          vos propositions.
        </li>
        <li>
          <strong>Testez les performances de la roue.</strong> Depuis
          <strong> Entraînement libre → Tester le lancer de roue · Bêta</strong>,
          essayez la 2D puis trois qualités de rendu 3D et envoyez votre avis grâce
          au questionnaire final. Ce test volontaire mesure le chargement et la
          fluidité sur votre appareil ; les gains sont fictifs. Prévoyez quelques
          minutes. Le chargement 3D peut prendre plusieurs secondes, notamment sur
          Firefox ; vous pouvez passer une version qui bloque.
        </li>
      </ul>
    </article>
  );
}
