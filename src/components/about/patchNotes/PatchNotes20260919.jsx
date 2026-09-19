import React from "react";

function PatchSection({ title, children }) {
  return (
    <>
      <h3 className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">
        {title}
      </h3>
      <ul className="mt-1 list-disc pl-5 space-y-2">{children}</ul>
    </>
  );
}

export default function PatchNotes20260919({ menuDarkMode = false }) {
  return (
    <article className={`rounded-xl border p-3 ${menuDarkMode
      ? "border-sky-300/25 bg-sky-400/10"
      : "border-sky-200 bg-sky-50/75"}`}>
      <h2 className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        Mise à jour mineure du <time dateTime="2026-09-19">19 septembre 2026</time>
      </h2>
      <p className="mt-2">
        Un grand tableau plus confortable, des bots moins redoutables et plusieurs
        corrections d’affichage et d’historique.
      </p>

      <PatchSection title="Le grand tableau">
        <li>
          Le bouton <strong>Archives</strong> permet de revoir les tableaux des semaines
          précédentes, même sans connexion : choisissez une semaine, explorez son image,
          zoomez au doigt ou à la molette et téléchargez-la en PNG. Une vue d’ensemble
          et des commandes au clavier sont également disponibles.
        </li>
        <li>
          Un petit <strong>curseur de zoom, de 50 à 200 %</strong>, rejoint le tableau
          actuel. Il conserve la zone regardée et permet de faire défiler le dessin
          horizontalement et verticalement lorsqu’il dépasse l’écran.
        </li>
        <li>
          Lorsque vous déplacez un texte près d’un bord, le tableau défile automatiquement
          pour vous permettre de le placer plus loin.
        </li>
        <li>
          L’affichage des gros dessins est optimisé pour réduire les blocages et les
          recalculs inutiles. Une roue de chargement indique que le tableau est en cours
          de préparation.
        </li>
        <li>
          Les brouillons acceptent davantage de traits. Un avertissement invite à publier
          à l’approche de la limite, pour continuer à dessiner ensuite. Les dépassements
          sont signalés explicitement, au lieu de tronquer une contribution à la sauvegarde.
        </li>
        <li>
          Correction du message « trop de coups d’éponge » qui pouvait apparaître sans
          avoir utilisé l’éponge. Un envoi trop volumineux affiche désormais un message
          adapté et conserve le brouillon pour permettre de le corriger.
        </li>
      </PatchSection>

      <PatchSection title="Des bots moins redoutables">
        <li>
          Les bots trouvent moins souvent les très longs mots et décrochent plus rarement
          des Gobbles et doubles Gobbles. Les belles trouvailles restent possibles,
          mais sont moins systématiques.
        </li>
      </PatchSection>

      <PatchSection title="Grilles du jour et confort des menus">
        <li>
          Dans l’historique des grilles du jour, la liste des mots trouvables des jours
          précédents est de nouveau accessible au lieu d’être indiquée comme indisponible.
        </li>
        <li>
          Les grilles du jour, leurs résultats et le coffre-fort s’ouvrent dans des
          panneaux par-dessus l’écran consulté. Leur taille et leur défilement s’adaptent
          à l’espace disponible, y compris sur téléphone. La navigation au clavier est
          améliorée, avec fermeture par Échap.
        </li>
        <li>
          La liste des joueurs accessible depuis l’accueil tient mieux dans les petites
          fenêtres sur ordinateur. Le défilement suit l’espace restant sous l’en-tête
          pour éviter de couper les joueurs en bas de la liste.
        </li>
      </PatchSection>

      <PatchSection title="Merci !">
        <li><strong>Warzowie</strong> rejoint la liste des donateurs. Merci pour son soutien ! ❤️</li>
      </PatchSection>
    </article>
  );
}
