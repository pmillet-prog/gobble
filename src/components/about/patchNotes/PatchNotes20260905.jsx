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

export default function PatchNotes20260905({ menuDarkMode = false }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        menuDarkMode
          ? "border-amber-300/25 bg-amber-400/10"
          : "border-amber-200 bg-amber-50/75"
      }`}
    >
      <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        mise à jour majeure du 05/09/2026
      </div>

      <PatchSection title="les présentateurs entrent en jeu">
        <li>
          les anciennes interventions d'aide quittent le chat et prennent désormais vie autour de
          la grille, avec une bulle animée, les informations importantes en bleu et une mise en page
          adaptée au téléphone comme à l'ordinateur.
        </li>
        <li>
          Maître Capello signale les suffixes encore riches en possibilités pendant les manches
          classiques. Il laisse cependant la place à Julien Lepers pendant la manche Massive Boggle.
        </li>
        <li>
          à trente secondes de la fin, Romejko peut annoncer le nombre de mots ayant la longueur
          maximale de la grille, uniquement si vous n'avez pas encore trouvé l'un de ces plus longs
          mots. Il n'intervient ni dans les manches cibles ni dans Massive Boggle.
        </li>
        <li>
          aux résultats, Bernard Pivot présente un autre mot que l'on pouvait trouver, accompagné
          de sa définition la plus complète et de son étymologie. Son intervention attend désormais
          la fin — ou la fermeture — de l'animation de progression du vocabulaire.
        </li>
        <li>
          chaque présentateur parle avec plusieurs poses et des effets sonores. Vous pouvez aussi
          lui tapoter dessus si vous souhaitez qu'ils s'en aillent: les réactions s'enchaînent, puis quelques étoiles l'expédient hors de
          l'écran.
        </li>
        <li>
          le réglage « animations des présentateurs TV » remplace les anciens interrupteurs de bots
          devenus inutiles dans le chat.
        </li>
      </PatchSection>

      <PatchSection title="le mot bonus de Julien Lepers">
        <li>
          au début de la troisième manche du mini-tournoi, Julien Lepers lance désormais un TOP !
          autour de la définition d'un mot rare d'au moins cinq lettres caché dans la grille Massive
          Boggle.
        </li>
        <li>
          chaque joueur qui retrouve ce mot gagne 1 point bonus au classement du mini-tournoi. La
          découverte déclenche l'effet spécial des grands mots, puis Julien revient féliciter le
          joueur.
        </li>
        <li>
          un petit pictogramme distingue ce bonus dans les résultats. Si le mot n'a pas été trouvé,
          Julien donne lui-même la réponse pendant la phase de résultats ; Bernard Pivot et Romejko
          lui laissent alors l'antenne.
        </li>
      </PatchSection>

      <PatchSection title="chat et confort sur téléphone">
        <li>
          le chat mobile possède maintenant sa propre gestion du clavier : il s'arrête au-dessus de
          celui-ci sans redimensionner ni déplacer la grille située derrière.
        </li>
        <li>
          les bulles des présentateurs sont plus larges et leurs retours à la ligne plus lisibles.
          Le personnage conserve désormais sa position pendant que sa bulle grandit.
        </li>
        <li>
          les zooms involontaires de l'interface sur téléphone ont été bloqués. Dans la liste des
          joueurs, une petite icône indique maintenant une connexion depuis un téléphone ou un
          ordinateur.
        </li>
      </PatchSection>

      <PatchSection title="jeu et mini-tournoi">
        <li>
          après trois mots invalides consécutifs tracés au doigt, la grille impose une pause
          humoristique de 1,5 seconde. Un mot valide remet immédiatement le compteur à zéro. Ce
          garde-fou ne concerne ni les manches cibles ni la manche 3 mots.
        </li>
        <li>
          dans la manche 3 mots, la validité reste cachée pendant la saisie et n'est dévoilée qu'aux
          résultats. Sur téléphone, l'aperçu des tuiles tracées reste désormais stable.
        </li>
        <li>
          dans les manches Mot le plus long et Meilleur mot, trouver la cible garantit au moins
          1 point au classement du mini-tournoi. Les dix premiers conservent le barème de 10 à
          1 point.
        </li>
      </PatchSection>

      <PatchSection title="stabilité générale">
        <li>
          les différentes parties de Gobble — accueil, salon, live, entraînement, grilles du jour,
          chat et résultats — sont désormais mieux isolées afin qu'un écran quitté ne continue pas
          à perturber celui qui est affiché.
        </li>
        <li>
          les changements de manche, les retours après une perte de connexion et les longues
          sessions nettoient plus proprement leurs opérations temporaires, avec moins de travail
          inutile en arrière-plan.
        </li>
        <li>
          l'introduction plein écran accompagne les véritables démarrages à froid, sans ralentir un
          simple rechargement lorsque les ressources sont déjà disponibles. Sur ordinateur, la
          première manche retrouve immédiatement sa disposition et ses poignées de redimensionnement.
        </li>
        <li>
          pendant une maintenance annoncée, un mini-tournoi déjà engagé peut toujours être rejoint
          ou repris jusqu'à sa conclusion. Les grilles du jour, l'entraînement et le tournoi suivant
          restent bloqués jusqu'à la fin de la maintenance.
        </li>
      </PatchSection>

      <PatchSection title="salon et petits plus">
        <li>
          le carnet du salon adopte une écriture manuscrite plus lisible. Les réactions aux messages
          sont synchronisées en temps réel et les interventions des présentateurs ne polluent plus
          la conversation des joueurs.
        </li>
        <li>
          l'entraînement libre complet de l'écran titre devient l'accès unique au mode solo. Les
          classements et les départages gagnent également en lisibilité dans les thèmes clair et
          sombre.
        </li>
        <li>
          merci à Axioum, qui rejoint la liste des donateurs de Gobble !
        </li>
      </PatchSection>
    </div>
  );
}
