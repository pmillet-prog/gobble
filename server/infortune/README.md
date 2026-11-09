# Plateaux de la roue

La mise à jour majeure active `infortuneTournament` dans `shared/releaseScope.js`.
Le serveur exige aussi `GOBBLE_INFORTUNE_ENABLED=1` : `deploy-major.bat` installe
le réglage de `ops/systemd/gobble-infortune.conf` avant le redémarrage. Le réglage
suit la version active et est retiré lors d'un retour à une version antérieure
qui ne contient pas ce fichier. Le test volontaire reste disponible dans Entraînement.

Dans le jeu normal en développement local, le raccord entre les manches est
disponible avec le client Vite et le backend lancé par `npm run start:local`
depuis `server/`. Cette commande active `GOBBLE_LOCAL_INFORTUNE_ENABLED=1`, sans
modifier `NODE_ENV` ni les autres réglages des manches. Pour conserver l'activation avec la commande
habituelle `npm start`, ce poste possède `.Tmp/gobble-development.json` avec
`{"version":1,"infortuneTournament":true}`. Ce fichier reste hors de Git ; sans
lui ni `--local`, le démarrage ordinaire conserve les verrous de publication.
La production ignore ce fichier et refuse `--local`. Un backend
déjà démarré doit être relancé avec l’accord de Paul pour charger ce mode.
Cela ouvre la roue après les manches 1 à 4 du tournoi normal, puis sa finale
après les résultats de la manche 5. Les manches de grille restent inchangées.

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
et le round sérialisé. Le serveur accorde 10 secondes de lancer lorsque le
plateau est prêt ; le client lance automatiquement à l'échéance. Une limite
commune clôt les appareils absents ou bloqués sans retarder la salle.

Chaque client sélectionne son groupe par identité et affiche les deux autres
membres suivant l'ordre circulaire commun. Il ne tire jamais ses propres
adversaires. Le chargement d'apparence concerne seulement ces deux membres,
en une requête. L'avatar et le nom sont fixes pour la séquence ; une erreur de
chargement garde l'identité et utilise le portrait par défaut. Le rendu 3D conserve
éclairage et reflets ; le mode 2D utilise des portraits nommés légers.

`tournament.infortune` possède les cagnottes par compte/invité pour ce tournoi.
Chaque gobble rapporte 100 € de cagnotte et 5 gobblars ; Bonus rapporte 1 000 €
et 100 gobblars. Les bonus de lancer (50 / 100 €) sont crédités et animés dès
le départ, séparément du gain de case à l'arrêt. Passe ne rapporte que le bonus de lancer éventuel. Banqueroute remet
la cagnotte à zéro, bonus de lancer compris. Les présentateurs progressent avec
un tirage automatique par manche ; chaque apparition dispose d'une copie
indépendante pour que les échanges ne traversent pas les groupes.

Les montants sont visibles lors des manches 1 à 3. À la manche 4, les groupes
sont reformés normalement ; les montants adverses sont masqués et seule la
réponse privée à chaque compte contient sa propre cagnotte. Cinq petits montants
(indices 1, 5, 10, 15, 20), espacés de quatre à cinq secteurs, sont recouverts
par Échange après l'intro, avant de déverrouiller le lancer.
La roue comporte trois 100 et cinq 150 ; le quatrième 100 est devenu un 150.
Les cases 400, 500, 1 000 et Bonus ne sont pas contiguës. Passe et Banqueroute
restent à l’opposé, ainsi que Bonus et le 1 000. Le 1 000 est encadré par
100 et 150 ; Bonus par 150 et 200. Banqueroute garde 400 et 500 ; Passe a
400 et 100. Les deux 400 sont opposés ; les trois 500 sont espacés de 7 à 9
secteurs, les quatre 200 de 5 à 7 et les deux 300 de 11 et 13 secteurs.
La régularité exacte des trois 100 ne permet pas d’en mettre un à côté de
chacun des deux gains spéciaux opposés : la priorité est au voisinage du 1 000.
La simulation physique reste locale, avec une position de départ tirée uniformément
par secteur (les crans et la physique restent identiques) ; le serveur reçoit l'indice et la qualité
du lancer, vérifie l'appartenance au groupe et applique son propre barème.

`infortune:action` enregistre une fois le lancer, puis le choix éventuel d'un
des deux adversaires, ou un refus explicite (`target: null`). Chaque joueur a
10 secondes une fois les trois joueurs de son plateau revenus, sans attendre les
autres trios ; un choix anticipé reste possible. `members[id].choiceUntil` porte cette échéance serveur. Les échanges de chaque trio sont
appliqués selon un ordre tiré au sort à l'ouverture du plateau. Une
requête répétée ou un double clic ne réapplique jamais un gain/échange.
Après verrouillage des choix d’un trio, le snapshot révèle ses cagnottes et
publie `exchangeReplays[groupId]` avec les montants avant chaque transfert.
Deux choix réciproques produisent un seul événement `cancelled: true` : aucun
transfert, et une animation explicite d'annulation pour les trois joueurs.
Les autres trios restent masqués tant qu’ils choisissent. Le client rejoue
tous les échanges de son propre trio, même entre les deux adversaires, en
3,2 secondes par transfert. Les snapshots répétés ne relancent pas l’animation.
Les lancers 1 à 3 sont facultatifs : un `join` pendant les 20 secondes des résultats
réserve la roue au joueur qui clique sur Christian. Les autres restent sur les
résultats et reçoivent un tirage serveur à la fin de ces 20 secondes. Chaque secteur
physique a une chance sur 24 ; les montants répétés conservent leur multiplicité.
Le quatrième reste obligatoire. Les échéances serveur individuelles couvrent
l'absence de geste, un navigateur suspendu après le lancer (20 secondes), ainsi
qu'un accusé de présentation perdu (10 secondes après résultat). La limite commune
reste le dernier recours. Le résultat privé est conservé pour la reconnexion. Tout
échange sans choix confirmé à l'échéance est refusé automatiquement (`target: null`).
Refuser n'empêche pas un autre joueur de choisir sa cagnotte. Les résultats de la
manche sont lus pendant 20 secondes avant la roue. Le plafond collectif de roue
est de 40 secondes, ou 50 au quatrième lancer, choix d’échange compris.
Le tableau de suivi utilise les identités de tous les groupes, `launched`,
`presented`, `choiceMade` et les échéances individuelles ; il affiche aussi les
lancers restants et la limite serveur `spinDeadlineAt`.
Les snapshots publics ne divulguent aucun montant adverse encore masqué. Le
client conserve sa dernière cagnotte privée entre deux mises à jour publiques.

`scheduleWheelClosing` clôt la phase quand tous les résultats ont été présentés,
ou au plafond même si un accusé de présentation manque. Il réserve d’abord la
durée des échanges à animer (3,2 secondes chacun, au maximum trois par plateau),
puis une promenade de 5,2 secondes, avec 600 ms d’entrée et 300 ms de sortie.
`wheelClosing` porte les horaires serveur et uniquement les identités des humains
ayant la plus grosse cagnotte de tout le salon, ex æquo compris. Les présentateurs
sont exclus. Au quatrième lancer, seuls les échanges sont animés : aucune
promenade ni durée de promenade n’est ajoutée. Le prochain départ appartient à cette clôture, sans second minuteur
concurrent. Le snapshot de reconnexion contient la même scène : le client reprend
son temps restant, ou la saute si elle est déjà passée.
Les soldes vivent en mémoire avec le tournoi, comme son classement.

## Finale du mini-tournoi

Après la lecture des résultats de la manche 5, une introduction animée de
**4 secondes** présente Christian Mauresque et la finale. Son `introStartsAt`
précède le `startsAt` commun : elle ne consomme aucune des **120 secondes** de
jeu, sur la même énigme et avec la cagnotte constituée. Une reconnexion rejoint
le moment courant sans rejouer l’intro. Le tableau apparaît ensuite, puis le
thème avec son signal sonore ; les mouvements sont désactivés si le joueur
préfère les animations réduites. Les essais locaux utilisent la même intro.
`tournamentFinale.js` conserve les achats et l'unique réponse par compte ;
`infortune:finale` reçoit uniquement des intentions, jamais des points ni des prix.
Les lettres cachées et la solution ne sont pas envoyées dans les messages publics.
Trois lettres distinctes réellement présentes dans l'énigme sont tirées une fois
par finale et offertes à tous, toutes occurrences comprises. Elles ne coûtent
rien et ne font pas progresser le tarif des achats en gobblars. Le clavier de
réponse est en AZERTY, avec une touche « Effacer » élargie.
Pour cette majeure, Paul a autorisé la banque actuelle en production :
`RELEASE_SCOPE.infortuneFinaleDrafts` permet son tirage sans modifier les statuts
éditoriaux de relecture. Les consonnes coûtent
50 €, les voyelles 150 €. Le classement affiche le mot à trouver après la
tentative du joueur ou l’échéance, avec accès à la définition habituelle.

Si la cagnotte ne permet plus d’acheter aucune lettre restante, même avec un
reliquat d’euros, le joueur peut confirmer un achat en gobblars : 5, 10, 20,
40… par finale. Voyelles et consonnes partagent ce compteur. Le serveur recalcule
le prix et contrôle le portefeuille ; le prix confirmé par le client n’est pas
une autorisation de débit. Le journal SQLite `gobblar_finale_purchases` rend les
reprises d’une même requête idempotentes. Un paiement arrivé après l’échéance est
annulé/remboursé ; une annulation reçue avant le débit bloque également celui-ci.
Le snapshot privé restitue compteur et solde après reconnexion. Les mises à jour
du portefeuille sont envoyées uniquement à l’identité concernée.

La proposition est validée en un clic, avec une seule tentative. Une réponse
correcte ajoute **10 points** au tournoi, une seule fois, et convertit
le solde restant selon le barème de gobblars. La conversion affiche les deux
montants, anime le transfert vers le portefeuille et joue le son de caisse.
L’animation ne crédite rien elle-même : le reçu serveur fait foi, et le compteur
libère son affichage à l’arrivée du transfert. Le client affiche la réponse et les
gains pendant quatre secondes, avec un bouton pour rejoindre le classement
immédiatement. Ce retour local ne suspend pas le chrono collectif ni les mises
à jour du classement provisoire. Une réponse incorrecte termine
aussi la tentative. À l'échéance commune, les tentatives restantes expirent ; le
classement final est affiché **15 secondes**, puis le podium existant commence.
Les trophées, médailles et avatars du podium sont déterminés seulement une fois
la finale close. Recharger la page restitue les achats, la réponse et les mêmes
échéances. Quitter une salle libère les timers et abonnements du satellite client.

Dans l'atelier 3D : « Échange de cagnottes » → « Tester la manche 4 » rejoue
l'intro et la chute des tuiles. « Tester le choix d'un échange » permet de
vérifier les avatars cliquables sans attendre de tomber sur la case. Aucun
compte réel n'est modifié par ce mode.

Vérifications ciblées :
`node --preserve-symlinks --preserve-symlinks-main --test server/infortune/roundPlateaus.test.js src/features/infortune/createInfortuneIntermissionFeature.test.js src/features/infortune/infortuneContestants.test.js`.
