import React from "react";

function PatchSection({ title, children }) {
  return (
    <>
      <h3 className="mt-4 text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        {title}
      </h3>
      <ul className="mt-2 list-disc pl-5 space-y-2">{children}</ul>
    </>
  );
}

export default function PatchNotes20260913({ menuDarkMode = false }) {
  return (
    <article className={`rounded-xl border p-4 ${menuDarkMode
      ? "border-amber-300/30 bg-amber-400/10"
      : "border-amber-300 bg-amber-50/80"}`}>
      <h2 className="text-base font-extrabold">
        Mise à jour majeure du <time dateTime="2026-09-13">13 septembre 2026</time>
      </h2>
      <p className="mt-2">
        Un didacticiel pour apprendre en jouant, un grand tableau pour vous exprimer,
        des résultats plus clairs et de nombreuses améliorations de confort !
      </p>

      <PatchSection title="Le grand tableau : à vous la craie !">
        <li>
          Un nouvel espace partagé pour <strong>signaler un bug, proposer une idée pour
          le jeu ou simplement vous exprimer artistiquement</strong>. Retrouvez-le à
          l’accueil, entre les grilles du jour et le chat.
        </li>
        <li>
          Le tableau est public : tout le monde peut le consulter. Connectez-vous pour
          écrire et dessiner. <strong>Les contributions sont complètement anonymes sur
          le tableau : aucun nom ni pseudo n’est affiché.</strong>
        </li>
        <li>
          Choisissez vos couleurs et vos polices de craie, puis dessinez ou écrivez.
          Déplacez et redimensionnez vos textes ; cliquez en dehors pour terminer leur
          placement. Faites défiler le tableau horizontalement pour explorer les contributions.
        </li>
        <li>
          L’éponge permet d’effacer vos propres contributions : passez-la sur les zones
          à gommer. Les créations des autres joueurs restent en place.
        </li>
        <li>
          Le tableau est sauvegardé, puis archivé et renouvelé chaque lundi pour
          laisser de la place aux nouvelles idées.
        </li>
      </PatchSection>

      <PatchSection title="Un didacticiel qui se joue">
        <li>
          Apprenez dans la véritable interface de Gobble, avec ses grilles, ses sons,
          ses effets et ses résultats. Les indications apparaissent directement sur
          le jeu et vous invitent à tracer des mots sur des grilles préparées.
        </li>
        <li>
          Découvrez les bases : lettres voisines et diagonales, valeur des lettres,
          bonus de longueur, tuiles multiplicatrices et Gobbles des mots les plus longs.
          Le classement live, le flux et les rôles des trois présentateurs sont aussi expliqués.
        </li>
        <li>
          Explorez les résultats, du classement de la manche au général, puis les mots
          trouvés et trouvables, leurs découvreurs et leurs définitions. Sur téléphone,
          un doigt animé vous accompagne pour passer d’un écran à l’autre.
        </li>
        <li>
          Après les bases et le fonctionnement du mini-tournoi, choisissez librement
          vos ateliers : Rapidité, Massive Boggle, Lettre en or, Faux jumeaux, 3 mots,
          Mot le plus long, Meilleur mot et Grille monstrueuse.
        </li>
        <li>
          Faux jumeaux vous apprend à privilégier la tuile à deux lettres pour ses bonus.
          L’atelier 3 mots vous fait composer un trio, déplacer les bonus, remplacer un
          mot et découvrir au résultat ce que rapporte une proposition refusée.
        </li>
        <li>
          Vous connaissez déjà le jeu ? Passez le parcours dès l’entrée. Vous pouvez
          quitter un atelier ou passer une étape ; votre progression est mémorisée et
          ces exercices ne modifient pas vos statistiques.
        </li>
        <li>
          « Apprendre à jouer » apparaît à l’accueil jusqu’à 50 parties. Le didacticiel
          reste accessible à tous via « ? ». En partie, les anciens parcours automatiques
          laissent place à un simple rappel des règles à la première rencontre de chaque
          type de manche spéciale.
        </li>
      </PatchSection>

      <PatchSection title="3 mots : comprendre son résultat">
        <li>
          Un récapitulatif animé passe en revue vos trois propositions : mot accepté ou
          refusé, puis points obtenus selon le placement final des bonus. Un son de pièce
          accompagne les mots valides ; un son distinct signale les refus, selon vos réglages audio.
        </li>
        <li>
          Pendant la recherche, les scores restent provisoires : le dictionnaire tranche
          aux résultats et un mot refusé rapporte zéro.
        </li>
        <li>
          Dans les grilles du jour, cliquez sur votre pseudo dans le classement 3 mots
          pour rouvrir ce bilan. Sur le live, il remplace l’animation du vocabulaire en
          fin de manche 3 mots ; vos mots valides enrichissent toujours votre progression.
        </li>
      </PatchSection>

      <PatchSection title="Vocabulaire : un mot, un bip">
        <li>
          Les nouvelles découvertes défilent une seule fois, dans l’ordre alphabétique,
          avec un bip par mot affiché. Un ralentissement ne produit plus plusieurs bips
          alors qu’un seul mot apparaît à l’écran.
        </li>
        <li>
          La progression globale et celle de la semaine sont distinguées : retrouver un
          mot connu pour la première fois cette semaine ne crée pas une nouvelle découverte globale.
          Les compteurs suivent les mots sauvegardés pour la manche, sans compter deux fois
          les doublons ou les historiques d’appareils liés au même compte.
        </li>
      </PatchSection>

      <PatchSection title="Des menus plus simples">
        <li>
          Quatre pictogrammes colorés : Réglages, « ? », À propos et Facebook.
          Réglages réunit le son, les graphismes, les vibrations, le temps de jeu et
          le clavier sur ordinateur. « ? » propose l’aide rapide et le didacticiel.
        </li>
        <li>Le retour au lobby dispose d’une maison rouge, isolée en bas du menu.</li>
        <li>
          Une rubrique Crédits rejoint À propos. Merci à <strong>Joseph Sardin</strong> et
          {' '}<a className="underline" href="https://LaSonotheque.org" target="_blank" rel="noreferrer">LaSonotheque.org</a>
          {' '}pour leurs sons libres de droits utilisés dans les bruitages et les ambiances du jeu.
        </li>
      </PatchSection>

      <PatchSection title="Lisibilité et confort de jeu">
        <li>
          Sur téléphone, les indices des manches à mot cible se compactent pour garder
          le flux visible, avec les joueurs ayant trouvé la cible et leur temps.
          Aux résultats, le bandeau de commandes reste en bas de l’écran, même avec peu de joueurs.
        </li>
        <li>
          Sur ordinateur, OCID répartit mieux la hauteur entre la définition et la validation.
          Les réponses au vote restent lisibles dans une colonne étroite. Le redimensionnement
          des colonnes préserve des zones utilisables.
        </li>
        <li>
          La bague dorée autour de la grille prend ses bonnes dimensions dès la première
          manche. Le fond blanc de l’introduction reste uniforme jusqu’à sa disparition.
        </li>
        <li>
          Les anciennes interventions des présentateurs ne réapparaissent plus à la manche
          suivante après une reconnexion. Les indices respectent les particularités des manches spéciales.
        </li>
      </PatchSection>

      <PatchSection title="Étymologies, adversaires et performances">
        <li>
          Correction du traitement des étymologies : siècles, dates approximatives, mots
          latins et dérivations sont mieux conservés. Une date inconnue est indiquée
          clairement, au lieu d’un « ? siècle » ambigu.
        </li>
        <li>
          L’équilibrage des bots évolue : certains adversaires ordinaires sont un peu
          plus compétitifs, tandis que Crux a été revu à la baisse. Les présentateurs
          conservent des profils distincts. Inspecteur Grille quitte la liste des bots actifs.
        </li>
        <li>
          Les diagnostics Samsung ne s’activent plus automatiquement en développement.
          Les fichiers temporaires sont exclus de la surveillance locale et des archives
          de déploiement, pour éviter des ralentissements et des envois inutilement volumineux.
        </li>
      </PatchSection>
    </article>
  );
}
