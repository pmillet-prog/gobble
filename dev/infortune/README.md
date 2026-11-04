# La roue de l’infortune — atelier local

```sh
npm run infortune:dev
```

Ouvrir <http://127.0.0.1:8776/dev/infortune/>. Cet atelier charge le composant
réutilisable `src/components/infortune/InfortuneWheel.jsx` sans lancer le backend,
ouvrir de socket, monter l’application principale ou modifier les soldes.

Faire glisser le bord de la roue puis lâcher, à la souris, au stylet ou au doigt.
Les deux sens fonctionnent. Un geste trop lent est refusé. On peut aussi maintenir
le bouton de lancer, ou la touche Espace/Entrée lorsque ce bouton a le focus, puis
relâcher après le repère de force minimale. « Un autre tour » réarme la roue après
son arrêt, en conservant sa position. Les réglages du toucher sont disponibles
entre deux lancers.

Les 24 secteurs, leurs couleurs et leurs montants d’essai sont définis dans
`src/features/infortune/wheelConfig.js` : un Bonus, une Banqueroute et trois
intervalles par secteur (72 taquets partagés). Les montants sont librement inspirés
de la roue en euros, sans prétendre reproduire sa répartition exacte.

## Mécanique et cycle de vie

- L’impulsion vient des 100 dernières millisecondes du geste, avec un minimum et
  un plafond. Le bouton fournit une impulsion proportionnelle au temps de maintien.
- Le moteur local simule l’inertie, un faible frottement de palier, une résistance
  dépendante de la vitesse, la traînée, l’énergie de flexion de la languette et la
  perte d’énergie au contact.
  La roue peut reculer sur un dernier taquet ; aucun résultat ni angle d’arrivée
  n’est tiré ou corrigé après le lancer.
- Le pas fixe est de 1/240 s, indépendant du rafraîchissement de l’écran. Seuls
  la rotation SVG, la courbe de la languette et la jauge sont modifiées par image ; React reçoit les phases
  et le verdict. Aucun frame n’est demandé au repos.
- Le dessin et les collisions partagent la position et le rayon des tiges rondes
  et la courbe de la languette. Celle-ci conserve sa longueur, reste fixée
  verticalement à sa base et se courbe largement sous la poussée d’un taquet.
  La résistance augmente progressivement avec la flexion. Près du passage,
  l’énergie disponible décide si le taquet se libère ou si la languette restitue
  son énergie à la roue et la repousse. Aucun ralentissement scénarisé n’est ajouté.
  Les déplacements rapides sont subdivisés pour éviter de traverser un taquet,
  y compris pendant un glisser. Le clic correspond à la libération du cliquet.
  Les sons Web Audio sont synthétisés localement, débloqués au premier geste et
  limités en fréquence à grande vitesse.
- Un glisser trop faible reste refusé comme lancer, mais la languette peut alors
  repousser librement la roue en se détendant, sans attribution de résultat.
- Masquer l’onglet suspend la roue et le son. Un geste interrompu est annulé.
  Démonter le composant libère les événements, l’animation et le contexte audio.
- `onResult(result)` est appelé une fois à l’arrêt avec `kind`, `amount`, `label`,
  `index`, `slot`, `angle`, `pawlAngle`, `turns`, `duration` et `launchSpeed`.
  La case est lue sous la pointe réelle du cliquet, même s’il reste incliné.

## Périmètre de cette première version

Prototype de mécanique et de présentation, pas encore branché aux fins de manche.
Les gains, les conséquences de Banqueroute et Bonus, ainsi que le délai laissé à
chaque joueur restent à définir avant cette intégration. Aucun effet financier
ou de progression n’est associé au résultat dans l’atelier.

## Vérification

```sh
npm run infortune:test
npm run infortune:build
```

Les tests couvrent les cases, le seuil de lancer, la reproductibilité et l’arrêt
aux extrêmes des réglages, le recul sur un taquet, plusieurs fréquences d’écran,
les gestes trop faibles/annulés, le résultat unique, la pause et le nettoyage.
Le build autonome est produit dans `.tmp/infortune-build`.
