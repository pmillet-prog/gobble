import React from "react";

export default function PatchNotes20260920Minor({ menuDarkMode = false }) {
  return (
    <article className={`rounded-xl border p-3 ${menuDarkMode
      ? "border-sky-300/25 bg-sky-400/10"
      : "border-sky-200 bg-sky-50/75"}`}>
      <h2 className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        Mise à jour mineure du <time dateTime="2026-09-20">20 septembre 2026</time>
      </h2>
      <ul className="mt-2 list-disc pl-5 space-y-2">
        <li><strong>Avatars :</strong> port immédiat proposé après achat et achat groupé avec détail des prix, éléments achetables et montant manquant.</li>
        <li><strong>3 000 gobblars offerts une fois</strong> à chaque nouveau compte, ainsi qu’aux joueurs ayant moins de 2 000 parties et une connexion dans les 30 jours précédant cette mise à jour. Une notification vous prévient.</li>
        <li>Vos avatars apparaissent aussi dans les classements de fin de manche.</li>
        <li><strong>Live :</strong> les manches 3 mots retrouvent leurs 90 secondes ; Bernard Pinot trouve un peu moins de mots.</li>
        <li>Ajustement pour limiter la ligne parasite parfois visible tout en bas de l’écran sur mobile pendant les animations.</li>
      </ul>
    </article>
  );
}
