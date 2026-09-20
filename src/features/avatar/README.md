# Avatars joueurs — première intégration

Le profil personnel et le bouton de compte de l’accueil utilisent `LocalPlayerAvatar`.
La fiche utilise `ProfileAvatar` en vue `portrait`, exactement comme l’atelier :
même zoom, même cadrage et même décalage vertical vers le bas, dans un cadre
carré sans découpe ronde. Les médailles suivent ce décalage avec le vêtement.
Le bouton d’accueil garde son cadrage de visage. Le profil d’un autre joueur utilise la configuration
renvoyée par l’API publique du profil.
L’éditeur est chargé à la demande depuis le crayon du profil personnel. La
comparaison utilise les identifiants de compte, jamais les pseudos. Fermer,
Échap, cliquer hors de la fenêtre ou annuler abandonne le brouillon et revient
au profil. « C’est moi ! » attend désormais l’enregistrement des réglages sur
le compte avant de fermer l’éditeur. Une erreur conserve le brouillon à l’écran.
Tous les assets restent essayables ; seules les pièces débloquées peuvent être
enregistrées. Les achats, la couronne et l’étiquette de participant sont raccordés
au compte. Les objectifs d’auras restent désactivés.

`useAccountAvatarSync` raccorde le compte authentifié au service externe
`createAccountAvatarSync`. Il recharge au démarrage, au retour sur la page et
au retour de la connexion, sans polling. Ses requêtes et écouteurs sont annulés
au changement de compte ou au démontage. L’éditeur recharge avant d’ouvrir un
brouillon et capture sa révision ; une modification concurrente demande de
recharger explicitement plutôt que d’écraser la version de l’autre appareil.

L’API privée `GET/PUT /api/auth/avatar` prend l’identité dans la session serveur.
Le `userId` envoyé sert uniquement à refuser une requête provenant d’un ancien
compte connecté. La table SQLite `user_avatars` conserve JSON, révision et date ;
sa migration du 19 septembre est idempotente. L’écriture vérifie la configuration
commune dans `shared/avatarConfiguration.js` et le catalogue runtime présent
dans `public/avatars/v1/catalog.json`. Ce catalogue doit accompagner le serveur.

Les anciens avatars locaux ne sont plus importés automatiquement lorsque le
serveur annonce les verrouillages. Un appareil sans avatar enregistré utilise
l’image par défaut ; aucun choix payant n’est offert implicitement. Le navigateur garde un
cache et, avant son remplacement, une copie de l’ancien JSON sous
`gobble:avatar:before-account-sync:<userId>` si son stockage est disponible.
Le stockage local n’est plus nécessaire à la sauvegarde du compte.
La route publique du profil ajoute maintenant la configuration d’avatar et les
médailles quotidiennes au résultat, y compris lorsque les statistiques viennent
du cache. Aucune donnée de session privée n’est exposée.

Les médailles sont lues dans le système quotidien existant, par identifiant de
compte, cumulées entre salles et limitées au jour de Paris. Les expirations et
le changement de date écartent les anciennes récompenses. `useProfileMedals`
retire aussi les insignes à minuit si la fiche reste ouverte ; son minuteur et
ses écouteurs appartiennent uniquement à la fiche ouverte. Les insignes sont
dessinés par `avatarMedals.js` après le portrait, dans les mêmes coordonnées
que le vêtement, puis retirés avec les données du jour : ils ne font jamais
partie du JSON d’avatar. Une à trois médailles restent individuelles en rangée,
même de même couleur. Au-delà, chaque couleur forme une pile avec un compteur.
Les compteurs inscrits sur les minuscules insignes plafonnent à `99+` ; les
quantités exactes restent lisibles dans la légende de la fiche.

La sauvegarde est une configuration JSON (identifiants de pièces, couleurs,
réglages), pas un PNG. Le canvas est composé à l’affichage ou au changement de
configuration ; aucun fichier de portrait final n’est exporté ni envoyé. Pour
les célébrations, `avatarRenderState.js` applique une expression temporaire,
puis la scène prépare et réutilise ses poses en mémoire. La sauvegarde du joueur
reste neutre. Les portraits prédessinés des présentateurs suivent un chemin
distinct dans `features/celebration/presenterPodiumAvatars.js`.

`AvatarPortrait` ne possède aucune animation ni boucle permanente. Son moteur
ne charge que les pièces sélectionnées ; il abandonne les rendus obsolètes et
ses caches appartiennent au portrait monté. Les vignettes des choix sont chargées
à la demande. Le panneau d’aperçu reste hors de la zone de défilement des assets,
sur ordinateur comme sur mobile. Les couleurs et curseurs précèdent les choix.
Les catégories Chapeaux, Lunettes, Vêtements et Cils ont des icônes SVG locales.
Les cheveux et chapeaux n’exposent plus de curseurs ; les anciens réglages
sauvegardés restent compatibles. Les lunettes conservent couleur, taille et position.
Les vignettes de chapeaux/lunettes/sourcils sont centrées sur l’alpha complet du
PNG, avec une marge, sans modifier les calages du portrait ni les images. Le
style des images recadrées désactive `max-width:100%` du reset CSS : cette limite
comprimait le PNG agrandi et décalait les chapeaux hors de leur fenêtre. Les
sourcils utilisent ce cadrage, au lieu du zoom autour de l’ancien fond de tête.

Les assets de `public/avatars/v1` sont des copies des pièces approuvées de
`.Tmp/avatar/avatar/catalog/catalog.json`, avec les bases validées et les masques
de coloration utilisés par l’atelier. À la demande de Paul, les vêtements et
chapeaux, lunettes, cils et dernières coiffures/pilosités candidates non rejetées
sont aussi inclus dans cette version locale, avec leur statut `localCandidate`.
La Gavroche est réintégrée sur demande explicite avec son dernier calage enregistré,
malgré son ancien statut rejeté. Les sources de génération et outils de revue
ne sont pas importés. Les masques techniques de peau référencés par les bases
sont conservés. Aucun statut de validation de l’atelier n’est modifié.

Les bouches proposées utilisent les dix bases neutres.
Les 30 expressions restent dans la bibliothèque pour de futures animations.
Les anciens choix sauvegardés migrent vers la base neutre du même modèle.
`avatarControls.js` reprend les bornes effectives de l’atelier ; les limites de
la bouche sont recalculées suivant le nez et les têtes, puis répercutées dans les
curseurs et la sauvegarde. Vêtements et pilosité respectent la base choisie.

Import explicite, hors build normal : `node scripts/import-avatar-workshop.mjs`.
Le script copie les PNG sans les modifier et génère les modules ES du moteur de
l’atelier. Il réduit les limites des caches pour le contexte joueur et applique
les réglages de nez autour de leur pivot existant au portrait assemblé, en tenant
compte de leur position dans les limites de placement de la bouche.
Le jeu ne dépend pas du dossier `.Tmp` ni du serveur de l’atelier à l’exécution.
L’import utilise aussi Python/Pillow pour mesurer les zones visibles des vignettes
une seule fois ; aucune analyse de pixels de vignette n’est faite chez le joueur.

L’accueil connecté, le profil personnel et l’atelier affichent le solde du compte
avec `GobblarsBalance`. Les tarifs sont définis dans `shared/avatarUnlocks.js`.
Les deux visages sont payants (500 gobblars), sans kit offert. L’image fournie par
Paul, copiée dans `public/avatars/default.png`, est utilisée tant qu’aucun avatar
entièrement débloqué n’est enregistré. Les couleurs et les cils restent libres ;
aucun prix n’a encore été demandé pour les cils. Les auras affichent leur objectif
mais leur attribution reste désactivée.

Un nouveau joueur commence par le choix Homme/Femme, sans yeux, nez, bouche,
sourcils ni cheveux présélectionnés. `createBlankAvatar` conserve les pièces
explicitement vides, y compris après sauvegarde ; les avatars existants gardent
leurs réglages. La base coûte seule 500 gobblars.

Chaque vignette payante ouvre `AvatarAssetDialog`, une fenêtre native de
confirmation avec aperçu, prix et solde. L’achat ne porte que sur cette pièce.
« Continuer l’essai » laisse son aperçu sans achat ; la sauvegarde reste bloquée
tant qu’une pièce sélectionnée n’est pas acquise. Les vignettes d’objectifs
ouvrent leur condition et progression. Il n’y a plus de panier global ni de bouton
« Déblocages… ». `/api/auth/avatar/inventory` lit les possessions et la progression ;
`POST /api/auth/avatar/purchase` valide les identités et les prix côté serveur.
Le débit du vrai portefeuille, les droits permanents et la ligne du journal sont
écrits dans une seule transaction SQLite. Une relance ne facture pas deux fois.
La sauvegarde et la lecture des avatars vérifient les droits. Les anciennes
configurations de test sont conservées en base mais ne donnent aucun droit gratuit.

La migration `2026-09-19-avatar-unlocks.sql` initialise une date de départ unique
pour la couronne. Seuls les nouveaux résultats or des mini-tournois réels sont
inscrits, avec une clé compte/tournoi anti-doublon. Ni les statistiques historiques
ni les médailles de démonstration ne sont importées. Le seuil est de 100 victoires.
Cette date commence à l’initialisation du backend avec ce code, pas à l’ouverture
de l’atelier ; rejouer la migration ne la décale pas.

## Étiquette de participant et récompenses en jeu

L’étiquette se choisit dans **Accessoires** après 100 bonnes réponses aux questions
de Julien Lechéper. Le pseudo courant est dessiné au marqueur (police Caveat locale)
sur un badge ovale blanc à bord bleu (`participant-tag-oval.svg`), à gauche pour
le spectateur, en face des médailles. Son texte
n’entre pas dans la sauvegarde : un changement de pseudo est repris au prochain
affichage. Profil, atelier, récap et poses du podium utilisent le même compositeur.
Le compteur `lepersCorrectAnswers` apparaît dans le profil et continue après 100.

`shared/avatarObjectives.js` décrit les récompenses en jeu, leur compteur, seuil
et asset. Il étend aussi le catalogue runtime avec les nouveaux accessoires,
sans modifier les sources de l’ancien atelier. Pour un futur objectif, y déclarer
la récompense et raccorder un événement de progression validé côté serveur.

La migration `2026-09-19-game-avatar-objectives.sql` crée les compteurs indexés,
les reçus anti-doublons et les notifications en attente. Les anciennes victoires
déjà comptées pour la couronne sont conservées ; les réponses de Julien commencent
à l’activation de cette migration, sans reconstituer un historique inexistant.
Le serveur compte une réponse validée par compte/question, hors entraînement et
bots. `avatarObjectiveBatcher` regroupe les réponses sur 350 ms, avec au plus
128 événements par transaction et un seul travail de persistance simultané.
Les écritures passent par le worker existant. Aucun polling ni aller-retour client
n’est ajouté pour chaque réponse ; les lectures utilisent le compteur enregistré.

Le franchissement du seuil attribue l’asset et sa notification dans la même
transaction. Un événement socket privé annonce les nouvelles récompenses ;
`GET /api/auth/avatar` reprend aussi les annonces manquées après déconnexion.
`createAvatarRewardNotifier` déduplique les livraisons et regroupe les accusés de
réception (`POST /api/auth/avatar/rewards/ack`). Le toast commun montre l’asset,
son nom et l’objectif atteint ; la couronne utilise déjà ce même parcours.

**Test visuel sans compte ni backend :** ouvrir `/dev/avatar-rewards/` sur le Vite
local. Modifier le pseudo, passer de 99 à 100, rejouer le toast, comparer celui de
la couronne, essayer l’atelier et changer visage/chapeau/médailles. Les comptes et
leurs statistiques ne sont jamais modifiés depuis cette page. Un lien existe aussi
sur `/dev/avatar-profile/`. Compilation :
`node ./node_modules/vite/bin/vite.js build --config dev/avatar-rewards/vite.config.mjs`.

Tests de progression/notifications :
`node --test server/tests/avatarUnlocks.test.js server/tests/avatarObjectiveBatcher.test.js src/features/avatar/avatarRewardNotifier.test.js`.
La planche `.Tmp/avatar-profile-review/participant-tags.png` est générée par
`scripts/render-avatar-review.mjs`, avec la vraie police et les vrais assets.
L’activation du compteur dans une partie nécessite le chargement de ce code par
le backend ; les tests et la page d’aperçu ne démarrent ni ne redémarrent celui-ci.

Les ressources avatar du service worker vérifient le type des réponses : une page
HTML de secours ne peut plus rester en cache comme image. Le catalogue est rafraîchi
et les échecs de décodage déclenchent une purge ciblée, puis un nouvel essai. Les
portraits affichent un bouton de réessai si le rendu reste indisponible.

Tests achats et cache : `node --test server/tests/avatarUnlocks.test.js src/features/avatar/avatarAssetCache.test.js`.
La page `/dev/avatar-profile/` contient aussi un parcours **Nouveau joueur** avec
25 000 gobblars fictifs, un cas **Solde insuffisant** à 400 gobblars et des cas
couronne à 99/100 victoires. Aucun achat réel depuis cette page.

Vérifications ciblées :
`node --test server/tests/accountAvatar.test.js src/features/avatar/avatarState.test.js src/features/avatar/avatarStore.test.js src/features/avatar/avatarCatalog.test.js src/features/avatar/avatarApi.test.js`.

Profils/médailles : `node --test shared/dailyMedals.test.js server/tests/avatarPresentation.test.js`.
`node scripts/render-avatar-review.mjs` produit les planches de contrôle dans
`.Tmp/avatar-profile-review`, avec le vrai moteur et un canvas natif, sans
démarrer le backend. La page Vite `/dev/avatar-profile/` permet de comparer
les six cas de médailles, changer la tenue et contrôler toutes les vignettes
avec des données fictives. Son atelier ne modifie aucun compte réel.

Ajouts du 20 septembre : les yeux `dots` et `iris_only` sont ajoutés au catalogue
partagé par `withAvatarAccessories`, à 1 000 gobblars chacun. Leur ouverture est
fixe ; les points gardent leur taille et leur position réglables, les iris aussi
leur couleur. Les cils sont offerts après le premier déblocage d’yeux et requièrent
un modèle avec paupières pour être équipés (contrôle partagé client/serveur).

La peluche `accessories:tiger_plush` coûte 1 000 000 de gobblars. Elle suit le
cadrage du portrait, à gauche, et ne figure pas dans les petites vues du visage.
La migration `2026-09-20-tiger-plush.sql` l’attribue au compte enregistré Tigrou
lors de la mise en ligne du module ; elle ne débite aucun gobblar et est idempotente.
Le compte Tigre de la base locale a reçu ce déblocage séparément, sans redémarrage.
Le récap hebdomadaire utilise l’expression `happy`, sans modifier l’avatar sauvegardé.

Les auras or/argent/bronze suivent le podium de la course hebdomadaire précédente,
avec les identifiants de comptes du classement. `weeklyAvatarAuras` réconcilie les
trois droits au démarrage puis au lundi à 00 h, heure de Paris (date de remise à
zéro fournie par le classement, changements d’heure compris). Aucun polling en jeu.
La table `avatar_weekly_auras` garde au plus trois bénéficiaires, une échéance et
un reçu de notification chacun. Même rang consécutif : prolongation sans nouveau
toast. Autre rang : ancien droit retiré, nouveau droit et toast. Retour ultérieur :
nouveau reçu, qui ne peut pas être acquitté par un ancien appareil en retard.
Les gagnants absents voient le toast à leur connexion, tant que le droit est valide.

L’échéance est vérifiée par l’API et transmise comme métadonnée d’affichage ; le
client retire aussi l’aura à l’heure prévue sans requête réseau. Une aura expirée
ne masque jamais le reste du portrait. Les achats permanents et l’aura donateur
ne sont pas affectés. Les auras temporaires ne sont pas gravées dans le PNG du chat.
La page `/dev/avatar-rewards/` permet de gagner chaque aura, conserver son rang,
sortir du podium et observer une expiration accélérée en huit secondes.
Tests : `node --test server/tests/weeklyAvatarAuras.test.js`.

L’animation de gobblars utilise uniquement `sound/game/piece.wav`, à l’arrivée du
gain dans le compteur. La peluche est ancrée par les pattes au bord inférieur du
portrait, y compris lorsque le cadrage s’adapte à un chapeau.
