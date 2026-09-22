import React from "react";

function PatchSection({ title, children }) {
  return <>
    <h3 className="mt-3 text-[11px] font-extrabold uppercase tracking-wide opacity-75 underline underline-offset-2">{title}</h3>
    <ul className="mt-1 list-disc pl-5 space-y-2">{children}</ul>
  </>;
}

export default function PatchNotes20260922Minor({ menuDarkMode = false }) {
  return (
    <article className={`rounded-xl border p-3 ${menuDarkMode
      ? "border-sky-300/25 bg-sky-400/10"
      : "border-sky-200 bg-sky-50/75"}`}>
      <h2 className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        Mise à jour mineure du <time dateTime="2026-09-22">22 septembre 2026</time>
      </h2>

      <PatchSection title="Atelier d’avatar">
        <li>
          <strong>Trois nouveaux nez</strong> : en bouton, de boxeur et de sorcière.
          Dans <strong>Accessoires</strong>, retrouvez aussi quatre paires de boucles d’oreilles :
          grandes créoles dorées, perles pendantes, étoiles pendantes et pendantes émeraude.
          Chaque nouveau modèle coûte <strong>500 gobblars</strong>.
        </li>
        <li>
          Portez <strong>plusieurs accessoires ensemble</strong> : touchez une pièce pour l’ajouter
          ou la retirer. Le choix <strong>Aucun</strong> les retire tous.
        </li>
        <li>
          Sur ordinateur, faites défiler les catégories et les pièces en les faisant glisser
          à la souris. Les vignettes des nez sont agrandies pour mieux comparer les modèles.
        </li>
      </PatchSection>

      <PatchSection title="Le grand tableau">
        <li>
          L’outil <strong>Écrire</strong> propose une saisie sur plusieurs lignes et un
          <strong> aperçu immédiat sur le tableau</strong>. Choisissez la <strong>couleur</strong> et
          la <strong>police</strong> de votre craie ; vos derniers choix sont repris pour le message
          suivant pendant votre visite du tableau.
        </li>
        <li>
          Déplacez votre texte et utilisez aussitôt ses poignées de <strong>rotation, taille et largeur</strong>.
          La largeur ajuste les retours à la ligne en préservant les mots ; vos retours manuels sont conservés.
          Le crayon permet de modifier un texte sélectionné dans votre brouillon avant publication.
          La saisie autorise le correcteur orthographique du téléphone, selon vos réglages.
        </li>
        <li>
          Les zones déjà consultées sont mieux conservées pour accélérer les allers-retours.
          La roue de chargement apparaît seulement si l’attente dépasse <strong>une demi-seconde</strong>.
        </li>
        <li>
          Le <strong>mode paysage</strong> est autorisé sur téléphone dans le grand tableau,
          avec un cadrage adapté à la hauteur disponible, y compris à l’ouverture du clavier.
          Le curseur de zoom du tableau actuel est retiré ; le zoom reste disponible dans les archives.
        </li>
      </PatchSection>

      <PatchSection title="Affichage sur iPhone">
        <li>
          Ajustement du jeu ajouté à l’écran d’accueil pour mieux séparer l’interface de la zone
          de l’heure et de la batterie, et éviter les décalages d’affichage en haut et en bas de l’écran.
        </li>
      </PatchSection>
    </article>
  );
}
