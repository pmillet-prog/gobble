import React from "react";

export default function PatchNotes20261011({ menuDarkMode = false }) {
  return (
    <article className={`rounded-xl border p-3 ${menuDarkMode
      ? "border-sky-300/25 bg-sky-400/10"
      : "border-sky-200 bg-sky-50/75"}`}>
      <h2 className="text-[12px] font-extrabold uppercase tracking-wide opacity-90">
        Mise à jour du <time dateTime="2026-10-11">11 octobre 2026</time>
      </h2>
      <ul className="mt-2 list-disc pl-5 space-y-2">
        <li>
          <strong>Les trophées arrivent dans les cartes des joueurs !</strong> Une étagère
          accueille <strong>19 catégories</strong> récompensant votre assiduité et vos
          exploits : manches jouées, mots validés, points cumulés, gobbles, doubles gobbles,
          mots cibles, médailles de mini-tournoi, défis de Julien Lechéper et de FouKro,
          sans oublier les podiums hebdomadaires. Les trophées encore à débloquer restent
          visibles en grisé. Cliquez ou touchez un trophée pour l’admirer en grand, entouré
          de paillettes aux couleurs de son métal, et consulter ses conditions d’obtention
          ainsi que les points qu’il rapporte.
        </li>
        <li>
          <strong>Progressez du bronze à l’or.</strong> Pour les objectifs cumulés, le bronze
          se débloque à <strong>30 %</strong> de l’objectif et l’argent à <strong>60 %</strong>.
          Ces deux récompenses s’obtiennent une seule fois ; chaque nouvelle tranche
          complète rapporte ensuite un trophée d’or supplémentaire. Une seule place suffit
          sur l’étagère : elle affiche votre meilleure version, avec un médaillon indiquant
          le nombre d’exemplaires obtenus.
          <p className="mt-2">Certains exploits disposent de leurs propres règles :</p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li><strong>Avalanche de mots :</strong> trouvez 100 mots dans une manche pour obtenir ce trophée unique.</li>
            <li>
              <strong>Seize à la suite et Le dix-septième joyau :</strong> trouvez un mot
              de 16 ou de 17 lettres. Ces exploits répétables rapportent respectivement
              <strong> 300 et 1 000 points</strong> au classement des trophées.
            </li>
            <li><strong>Trio de maître :</strong> atteignez 1 000 points dans une manche à 3 mots.</li>
            <li><strong>Cible éclair :</strong> trouvez le mot cible en moins de 2 secondes.</li>
            <li>
              <strong>Manche magistrale :</strong> atteignez, sur une seule manche hors
              finales, 2 000 points pour le bronze, 4 000 pour l’argent et 5 000 pour l’or.
              Seul l’or est répétable.
            </li>
            <li>
              <strong>Podiums hebdomadaires :</strong> les trois premières places rapportent
              chacune leur trophée, que vous pouvez gagner à nouveau chaque semaine.
            </li>
          </ul>
          <p className="mt-2">
            Les gobbles simples et les doubles gobbles possèdent des trophées distincts :
            un double compte uniquement dans sa propre catégorie.
          </p>
        </li>
        <li>
          <strong>Un nouveau classement récompense votre collection.</strong> Retrouvez-le
          dans le <strong>Registre des records → Depuis toujours → Trophées</strong>.
          Chaque récompense obtenue ajoute les points de son barème, y compris les nouveaux
          exemplaires des trophées répétables. Une notification annonce chaque acquisition ;
          les trophées remportés pendant une manche apparaissent également dans son bilan,
          avec les points gagnés.
        </li>
        <li>
          <strong>Tout le monde commence à zéro pour les trophées.</strong> Seules les
          performances réalisées à partir de leur mise en place comptent : les anciens
          résultats ne débloquent aucune récompense rétroactive. Le podium de la semaine
          en cours est exclu : les premiers trophées de course hebdomadaire seront attribués
          à la fin de la première semaine complète suivant leur mise en place.
        </li>
        <li>
          <strong>Manches à 3 mots :</strong> les gobbles sont désormais révélés lors de la
          validation de fin de manche. Aucun badge, son ou animation ne signale un gobble
          potentiel pendant la recherche. Si un mot validé est un gobble, une mention apparaît
          à côté de lui, accompagnée de l’animation et du son Gobble.
        </li>
        <li>
          <strong>FouKro devient plus généreux.</strong> Dans <strong>Qui veut gagner des
          Gobblars</strong>, chaque jauge de <strong>10 000 points</strong> remplie rapporte
          désormais <strong>500 gobblars</strong>, contre 50 auparavant.
        </li>
        <li>
          <strong>Le Registre gagne en confort.</strong> Les classements affichent davantage
          de joueurs à l’écran grâce à des lignes plus compactes. Sur les écrans tactiles,
          un problème pouvant empêcher la sélection d’un classement ou d’un type de manche
          dans les menus déroulants est corrigé.
        </li>
      </ul>
    </article>
  );
}
