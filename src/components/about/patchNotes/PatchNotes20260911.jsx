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

export default function PatchNotes20260911({ menuDarkMode = false }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        menuDarkMode
          ? "border-sky-300/25 bg-sky-400/10"
          : "border-sky-200 bg-sky-50/75"
      }`}
    >
      <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        mise à jour mineure du 11/09/2026
      </div>

      <PatchSection title="lisibilité sur ordinateur">
        <li>
          les présentateurs restent ancrés au flux live, avec un texte d'au moins 16 pixels.
          Les bulles s'adaptent à la largeur de la colonne, au redimensionnement de la fenêtre
          et au zoom. Si la place manque, le personnage devient plus petit ou passe sous la
          bulle ; celle-ci peut s'élargir au-delà de la colonne pour garder le message lisible.
        </li>
        <li>
          aux résultats, les boutons de retour au salon, de Bernard Pivot et des statistiques
          prennent place en bas de la colonne du flux live.
        </li>
        <li>
          correction d'un problème de restauration de l'ordre des colonnes au chargement,
          qui pouvait remplacer la disposition mémorisée par celle par défaut.
        </li>
      </PatchSection>

      <PatchSection title="une interface plus adaptable sur téléphone">
        <li>
          pendant les manches classiques du live, le classement conserve ses cinq lignes et
          le flux reste visible, même sur un écran court ou avec une barre de navigation Android.
          Les informations de manche, notamment le décompte des Faux jumeaux, restent accessibles
          sans défilement vertical de l'écran de jeu.
        </li>
        <li>
          le classement, l'aperçu du mot et le bandeau de boutons se compactent selon la place
          disponible. La grille garde la largeur maximale possible, mais peut désormais rétrécir
          si nécessaire pour préserver tous ces éléments. Les boutons restent assez grands pour
          être utilisés au doigt.
        </li>
      </PatchSection>

      <PatchSection title="statistiques et progression du vocabulaire">
        <li>
          les statistiques s'ouvrent par-dessus l'écran consulté, sur téléphone comme sur
          ordinateur. Leur ouverture depuis l'accueil ou le salon ne déforme plus l'arrière-plan
          et ne fait plus apparaître le décor d'une partie qui n'a pas commencé. Sur grand écran,
          le panneau est plus compact et les pseudos restent proches de leurs valeurs.
        </li>
        <li>
          l'animation de vocabulaire présente les nouveaux mots uniques de la manche et ne compte
          plus les mots déjà connus comme de nouvelles découvertes. La progression hebdomadaire
          reprend correctement les compteurs de la manche.
        </li>
        <li>
          sur ordinateur, le panneau de progression s'adapte aussi aux petites fenêtres et au
          zoom pour conserver la ligne de progression globale à l'écran. Une erreur liée au niveau
          de vocabulaire, qui pouvait bloquer l'ouverture du jeu, a également été corrigée.
        </li>
      </PatchSection>

      <PatchSection title="les interventions de Bernard Pivot">
        <li>
          le bouton de Pivot retrouve son fonctionnement et la sélection des mots revient aux
          critères précédents, plus resserrés.
        </li>
        <li>
          une simple mention grammaticale comme « participe passé du verbe… » n'est plus présentée
          comme une étymologie. Pour une forme dérivée ou conjuguée, Pivot recherche l'origine du
          mot de base lorsqu'elle est disponible.
        </li>
      </PatchSection>
    </div>
  );
}
