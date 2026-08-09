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

export default function PatchNotes20260809({ menuDarkMode = false }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        menuDarkMode
          ? "border-emerald-300/25 bg-emerald-400/10"
          : "border-emerald-200 bg-emerald-50/75"
      }`}
    >
      <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        patch du 09/08/2026
      </div>

      <PatchSection title="communauté">
        <li>un grand merci à Beerman, qui rejoint la liste des donateurs de Gobble.</li>
      </PatchSection>

      <PatchSection title="interface et confort de jeu">
        <li>
          sur ordinateur, l'interface s'adapte désormais au zoom du navigateur tout en restant
          fixe à l'écran, sans transformer l'ensemble du jeu en page déroulante.
        </li>
        <li>
          le chronomètre a été épuré sur ordinateur afin de rester parfaitement centré, quelle que
          soit la place disponible.
        </li>
      </PatchSection>

      <PatchSection title="mini-tournois et chronomètres">
        <li>
          l'annonce de début du mini-tournoi prend maintenant la forme d'un bandeau compact : le
          chat reste visible et utilisable sur téléphone comme sur ordinateur.
        </li>
        <li>
          la première grille commence à se préparer dès que suffisamment de joueurs sont prêts.
          L'écran « Préparation de la grille » prend le relais lorsque la génération demande plus
          de temps, notamment avant certaines manches Massive Boggle.
        </li>
        <li>
          les comptes à rebours de lancement et de fin de manche sont plus fluides et restent
          alignés avec les véritables secondes ainsi qu'avec les sons associés.
        </li>
        <li>
          dans les salons multijoueurs, une pause de 20 secondes au retour au salon laisse le temps
          de souffler avant un nouveau départ. Si suffisamment de joueurs sont prêts, un compte à
          rebours discret indique le temps restant. Cette pause ne s'applique pas lorsqu'un joueur
          est seul.
        </li>
      </PatchSection>

      <PatchSection title="scores en direct">
        <li>
          chaque mot validé peut désormais faire apparaître son score dans une capsule dorée près
          de la dernière tuile utilisée, avant qu'elle rejoigne sa place dans le flux en direct.
        </li>
        <li>
          le score affiché correspond exactement au chemin tracé à la souris ou au doigt, même
          lorsqu'un autre chemin aurait rapporté davantage de points.
        </li>
        <li>
          ces indications peuvent être masquées à tout moment depuis les préférences d'apparence.
          Les célébrations Bigword restent affichées au premier plan.
        </li>
      </PatchSection>

      <PatchSection title="Gobbles et manches spéciales">
        <li>
          en manche OCID, chaque joueur qui trouve le mot cible reçoit désormais un Gobble,
          annoncé avec les résultats et comptant comme un point supplémentaire au classement du
          mini-tournoi.
        </li>
        <li>
          pendant la manche « 3 mots », trouver l'un des mots les plus longs possibles de la
          grille rapporte désormais un Gobble.
        </li>
      </PatchSection>

      <PatchSection title="finale et records">
        <li>
          la manche finale conserve ses bonus et ses points de mini-tournoi doublés, mais ne peut
          plus remplacer les records personnels ou hebdomadaires de meilleur score et de meilleur
          mot.
        </li>
        <li>
          les records qui ne dépendent pas du score, comme le nombre de mots trouvés pendant une
          manche et le mot le plus long, restent pris en compte normalement.
        </li>
      </PatchSection>

      <PatchSection title="effets dorés">
        <li>
          le rendu doré des annonces, des comptes à rebours et des pseudos mis à l'honneur gagne
          en relief, en lumière et en netteté, avec un reflet plus vivant.
        </li>
      </PatchSection>
    </div>
  );
}
