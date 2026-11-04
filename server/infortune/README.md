# Plateaux de la roue

Publication actuelle : seul le test volontaire dans Entraînement est ouvert aux
joueurs. `shared/releaseScope.js` verrouille `infortuneTournament` à `false` :
même `GOBBLE_INFORTUNE_ENABLED=1` ne déclenche ni roue entre les manches, ni
échange, ni allongement de pause. Le raccord live ci-dessous est conservé pour
une future livraison. Son ouverture exigera de modifier ce verrou, puis d'activer
la variable serveur. Aucun déploiement ni changement de serveur n'est effectué ici.

Les ateliers 3D, 2D, finale/relecture et annonces restent dans le menu dev. En
production, leur entrée vérifie `/api/dev/workshops/access` avant de charger le
module de l'atelier, avec la même liste de comptes autorisés que les outils dev.
Le développement Vite local conserve l'accès direct pour les essais hors serveur.

À la clôture de la manche, `snapshotInfortunePlayers` capture les humains encore
connectés, par compte (ou identifiant d'installation pour un invité). Les bots du
classement et les connexions multiples d'un même compte ne créent pas de places
supplémentaires. Les arrivées après cette clôture attendent le regroupement suivant.

Une fois le classement du mini-tournoi actualisé, `buildInfortunePlateaus` mélange
séparément ses tiers haut, milieu et bas, puis distribue ces joueurs entre des
groupes de trois. Les groupes incomplets reçoivent des présentateurs existants,
distincts dans un même groupe. Quatre humains donnent deux binômes accompagnés
chacun d'un présentateur ; un humain seul reçoit deux présentateurs.

La composition appartient à `currentRound.infortune`. Elle ne change plus durant
cette phase, même après un départ. Elle est envoyée dans `infortunePlateau` avant
la préparation lourde des résultats, puis reprise à l'identique dans `roundEnded`
et le round sérialisé. Le délai commun de lancer commence à la publication de la
composition ; le temps de lecture des résultats est conservé dans la pause.

Chaque client sélectionne son groupe par identité et affiche les deux autres
membres suivant l'ordre circulaire commun. Il ne tire jamais ses propres
adversaires. Le chargement d'apparence concerne seulement ces deux membres,
en une requête. L'avatar et le nom sont fixes pour la séquence ; une erreur de
chargement garde l'identité et utilise le portrait par défaut. Le rendu 3D conserve
éclairage et reflets ; le mode 2D utilise des portraits nommés légers.

`tournament.infortune` possède les cagnottes par compte/invité pour ce tournoi.
Chaque gobble rapporte 100 ; Bonus rapporte 1 000 ; les bonus de lancer sont
50 / 100. Passe ne rapporte que le bonus de lancer éventuel. Banqueroute remet
la cagnotte à zéro, bonus de lancer compris. Les présentateurs progressent avec
un tirage automatique par manche ; chaque apparition dispose d'une copie
indépendante pour que les échanges ne traversent pas les groupes.

Les montants sont visibles lors des manches 1 à 3. À la manche 4, les groupes
sont reformés normalement ; aucun montant cumulé n'est sérialisé dans les
messages de cette manche. Les trois cases 100 (indices 1, 9, 17), espacées de
huit secteurs / 120°, sont toutes recouvertes par Échange après l'intro,
avant de déverrouiller le lancer. Les indices sont dérivés des montants.
La roue comporte trois 100 et cinq 150 ; le quatrième 100 est devenu un 150.
Les cases 400, 500, 1 000 et Bonus ne sont pas contiguës. Passe et Banqueroute
restent à l’opposé, ainsi que Bonus et le 1 000. Le 1 000 est encadré par
100 et 150 ; Bonus par 150 et 200. Banqueroute garde 400 et 500 ; Passe a
400 et 100. Les deux 400 sont opposés ; les trois 500 sont espacés de 7 à 9
secteurs, les quatre 200 de 5 à 7 et les deux 300 de 11 et 13 secteurs.
La régularité exacte des trois 100 ne permet pas d’en mettre un à côté de
chacun des deux gains spéciaux opposés : la priorité est au voisinage du 1 000.
La simulation physique reste locale ; le serveur reçoit l'indice et la qualité
du lancer, vérifie l'appartenance au groupe et applique son propre barème.

`infortune:action` enregistre une fois le lancer, puis le choix éventuel d'un
des deux adversaires. Les échanges de chaque trio sont appliqués après leurs
lancers et choix, selon un ordre tiré au sort à l'ouverture du plateau. Une
requête répétée ou un double clic ne réapplique jamais un gain/échange.
À 75 secondes, les actions manquantes sont abandonnées et les choix déjà reçus
sont exécutés. La pause conserve ensuite 15 secondes pour lire les résultats.
Les snapshots de reconnexion et `infortuneEconomy` utilisent la même vue filtrée.
Les soldes vivent en mémoire avec le tournoi, comme son classement ; ils ne
constituent pas encore un versement de gobblars ni le raccord de la finale.

Dans l'atelier 3D : « Échange de cagnottes » → « Tester la manche 4 » rejoue
l'intro et la chute des tuiles. « Tester le choix d'un échange » permet de
vérifier les avatars cliquables sans attendre de tomber sur la case. Aucun
compte réel n'est modifié par ce mode.

Vérifications ciblées :
`node --preserve-symlinks --preserve-symlinks-main --test server/infortune/roundPlateaus.test.js src/features/infortune/createInfortuneIntermissionFeature.test.js src/features/infortune/infortuneContestants.test.js`.
