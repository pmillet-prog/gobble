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

const PRICES = [
  ["Visage homme ou femme", "500 gobblars"],
  ["Sourcils, nez, bouche et barbe", "500 gobblars"],
  ["Yeux et cheveux", "1 000 gobblars"],
  ["Lunettes de vue", "1 000 gobblars"],
  ["Lunettes de soleil", "2 000 gobblars"],
  ["Chapeaux courants", "1 000 gobblars"],
  ["Cowboy, trilby, fedora, canotier, melon et panama", "2 000 gobblars"],
  ["Vêtements et décors", "5 000 gobblars"],
];

export default function PatchNotes20260920({ menuDarkMode = false }) {
  return (
    <article className={`rounded-xl border p-4 ${menuDarkMode
      ? "border-amber-300/30 bg-amber-400/10"
      : "border-amber-300 bg-amber-50/80"}`}>
      <h2 className="text-base font-extrabold">
        Mise à jour majeure du <time dateTime="2026-09-20">20 septembre 2026</time>
      </h2>
      <p className="mt-2">
        Votre profil prend vie ! Cette mise à jour apporte les avatars personnalisables,
        des éléments à débloquer avec vos gobblars, des accessoires à gagner en jouant
        et de nouvelles célébrations. Elle améliore aussi le chat, les résultats et les grilles du jour.
      </p>

      <PatchSection title="Créez votre avatar">
        <li>Un nouvel <strong>atelier d’avatar</strong> s’ouvre depuis le crayon de votre propre profil.</li>
        <li>Commencez par choisir un visage homme ou femme, puis construisez votre personnage pièce par pièce.</li>
        <li>
          Personnalisez les yeux, sourcils, cils, nez, bouche, cheveux et barbe. Ajoutez un chapeau,
          des lunettes de vue ou de soleil, une tenue, un décor, une aura ou un accessoire.
        </li>
        <li>Les cils sont offerts après le déblocage d’une première paire d’yeux. Ils se portent avec les modèles à paupières.</li>
        <li>Selon les éléments, vous pouvez modifier les couleurs, la taille ou la position pour personnaliser votre personnage.</li>
        <li>
          Votre avatar est enregistré sur votre compte et peut être retrouvé sur vos autres appareils.
          Tant que vous n’en avez pas créé, une illustration par défaut vous représente.
        </li>
      </PatchSection>

      <h3 className="mt-4 text-[12px] font-extrabold uppercase tracking-wide opacity-90">Une boutique pour vos gobblars</h3>
      <p className="mt-2">
        <strong>Essayez avant d’acheter :</strong> toucher une pièce permet de la prévisualiser.
        La confirmation d’achat s’ouvre uniquement avec son bouton <strong>Acheter</strong>, qui affiche son prix.
        Les pièces achetées restent débloquées, même si vous changez ensuite d’apparence.
      </p>
      <p className="mt-2">Votre solde de gobblars est affiché dans le bandeau de l’atelier.</p>
      <table className="mt-3 w-full text-left text-[12px] leading-5">
        <caption className="sr-only">Prix des pièces de l’atelier d’avatar</caption>
        <thead>
          <tr className="border-b border-current/20">
            <th scope="col" className="pb-2 pr-3">Éléments</th>
            <th scope="col" className="pb-2 text-right">Prix par pièce</th>
          </tr>
        </thead>
        <tbody>
          {PRICES.map(([label, price]) => (
            <tr key={label} className="border-b border-current/10">
              <td className="py-2 pr-3">{label}</td>
              <td className="py-2 text-right whitespace-nowrap">{price}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3">
        La couronne, certaines auras et l’étiquette de participant se gagnent autrement : leur bouton indique l’objectif à atteindre.
        Une pièce encore verrouillée peut être essayée, mais doit être débloquée avant d’enregistrer l’avatar qui la porte.
      </p>

      <PatchSection title="Des récompenses à porter">
        <li>
          <strong>La couronne</strong> se débloque après <strong>100 mini-tournois remportés</strong> à partir de la mise en place
          de cet objectif. Les anciennes victoires ne sont pas reprises rétroactivement.
        </li>
        <li>
          <strong>L’étiquette de participant</strong> récompense <strong>100 bonnes réponses aux questions de Julien Lechéper en jeu</strong>.
          Votre pseudo y apparaît comme écrit au marqueur, sur un badge ovale blanc à bord bleu, porté du côté opposé aux médailles.
          Un nouveau compteur dans le profil permet de suivre cette progression, commencée avec l’objectif.
        </li>
        <li>
          <strong>L’aura des donateurs</strong> est attribuée automatiquement aux comptes associés à la liste des donateurs. Elle reste acquise.
        </li>
        <li>
          <strong>Les auras or, argent et bronze de la course hebdomadaire</strong> sont réservées aux trois premiers de la semaine précédente.
          Elles restent disponibles jusqu’au lundi suivant à <strong>00 h, heure de Paris</strong>. Conserver le même rang renouvelle son aura ;
          changer de rang débloque celle du nouveau rang et retire l’ancienne ; quitter le podium retire l’aura hebdomadaire.
        </li>
        <li>
          Une <strong>notification de déblocage illustrée</strong> présente l’élément gagné et rappelle sa récompense.
          Si vous étiez absent, elle peut vous être présentée à votre prochaine connexion.
          Pour les auras hebdomadaires, seuls les déblocages encore valables sont annoncés.
        </li>
      </PatchSection>

      <PatchSection title="Des profils plus vivants">
        <li>
          Les fiches joueurs sont réorganisées pour mieux mettre en valeur le personnage, sa progression et ses performances,
          avec des statistiques mieux hiérarchisées.
        </li>
        <li>Votre avatar vous représente dans votre fiche de profil et en miniature sur le bouton <strong>Mon profil</strong> à l’accueil.</li>
        <li>
          Les <strong>médailles gagnées aux mini-tournois dans la journée</strong> sont épinglées à la tenue.
          Jusqu’à trois médailles, elles s’alignent côte à côte, même si elles ont toutes la même couleur.
          Au-delà, elles se regroupent en piles par couleur.
        </li>
        <li>Ces médailles sont remises à zéro chaque jour à minuit.</li>
        <li>Le solde de gobblars retrouve une place visible sur l’accueil et dans votre profil.</li>
      </PatchSection>

      <PatchSection title="Vos victoires prennent la pose">
        <li>
          Une <strong>célébration animée de fin de mini-tournoi</strong> fait apparaître les avatars sur le podium,
          avec une mise à l’honneur des trois premiers.
        </li>
        <li>
          Bernard Pinot, Laurent Rhum&amp;Co, Julien Lechéper et Maître Gobbello peuvent eux aussi apparaître
          avec leur personnage lorsqu’ils montent sur le podium.
        </li>
        <li>
          Le bouton <strong>Voir le classement complet</strong> permet de quitter la célébration et de retrouver l’écran de classement.
          Sur ordinateur, Échap permet également de le faire.
        </li>
        <li>Retrouvez aussi vos avatars souriants dans le <strong>récapitulatif de la semaine</strong>.</li>
      </PatchSection>

      <h3 className="mt-4 text-[12px] font-extrabold uppercase tracking-wide opacity-90">Les gains de gobblars se voient mieux</h3>
      <p className="mt-2">
        Une nouvelle animation accompagne vos gains : le montant remporté apparaît, rejoint le total et fait progresser
        le compteur jusqu’au nouveau solde. <strong>Le son de pièce</strong> accompagne son arrivée.
        Les gains rapprochés sont regroupés pour conserver une animation lisible.
      </p>

      <PatchSection title="Un chat plus personnel et des profils plus accessibles">
        <li>
          Une petite miniature de votre avatar apparaît devant votre pseudo dans le chat. Elle est actualisée après une modification
          de votre personnage. L’illustration par défaut n’est pas affichée dans les messages.
        </li>
        <li>
          L’accès aux profils depuis les pseudos est harmonisé dans le chat, les classements et les résultats,
          notamment dans le chat de l’accueil sur ordinateur et dans la liste des réactions aux messages.
        </li>
        <li>
          Lorsqu’un menu intermédiaire est proposé, <strong>Voir le profil</strong>, <strong>Bloquer</strong> et <strong>Signaler</strong> disposent
          de boutons et de pictogrammes plus grands, plus faciles à utiliser.
        </li>
      </PatchSection>

      <PatchSection title="Grilles du jour : un lancement mieux protégé, un historique plus léger">
        <li>
          Une protection supplémentaire limite les cas où une grille était marquée <strong>« manche déjà jouée »</strong> alors que son lancement
          n’avait pas abouti. Un lancement non confirmé peut être repris brièvement, sans remettre le chronomètre à zéro.
        </li>
        <li>
          <strong>Une grille effectivement lancée reste comptée comme jouée en cas de coupure ou de départ.</strong> Cette protection
          ne donne pas de nouvelle tentative après avoir commencé la partie.
        </li>
        <li>
          L’historique affiche d’abord les classements. Un bouton <strong>Mots trouvables</strong>, dans le bandeau de chaque journée,
          charge uniquement la liste demandée : les listes de tous les jours ne sont plus chargées d’un bloc à l’ouverture.
        </li>
        <li>Vos mots trouvés restent distingués <strong>en gras et par une pastille</strong>, lorsque leur historique est disponible.</li>
      </PatchSection>

      <PatchSection title="Manches 3 mots et coffre-fort">
        <li>
          Sur téléphone, le bloc de bilan des manches <strong>3 mots</strong> est réduit proportionnellement pour laisser davantage de place au classement.
        </li>
        <li>
          En <strong>entraînement</strong>, les manches 3 mots bénéficient désormais de l’animation qui valide ou refuse les propositions
          et présente le score définitif, comme en live et dans les grilles du jour.
        </li>
        <li>
          Aux résultats, les mots donnés par <strong>Julien Lechéper et Bernard Pinot</strong> sont cliquables pour ouvrir leur définition
          et permettre leur ajout au coffre-fort.
        </li>
      </PatchSection>

      <PatchSection title="Des indices plus variés avec Maître Gobbello">
        <li>
          Les terminaisons proposées sont limitées à <strong>5 lettres maximum</strong>, pour éviter les indices qui dévoilaient presque un mot entier.
        </li>
        <li>
          Gobbello varie désormais ses conseils entre une terminaison, une zone de départ de mots de <strong>8 lettres ou plus</strong> et
          une zone de départ de mots <strong>rapportant beaucoup de points</strong>. Les indices de départ indiquent le nombre de mots repérés
          et le seuil de longueur ou de points concerné.
        </li>
        <li>
          Le type d’indice est tiré au sort parmi ceux disponibles, en favorisant la variété et en évitant deux fois le même type de suite
          lorsque plusieurs sont possibles.
        </li>
      </PatchSection>
    </article>
  );
}
