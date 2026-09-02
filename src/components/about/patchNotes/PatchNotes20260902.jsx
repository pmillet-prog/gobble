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

export default function PatchNotes20260902({ menuDarkMode = false }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        menuDarkMode
          ? "border-amber-300/25 bg-amber-400/10"
          : "border-amber-200 bg-amber-50/75"
      }`}
    >
      <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        mise à jour majeure du 02/09/2026
      </div>

      <PatchSection title="une refonte en profondeur">
        <li>
          une grande partie des coulisses de Gobble a été reconstruite. L'écran titre, le salon,
          le live, les grilles du jour, l'entraînement, le chat et les résultats sont désormais
          mieux séparés, afin qu'un écran quitté ne vienne plus perturber celui qui est affiché.
        </li>
        <li>
          le jeu évite davantage de travail inutile en arrière-plan et libère plus proprement les
          opérations temporaires lors des changements de manche ou de page. Cela doit réduire les
          ralentissements et les petits comportements imprévisibles au fil des longues sessions.
        </li>
        <li>
          cette nouvelle base rend également les corrections et les futures nouveautés plus sûres :
          une évolution apportée à une partie du jeu risque beaucoup moins d'en déstabiliser une
          autre.
        </li>
      </PatchSection>

      <PatchSection title="stabilité et confort de jeu">
        <li>
          les passages entre l'accueil, le salon et les manches, ainsi que la reprise du live après
          une perte de connexion ou un passage en arrière-plan, ont été consolidés.
        </li>
        <li>
          l'animation d'introduction accompagne de nouveau les véritables démarrages à froid, sur
          un fond blanc plein écran. Elle est entièrement ignorée lors d'un simple rechargement ou
          lorsque les ressources du jeu sont déjà disponibles.
        </li>
        <li>
          sur ordinateur, la première manche retrouve immédiatement sa mise en page normale et ses
          poignées de redimensionnement. Les affichages ordinateur et téléphone disposent maintenant
          chacun de réglages mieux adaptés à leur format.
        </li>
        <li>
          dans les classements et les départages, la ligne de votre pseudo reste plus lisible en
          thème clair comme en thème sombre, y compris pour les scores cumulés.
        </li>
      </PatchSection>

      <PatchSection title="manche 3 mots">
        <li>
          pendant la saisie, Gobble ne révèle plus si le mot tracé est valide. Les lettres et le
          score potentiel, bonus compris, restent affichés normalement ; la validité du mot n'est
          dévoilée qu'au moment des résultats.
        </li>
        <li>
          sur téléphone, l'aperçu des tuiles tracées est désormais plus stable et ne se décale plus
          de manière imprévisible pendant la composition du mot.
        </li>
      </PatchSection>

      <PatchSection title="manches cibles">
        <li>
          dans les manches Mot le plus long et Meilleur mot, trouver la cible garantit désormais
          au moins 1 point au classement du mini-tournoi, quelle que soit la place obtenue.
        </li>
        <li>
          les dix premiers conservent le barème de 10 à 1 point. Tous les autres joueurs ayant
          trouvé la cible reçoivent 1 point, tandis qu'une cible non trouvée ne rapporte rien.
        </li>
      </PatchSection>

      <PatchSection title="maintenance">
        <li>
          lorsqu'une maintenance est annoncée pendant un mini-tournoi, il reste possible de
          rejoindre ou de reprendre ce tournoi jusqu'à sa fin. Un avertissement rappelle que la
          maintenance est imminente avant l'entrée dans le live.
        </li>
        <li>
          les grilles du jour, l'entraînement et le lancement du mini-tournoi suivant restent
          indisponibles pendant cette période.
        </li>
      </PatchSection>

      <PatchSection title="salon et chat">
        <li>
          le carnet du salon adopte une nouvelle écriture manuscrite plus lisible sur ordinateur
          comme sur téléphone.
        </li>
        <li>
          les messages des bots n'apparaissent plus dans le salon. Les réactions aux messages se
          mettent maintenant à jour en temps réel.
        </li>
        <li>
          lorsqu'un de vos messages est cité, seul son texte est coloré en bleu : le fond reste
          identique aux autres citations pour préserver la lisibilité.
        </li>
        <li>
          l'ancien bouton d'entraînement a été retiré du salon. Le mode solo complet de l'écran
          titre devient l'accès unique à l'entraînement libre.
        </li>
      </PatchSection>
    </div>
  );
}
