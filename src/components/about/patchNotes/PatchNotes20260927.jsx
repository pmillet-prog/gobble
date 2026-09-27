import React from "react";

function PatchSection({ title, children }) {
  return <>
    <h3 className="mt-4 text-[12px] font-extrabold">{title}</h3>
    <ul className="mt-2 list-disc pl-5 space-y-2">{children}</ul>
  </>;
}

const BAFOUILLE_STATS = [
  ["5 043", "définitions humoristiques originales"],
  ["20 728", "formes supplémentaires reconnues"],
  ["25 771", "mots potentiellement utilisables"],
  ["100", "dernières définitions écartées pour éviter les répétitions"],
];

export default function PatchNotes20260927({ menuDarkMode = false }) {
  return (
    <article className={`rounded-xl border p-4 ${menuDarkMode
      ? "border-amber-300/30 bg-amber-400/10"
      : "border-amber-300 bg-amber-50/80"}`}>
      <h2 className="text-base font-extrabold">
        Patchnote du <time dateTime="2026-09-27">27 septembre 2026</time>
      </h2>
      <p className="mt-2">
        Un nouveau présentateur aux résultats, des définitions qui se renouvellent
        et des améliorations pour vos avatars, le podium et le confort de jeu.
      </p>

      <PatchSection title="Laurent Bafouille entre en scène">
        <li>
          <strong>Laurent Bafouille remplace MomoMotus</strong> et partage les résultats de manche
          avec Bernard Pinot. Touchez son portrait pour découvrir sa définition humoristique
          d’un mot que la grille permettait de former.
        </li>
        <li>
          Pinot et Bafouille interviennent à tour de rôle. Si l’un n’a aucun texte disponible,
          l’autre prend le relais lorsqu’il le peut. Les <strong>manches cibles restent réservées
          à Pinot</strong>, avec l’étymologie du mot recherché ; Bafouille est alors prioritaire
          à la prochaine manche non cible. L’entraînement conserve Pinot.
        </li>
        <li>
          Bafouille reconnaît aussi des conjugaisons et d’autres formes d’un même mot :{" "}
          <em>BUVAIS, forme conjuguée de</em> <strong>BOIRE</strong>, par exemple. La forme trouvable
          apparaît en petit et en italique, avant le mot défini en gras. Touchez ce dernier pour
          consulter sa fiche. Lorsque le mot de base est lui-même trouvable, il est préféré.
        </li>
      </PatchSection>

      <dl className={`mt-3 grid grid-cols-2 gap-3 rounded-xl border p-3 ${menuDarkMode
        ? "border-white/10 bg-slate-950/30"
        : "border-amber-200 bg-white/75"}`}>
        {BAFOUILLE_STATS.map(([value, label]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[12px] leading-5">{label}</dt>
            <dd className="mt-1 text-xl font-extrabold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2">
        Les <strong>25 771 mots</strong> donnent accès aux <strong>5 043 définitions</strong> :
        plusieurs formes peuvent partager le même texte. Les mots de deux lettres sont exclus.
        Pour départager les candidats, Bafouille privilégie les moins souvent observés dans
        <strong> 3 000 grilles analysées</strong> : 1 000 classiques, 1 000 Massive Boggle et
        1 000 finales, en utilisant les fréquences du type de manche joué.
      </p>

      <PatchSection title="Des interventions plus variées">
        <li>
          <strong>Julien Lechéper évite les mots et définitions de ses 100 dernières questions.</strong>{" "}
          Bafouille possède sa propre protection sur 100 interventions : une autre conjugaison
          ne permet pas de répéter la même définition. Ces historiques sont conservés entre les mini-tournois.
        </li>
        <li>
          Pinot et Bafouille disposent de <strong>six introductions</strong> autour de
          « On pouvait aussi trouver », pour varier leurs prises de parole.
        </li>
      </PatchSection>

      <PatchSection title="Vos avatars et le podium">
        <li>
          Les avatars déjà chargés sont réutilisés pendant le mini-tournoi, au lieu d’être
          redemandés à chaque résultat. Les joueurs qui arrivent en cours de tournoi sont pris en compte.
        </li>
        <li>
          Le podium se prépare pendant les résultats de la dernière manche. Si les avatars
          ne sont pas encore prêts, un chargement termine leur préparation avant l’animation.
          Une erreur de chargement ne les remplace plus à tort par des avatars par défaut ;
          un bouton <strong>Réessayer</strong> reste disponible si nécessaire.
        </li>
        <li>
          Le classement complet s’ouvre automatiquement <strong>5 secondes après la fin
          de l’animation</strong>. Vous pouvez toujours l’ouvrir immédiatement avec
          « Voir le classement complet ». Le bouton pour rejouer l’animation est retiré.
        </li>
        <li>Correction des coiffures qui pouvaient laisser le haut de la tête tronqué sur certains avatars.</li>
      </PatchSection>

      <PatchSection title="Sur mobile et dans le grand tableau">
        <li>
          Sur iPhone, correction des décalages du chat et du clavier réapparus après les derniers
          ajustements d’affichage. L’accueil du jeu ajouté à l’écran d’accueil utilise la hauteur
          disponible sans ajouter de marge artificielle.
        </li>
        <li>
          Dans le grand tableau, lorsque le clavier laisse trop peu de hauteur, l’outil
          <strong> Écrire</strong> ouvre une saisie dédiée. Appuyez sur <strong>Terminer</strong>{" "}
          pour revenir au tableau et placer votre texte, puis sur <strong>Publier</strong> pour l’envoyer.
        </li>
        <li>
          Dans <strong>Réglages → Apparence</strong>, l’option « Affichage ordinateur en paysage »
          est désactivée par défaut. Elle reste peu adaptée aux petits écrans : la grille et les
          textes peuvent devenir trop petits, et ce mode peut ralentir le jeu. Laissez-la
          désactivée pour jouer sur un téléphone. La rotation de l’application Android peut
          encore rester possible hors du grand tableau.
        </li>
      </PatchSection>

      <PatchSection title="Confort de jeu">
        <li>
          Les effets <strong>Gobble et Double Gobble</strong> ne déclenchent plus leurs confettis
          en double. Le chargement des grandes animations de score est également allégé,
          sur ordinateur comme sur mobile.
        </li>
        <li>
          La fin d’une maintenance remet à jour l’accès au jeu, aux défis du jour et au grand
          tableau sans imposer de recharger la page.
        </li>
      </PatchSection>
    </article>
  );
}
