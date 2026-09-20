# Célébration de fin de mini-tournoi

`TournamentFinaleExperience` ouvre maintenant le podium dans le jeu, au moment
prévu par le serveur. « Voir le classement complet » ou Échap ferme le podium
et affiche l'ancien écran. Ce choix reste conservé pour le tournoi en cours.
Les retours d'onglet réutilisent l'heure de célébration, sans relancer le délai
du bilan de la dernière manche. Les portraits sont chargés en une requête pour
les trois premiers et le joueur local, puis les poses sont réutilisées.

Ouvrir `/dev/avatar-celebration/` sur le serveur Vite local. La scène utilise des
joueurs fictifs et ne contacte ni serveur de jeu ni API de compte. Elle ne modifie
aucune sauvegarde d’avatar. Entrée séparée du jeu, hors du build de production.

`TournamentPodium` reçoit les joueurs classés (`userId`, `nick`, `rank`, `score`,
`avatar`) et le résultat personnel. Apparitions : bronze à 1 s, argent à 2,15 s,
or à 3,45 s ; photo finale à 6,8 s. Boutons Rejouer/Photo finale, deux séries de
tenues, situations vainqueur/deuxième/hors podium, applaudissements facultatifs.
Le sélecteur « Bot invité » ajoute Bernard Pinot, Laurent Rhum&Co, Julien Lechéper
ou Maître Gobbello. Le bot prend la première place disponible hors joueur local
(premier si le joueur est deuxième/hors podium, sinon deuxième).
Les préférences de réduction des mouvements donnent directement la photo finale.

Les poses neutre/sourire/clignement sont préparées avant le lancement dans des
canvases transparents. Les expressions se choisissent seulement au rendu : la
normalisation de sauvegarde conserve la bouche neutre. Les déplacements utilisent
CSS ; React ne se met à jour qu’aux changements de pose et étapes de la séquence.
Rejouer réutilise les poses. Les délais sont annulés à l’arrêt/démontage ; les
canvases et caches sont libérés au changement de personnages ou au démontage.

Les quatre présentateurs utilisent leurs WebP existants, leurs poses neutres et
les indices de clignement des interventions. L’image neutre est conservée pour
la pose heureuse, sans fabriquer une nouvelle expression. Les dessins sont
placés dans le même canevas 600 × 600 que les joueurs, avec un cadrage commun
entre leurs poses. Le statut `isBot: true` est obligatoire pour ce chemin ; un
homonyme humain garde sa composition. L’identification est partagée avec le chat.
Un podium uniquement composé de ces bots ne charge pas le catalogue modulaire.

Validation : 20 tests ciblés avatars/célébration et compilations démo/client.
Le contrôle visuel navigateur n’a pas été effectué : aucun navigateur disponible
dans l’outil de cette session. Les réglages de cadrage restent soumis au retour
visuel de Paul. Les fichiers de portraits des bots ont été examinés directement,
leurs limites alpha mesurées sans modification des WebP.

Commande de compilation indépendante :
`node ./node_modules/vite/bin/vite.js build --config dev/avatar-celebration/vite.config.mjs`.
Sortie sous `.Tmp/avatar-celebration-build`, sans copie du dossier public.

La démo reste indépendante du jeu et ne charge que des configurations fictives.
