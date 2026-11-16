import React from "react";

export default function PatchNotes20261116Minor({ menuDarkMode = false }) {
  return (
    <article className={`rounded-xl border p-3 ${menuDarkMode
      ? "border-sky-300/25 bg-sky-400/10"
      : "border-sky-200 bg-sky-50/75"}`}>
      <h2 className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        Mise à jour mineure du <time dateTime="2026-11-16">16 novembre 2026</time>
      </h2>
      <ul className="mt-2 list-disc pl-5 space-y-2">
        <li>
          <strong>Votez sur l’avenir de la roue.</strong> Dès <strong>100 manches jouées</strong>,
          un message vous est présenté au lancement du jeu. Choisissez <strong>Je vote</strong>
          pour sélectionner une ou plusieurs des huit propositions, puis confirmez votre vote.
          La proposition <strong>Suggérer autre chose</strong> vous permet de rédiger votre idée.
          Vous pouvez aussi choisir <strong>Passer</strong> : ce choix est mémorisé et le message
          ne vous sera plus reproposé. Pour revenir sur votre décision, ouvrez
          <strong> À propos → Modifier mon vote</strong> ; une nouvelle validation remplace
          votre réponse précédente.
        </li>
        <li>
          <strong>Une fin de tournoi plus rapide.</strong> Dès que tous les joueurs ont répondu
          à la finale de la roue, il ne reste plus que <strong>5 secondes avant le podium</strong>.
          Le délai entre le début du podium et le retour au salon est également réduit de moitié.
        </li>
        <li>
          <strong>Le temps de relire la question.</strong> Après votre réponse à la finale,
          la question complète reste affichée au moins <strong>5 secondes</strong>, que votre
          réponse soit bonne ou mauvaise.
        </li>
        <li>
          <strong>Des récompenses visibles pendant le bilan de vocabulaire.</strong> Les gains
          de gobblars et de cagnotte restent visibles pendant l’animation de progression,
          sans masquer son contenu ni passer devant les paramètres.
        </li>
        <li>
          <strong>Les échanges avec les bots restent à votre initiative.</strong> Au quatrième
          lancer, les bots ne déclenchent plus d’échange de cagnottes. Si vous obtenez une case
          <strong> Échange</strong>, vous pouvez toujours choisir un bot de votre plateau.
        </li>
      </ul>
    </article>
  );
}
