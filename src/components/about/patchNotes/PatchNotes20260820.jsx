import React from "react";

function PatchSection({ title, children }) {
  return (
    <>
      <div className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
        {title}
      </div>
      <ul className="mt-1 list-disc pl-5 space-y-2">{children}</ul>
    </>
  );
}

export default function PatchNotes20260820({ menuDarkMode = false }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        menuDarkMode
          ? "border-sky-300/25 bg-sky-400/10"
          : "border-sky-200 bg-sky-50/75"
      }`}
    >
      <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        mise à jour mineure du 20/08/2026
      </div>

      <PatchSection title="transitions et chargement">
        <li>
          l'écran de préparation des grilles fait son retour avec une présentation plein écran,
          blanche et épurée, ainsi que des fondus plus doux.
        </li>
        <li>
          la transition entre les résultats et la manche suivante ne repasse plus brièvement par
          un voile noir puis par l'ancien écran de résultats avant l'introduction.
        </li>
        <li>
          pendant les résultats d'une manche OCID, le décompte avant la manche suivante reste
          maintenant affiché tant qu'il est disponible.
        </li>
      </PatchSection>

      <PatchSection title="entraînement et grilles du jour">
        <li>
          les entraînements libres sont désormais mieux isolés du live : les annonces de manche,
          commentaires de classement et événements destinés aux joueurs du mini-tournoi ne
          viennent plus parasiter la partie.
        </li>
        <li>
          les grilles du jour et les entraînements ignorent également les événements tardifs d'une
          ancienne session live, afin d'éviter une synchronisation ou une fin de manche injustifiée.
        </li>
        <li>
          la manche Faux jumeaux en entraînement retrouve sa lettre alternative, son affichage
          recto-verso et sa tuile dorée.
        </li>
      </PatchSection>

      <PatchSection title="confort de jeu">
        <li>
          sur téléphone, le panneau de chat reste fermé au début d'un mini-tournoi lorsqu'aucun
          message n'était en cours de rédaction. Un véritable brouillon est en revanche conservé.
        </li>
        <li>
          pendant la manche Rapidité, les capsules de score indiquent désormais les 11 points
          réellement attribués à chaque mot.
        </li>
        <li>
          l'accueil apparaît maintenant progressivement : le décor est chargé en premier, puis le
          titre Gobble prend sa place avant l'arrivée en fondu des boutons et des informations.
        </li>
        <li>
          correction de l'interface sur les grands iPhone lorsque Gobble est lancé depuis l'écran
          d'accueil : le bandeau de manche ne recouvre plus le classement et l'espace disponible
          est correctement utilisé jusqu'en bas de l'écran.
        </li>
      </PatchSection>
    </div>
  );
}
