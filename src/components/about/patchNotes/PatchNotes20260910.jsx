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

export default function PatchNotes20260910({ menuDarkMode = false }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        menuDarkMode
          ? "border-cyan-300/25 bg-cyan-400/10"
          : "border-cyan-200 bg-cyan-50/75"
      }`}
    >
      <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        mise à jour du 10/09/2026
      </div>

      <PatchSection title="les présentateurs à portée de main">
        <li>
          pendant une manche live, Romejko, Julien Lechéper et Maître Capello prennent place dans
          une barre de commandes. Un point d'exclamation signale qu'une information est prête :
          vous choisissez désormais le moment où elle apparaît.
        </li>
        <li>
          sur ordinateur, ces interventions disposent aussi de raccourcis clavier. Aux résultats,
          Bernard Pivot rejoint les commandes aux côtés du retour au salon et des statistiques.
        </li>
        <li>
          le bonus de Question pour un Gobble s'ouvre avec un nouvel habillage en trois dimensions
          pour le défi de Julien Lechéper. Son bonus est mieux signalé dans le classement et ses
          annonces sont restaurées après une reconnexion. Il rapporte maintenant 2 points au
          classement général. Il n'est plus systématiquement appliqué à la manche 3, mais peut
          survenir aléatoirement aux manches 1, 3 et 5, permettant d'éventuels nouveaux
          retournements de situation en dernière minute. Divers sons ont également été ajoutés
          pour ce bonus.
        </li>
      </PatchSection>

      <PatchSection title="confort de jeu sur téléphone">
        <li>
          la nouvelle barre de commandes partage automatiquement la hauteur disponible avec la
          grille, le classement, le mot en cours et le flux du live, y compris sur les écrans les
          plus courts.
        </li>
        <li>
          le rouleau du classement et l'aperçu du mot savent maintenant se compacter sans masquer
          leurs informations importantes.
        </li>
        <li>
          l'ouverture du clavier dans le chat déplace moins l'interface de jeu. Les retours de
          veille, changements d'orientation et fermetures du chat rétablissent aussi plus sûrement
          la bonne disposition.
        </li>
      </PatchSection>

      <PatchSection title="maintenance et finitions">
        <li>
          le bandeau de maintenance de l'accueil adopte une présentation bleu nuit plus sobre,
          avec un pictogramme d'engrenage et sans fond rouge hachuré.
        </li>
        <li>
          le réglage global des effets visuels contrôle désormais également les animations des
          présentateurs, et leurs opérations temporaires sont mieux nettoyées entre deux manches.
        </li>
      </PatchSection>
    </div>
  );
}
