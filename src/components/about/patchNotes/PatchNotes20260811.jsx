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

export default function PatchNotes20260811({ menuDarkMode = false }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        menuDarkMode
          ? "border-violet-300/25 bg-violet-400/10"
          : "border-violet-200 bg-violet-50/75"
      }`}
    >
      <div className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        patch du 11/08/2026
      </div>

      <PatchSection title="entraînement libre">
        <li>
          un nouveau mode d'entraînement est accessible à volonté depuis l'écran titre,
          indépendamment des parties live.
        </li>
        <li>
          il permet de choisir une manche Classique, Finale avec bonus doublés, 3 mots, Rapidité,
          Grille monstrueuse, Mot le plus long, Meilleur mot, Lettre en or, Massive Boggle ou Faux
          jumeaux. Seule la manche OCID reste réservée au multijoueur.
        </li>
        <li>
          la durée de la manche est librement réglable en minutes et secondes, avec plusieurs
          durées conseillées directement proposées.
        </li>
        <li>
          chaque catégorie dispose d'un stock de 300 grilles pré-calculées. Une seule grille est
          transmise au moment où l'entraînement commence.
        </li>
      </PatchSection>

      <PatchSection title="un entraînement relié au live">
        <li>
          un joueur en entraînement reste compté parmi les joueurs en jeu et apparaît en fin de
          liste avec un pictogramme dédié.
        </li>
        <li>
          le chat reste accessible et il est possible de rejoindre le live après confirmation,
          avec le nombre de joueurs ainsi que la manche actuellement en cours.
        </li>
        <li>
          des commandes permettent de terminer la manche, puis de demander une nouvelle grille,
          ou de revenir directement au lobby à tout moment.
        </li>
        <li>
          sur téléphone, les commandes sont regroupées pour préserver la place de jeu. Le flux du
          live reste visible pendant les manches adaptées, tandis que les manches cibles restent
          entièrement centrées sur leur objectif.
        </li>
      </PatchSection>

      <PatchSection title="résultats et progression">
        <li>
          les entraînements ne modifient ni les records personnels ou hebdomadaires, ni le
          vocabulaire, ni les classements du live ou du mini-tournoi.
        </li>
        <li>
          dans les manches Mot le plus long et Meilleur mot, trouver la cible met immédiatement
          fin à l'entraînement. Le résultat révèle ensuite le mot cible et sa définition, qu'il ait
          été trouvé ou non.
        </li>
        <li>
          les écrans de résultats sont adaptés à l'entraînement et ne présentent que les
          informations utiles au mode joué.
        </li>
      </PatchSection>

      <PatchSection title="compte et continuité">
        <li>
          les tutoriels, notes de mise à jour et récapitulatifs déjà consultés sont désormais
          mémorisés par compte : ils ne réapparaissent plus simplement parce que l'on change
          d'appareil.
        </li>
        <li>
          après un passage du navigateur en arrière-plan, le retour au jeu resynchronise plus
          sûrement la manche et son état réel.
        </li>
      </PatchSection>

      <PatchSection title="maintenance">
        <li>
          lorsqu'une maintenance est en cours, un large bandeau rouge apparaît maintenant en haut
          de l'écran titre afin que l'information soit immédiatement visible.
        </li>
      </PatchSection>
    </div>
  );
}
