import React from "react";

export default function PatchNotes20260923Minor({ menuDarkMode = false }) {
  return (
    <article className={`rounded-xl border p-3 ${menuDarkMode
      ? "border-sky-300/25 bg-sky-400/10"
      : "border-sky-200 bg-sky-50/75"}`}>
      <h2 className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        Mise à jour mineure du <time dateTime="2026-09-23">23 septembre 2026</time>
      </h2>
      <ul className="mt-2 list-disc pl-5 space-y-2">
        <li>
          <strong>Des visages avec plus de relief</strong> : dans l’éditeur d’avatar,
          choisissez un visage joufflu, ridé ou aux traits marqués, en plus du classique.
          Tout le premier onglet est désormais <strong>gratuit</strong> : homme ou femme,
          visage, silhouette et couleur de peau.
        </li>
        <li>
          Dans <strong>Visage</strong>, retrouvez les boutons <strong>♂ Homme / ♀ Femme</strong>,
          puis un curseur pour <strong>affiner ou élargir tout l’avatar</strong>,
          les visages et la couleur de peau.
        </li>
        <li>
          <strong>500 gobblars offerts</strong> à tous les comptes existants, même sans achat
          d’avatar. Ce cadeau unique est annoncé par un toast.
        </li>
        <li>
          <strong>Rembourser tous mes achats…</strong> permet de récupérer le montant exact
          dépensé dans l’éditeur, après confirmation. Les pièces achetées sont reverrouillées
          et l’avatar est retiré pour repartir de zéro ; les éléments offerts et les récompenses restent acquis.
        </li>
        <li>
          <strong>Rotation sur Android</strong> : le paysage est réservé au grand tableau,
          avec un retour au portrait à sa fermeture et à la reprise du jeu hors du tableau.
        </li>
      </ul>
    </article>
  );
}
