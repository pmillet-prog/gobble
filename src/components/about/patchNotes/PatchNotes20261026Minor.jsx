import React from "react";

export default function PatchNotes20261026Minor({ menuDarkMode = false }) {
  return (
    <article className={`rounded-xl border p-3 ${menuDarkMode
      ? "border-sky-300/25 bg-sky-400/10"
      : "border-sky-200 bg-sky-50/75"}`}>
      <h2 className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        Mise à jour mineure du <time dateTime="2026-10-26">26 octobre 2026</time>
      </h2>
      <ul className="mt-2 list-disc pl-5 space-y-2">
        <li>
          <strong>Un rappel pour les étourdis.</strong> Si vous validez 5 propositions
          dans les 10 premières secondes d’une manche cible ou OCID, un petit message
          humoristique rappelle l’objectif : trouver un seul mot (le plus long ou le
          meilleur), ou en proposer un en OCID. Il apparaît au maximum une fois par manche.
        </li>
        <li>
          <strong>Plus de temps pour Gotus.</strong> Lorsqu’il est tiré au sort comme
          mini-jeu, la manche cible dure désormais <strong>2 minutes au lieu de 90 secondes</strong>,
          pour tous les joueurs. Trouvez le mot cible, puis profitez du temps restant
          pour chercher celui de Thierry Baccardo.
        </li>
        <li>
          <strong>La définition du mot de Gotus à portée de loupe.</strong> En live comme
          à l’entraînement, une loupe accompagne le mot révélé à la fin de votre partie.
          Elle ouvre sa définition et reste disponible dans le récapitulatif Gotus.
        </li>
        <li>
          <strong>Des rappels au bon moment.</strong> Pendant une partie de Gotus à
          l’entraînement ou pour patienter, l’alerte de prochain mini-tournoi apparaît
          uniquement au lancement de son compte à rebours, plus entre les manches.
          L’option <strong>Ne plus rappeler pendant cette session</strong> reste disponible.
        </li>
        <li>
          <strong>Le limiteur ferme aussi l’accès aux entraînements.</strong> Une fois
          votre temps de jeu quotidien épuisé, l’entraînement classique et Gotus ne sont
          plus accessibles jusqu’au lendemain. Un entraînement déjà ouvert se ferme
          également, avec un message explicatif.
        </li>
        <li>
          <strong>Une attente plus claire pendant les mises à jour.</strong> Le jeu
          bascule automatiquement vers la page de maintenance, puis revient lorsqu’il
          est de nouveau disponible, sans actualisation manuelle. Une indisponibilité
          temporaire ne fait plus apparaître votre profil comme celui d’un nouveau joueur.
        </li>
      </ul>
    </article>
  );
}
