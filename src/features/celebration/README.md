# Célébration de fin de mini-tournoi

`TournamentFinaleExperience` ouvre maintenant le podium dans le jeu, au moment
prévu par le serveur. « Voir le classement complet » ou Échap ferme le podium
et affiche le classement. Le passage est aussi automatique cinq secondes après
la fin réelle de l'animation (ou de la photo finale avec mouvements réduits).
Ce choix reste conservé pour le tournoi en cours.
Les retours d'onglet réutilisent l'heure de célébration, sans relancer le délai
du bilan de la dernière manche. Pendant les résultats de la finale,
`useTournamentAvatarPreparation` charge les modules de présentation et prépare
les portraits en une requête pour les trois premiers et le joueur local.
Les poses calculées sont conservées par `createTournamentAvatarResources`
jusqu'à l'ouverture, puis réutilisées sans nouveau calcul. Une arrivée directe
pendant la célébration lance la même préparation à la demande. Les tâches et
canvases sont annulés/libérés à la fermeture, au changement de tournoi ou à la
sortie du jeu. Les doublons de snapshots ne relancent pas la préparation.

Ouvrir `/dev/avatar-celebration/` sur le serveur Vite local. La scène utilise des
joueurs fictifs et ne contacte ni serveur de jeu ni API de compte. Elle ne modifie
aucune sauvegarde d’avatar. Entrée séparée du jeu, hors du build de production.

`TournamentPodium` reçoit les joueurs classés (`userId`, `nick`, `rank`, `score`,
`avatar`) et le résultat personnel. Apparitions : bronze à 1 s, argent à 2,15 s,
or à 3,45 s ; photo finale à 6,8 s. Bouton Photo finale, deux séries de
tenues, situations vainqueur/deuxième/hors podium, applaudissements facultatifs.
Le sélecteur « Bot invité » ajoute Bernard Pinot, Laurent Rhum&Co, Julien Lechéper
ou Maître Gobbello. Le bot prend la première place disponible hors joueur local
(premier si le joueur est deuxième/hors podium, sinon deuxième).
Les préférences de réduction des mouvements donnent directement la photo finale.

Les poses neutre/sourire/clignement sont préparées avant le lancement dans des
canvases transparents. Les expressions se choisissent seulement au rendu : la
normalisation de sauvegarde conserve la bouche neutre. Les déplacements utilisent
CSS ; React ne se met à jour qu’aux changements de pose et étapes de la séquence.
Il n'y a plus de bouton de replay. Les délais sont annulés à l’arrêt/démontage ; les
canvases et caches sont libérés au changement de personnages ou au démontage.

Les quatre présentateurs utilisent leurs WebP existants, leurs poses neutres et
les indices de clignement des interventions. L’image neutre est conservée pour
la pose heureuse, sans fabriquer une nouvelle expression. Les dessins sont
placés dans le même canevas 600 × 600 que les joueurs, avec un cadrage commun
entre leurs poses. Le statut `isBot: true` est obligatoire pour ce chemin ; un
homonyme humain garde sa composition. L’identification est partagée avec le chat.
Un podium uniquement composé de ces bots ne charge pas le catalogue modulaire.

Validation de la réutilisation et du cycle de vie :

```powershell
node --test src/features/avatar/tournamentAvatarResources.test.js src/features/avatar/chatAvatarRevisions.test.js src/features/celebration/celebration.test.js src/features/celebration/tournamentFinaleGate.test.js
node server/scripts/check-tournament-avatars.mjs
```

Le contrôle navigateur utilise de vrais composants et poses avec des joueurs
fictifs, sans backend. Les captures et mesures sont enregistrées dans
`.Tmp/tournament-avatar-review` : remontages des résultats, nouvel arrivant,
préparation avant ouverture, délai de classement et mouvements réduits.

Mesure locale du 26 septembre 2026, Chrome isolé, 1280 × 900 : huit remontages
des résultats pour deux joueurs, puis arrivée d'un troisième, donnent trois
chargements de miniatures au total. Les dix poses/canevas des trois premiers
et du joueur local ont été préparés en 1 570 ms pendant les résultats ;
l'ouverture du podium a ensuite demandé 15 ms avant l'animation. Le classement
est apparu 5 084 ms après sa fin. Le parcours en 393 × 852 avec mouvements réduits
et sans préparation préalable passe aussi. Ces mesures concernent le navigateur
local et ne constituent pas une mesure sur iPhone réel.

Commande de compilation indépendante :
`node ./node_modules/vite/bin/vite.js build --config dev/avatar-celebration/vite.config.mjs`.
Sortie sous `.Tmp/avatar-celebration-build`, sans copie du dossier public.

La démo reste indépendante du jeu et ne charge que des configurations fictives.
