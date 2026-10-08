import React from "react";

export default function PatchNotes20261008Minor({ menuDarkMode = false }) {
  return (
    <article className={`rounded-xl border p-3 ${menuDarkMode
      ? "border-sky-300/25 bg-sky-400/10"
      : "border-sky-200 bg-sky-50/75"}`}>
      <h2 className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        Mise à jour mineure du <time dateTime="2026-10-08">8 octobre 2026</time>
      </h2>
      <ul className="mt-2 list-disc pl-5 space-y-2">
        <li>
          <strong>Les statistiques font peau neuve.</strong> Découvrez le
          <strong> Registre des records</strong>, un classeur à onglets qui regroupe vos
          statistiques par thèmes : <strong>Vocabulaire, Manches, Mots et Présentateurs</strong>.
          Passez de <strong>Cette semaine</strong> à <strong>Depuis toujours</strong> pour
          consulter les classements hebdomadaires ou les progressions cumulées.
          Retrouvez notamment vos gobbles et double gobbles cumulés, votre progression
          de vocabulaire, ainsi que les classements de <strong>Questions pour un Gobble</strong>
          et de <strong>Qui veut gagner des Gobblars</strong>.
          Le classement hebdomadaire <strong>Tête à claques</strong> révèle aussi les
          présentateurs les plus frappés par l’ensemble des joueurs.
        </li>
        <li>
          <strong>22 costumes pour votre avatar.</strong> Depuis le crayon de votre profil,
          ouvrez le nouvel onglet <strong>Costumes</strong> de l’atelier : dinosaure, poulet,
          pingouin, licorne, astronaute, pirate, mousquetaire et bien d’autres vous attendent,
          à <strong>20 000 gobblars chacun</strong>.
        </li>
        <li>
          <strong>12 nouvelles tenues à deux couleurs</strong> rejoignent l’onglet
          <strong> Vêtements</strong>, pour les avatars homme et femme : salopette et T-shirt,
          kimono, ciré, veste universitaire… Chaque modèle coûte <strong>5 000 gobblars</strong>
          et permet de colorer séparément ses éléments, comme le gilet
          et la chemise ou le corps de la veste et ses manches.
          Sur ordinateur, la molette permet aussi de parcourir les catégories de l’atelier.
        </li>
      </ul>
    </article>
  );
}
