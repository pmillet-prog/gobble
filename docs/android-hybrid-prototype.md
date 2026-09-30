# Prototype hybride Android — 29 septembre 2026

Application indépendante `fr.gobble.hybrid.prototype`, construite dans
`android-hybrid`. Le wrapper TWA et la VM n'ont pas été modifiés pour ce lot.
L'APK debug s'installe à côté de Gobble ; il n'est pas destiné au Store en l'état.

## Version 0.4 — code web actualisable, médias natifs — 30 septembre 2026

Cette version remplace l'architecture des prototypes 0.1 à 0.3 : aucun HTML,
JavaScript, CSS, worker ou catalogue JSON du jeu n'est embarqué dans l'APK.
Le client vient du site et prend les mises à jour au prochain chargement du
document. Revenir d'une autre application conserve le document courant ; il
n'y a pas de rechargement imposé en pleine partie.

Le build web habituel génère `dist/native-assets.json`. Il faut déployer ce
fichier avec le reste du site ; aucune commande supplémentaire sur la VM.
Le manifeste décrit les versions SHA-256 des médias sélectionnés. Le natif
réutilise la réserve de l'APK si elle correspond à la version du site ; sinon
il télécharge, vérifie et conserve le nouveau fichier, même si son URL n'a pas
changé. Cache des téléchargements terminés limité à 64 Mio, 32 Mio par fichier.
Un manifeste absent ou invalide fait utiliser le site, sans ancienne version
embarquée en secours. API, sockets et URLs avec paramètres restent sur le web.

Réserve native `1ee78af8a423001c` : 40 fichiers, 13 347 831 octets avant
compression, uniquement images, polices, dictionnaire et sons sélectionnés.

Contrôle sur émulateur Android 16 / WebView 153.0.8010.36, via un serveur local et
`adb reverse`, sans toucher à la VM :

- deux versions successives du HTML, JS et CSS chargées avec le **même APK** ;
- image modifiée à URL identique, puis réutilisée sans téléchargement, y compris
  après redémarrage du processus ;
- passage dans les réglages Android et retour : même document et champ conservé ;
- manifeste absent/invalide : fichiers web courants ; maintenance HTTP visible ;
- vrai client Gobble chargé depuis le build web local : accueil, orientation
  portrait, tableau en paysage, Retour, reprise et audio partiel validés ;
- tests natifs : intégrité, fichier corrompu, téléchargement incomplet, requêtes
  concurrentes, chemins exclus et éviction du cache ;
- 11 tests JavaScript, build web, build Android et lint passent.

Scripts : `verify-web-updates.mjs`, `verify-hybrid-runtime.mjs`,
`verify-hybrid-bundle.mjs` et `test-media-cache.ps1` dans `scripts/android`.
Résultats : `.tmp/hybrid-measurements/web-updates.json` et `runtime-checks.json`.
Le test de reprise constate la conservation du processus ; il ne promet pas
qu'Android ne le détruira jamais sous pression mémoire. Ce n'est pas une mesure
de vitesse ni un test sur le téléphone de Paul.

APK : `android-hybrid/app/build/outputs/apk/debug/app-debug.apk`, version
`0.4-prototype` / code 4. SHA-256 :
`a43d4795ff5e0267f70260c47d3b90bb1812db47f1b7d9dbb3415aacccf77462`.
Installer par-dessus le prototype précédent une fois, puis utiliser les
déploiements web habituels pour le jeu. Aucun déploiement VM ni publication Store.

Les sections suivantes sont l'historique des anciens prototypes.

## Correctif 0.3 — 30 septembre 2026

Le podium affiche désormais les médailles du salon sur le buste, avec un cadrage
qui les laisse au-dessus du socle. Leur attribution après le préchargement des
portraits met à jour le canvas affiché sans refaire les poses ni l'animation.

Contrôles : rendu réel des neuf poses (trois avatars, dont un grand chapeau),
profils et cheveux, cycle de vie du podium ; contrôle navigateur en 1280 × 900
et 393 × 852, attribution/remise à zéro après préparation, sans nouveau
chargement. Compilation web, compilation Android et lint réussis.
Les captures sont dans `.Tmp/tournament-avatar-review`.
Ce lot de présentation a été vérifié dans Chrome ; il ne constitue pas un
nouveau test sur téléphone des fonctions natives, conservées depuis la 0.2.

APK : `android-hybrid/app/build/outputs/apk/debug/app-debug.apk`, version
`0.3-prototype` / code 3, installable par-dessus le prototype précédent.
SHA-256 : `1a7f2d399657604488e37ddea9078703cae5835857e0a870c5fee64b868c9a91`.
Aucune publication Store ni intervention VM.

## Correctif 0.2 — 30 septembre 2026

Le conteneur Android ajoutait les marges des barres système puis les transmettait
inchangées à la WebView. Celle-ci les exposait à nouveau au CSS : en phase de jeu
et de résultats, `env(safe-area-inset-top)` ajoutait une seconde marge blanche.
Le natif transmet maintenant zéro pour les seules zones qu'il a déjà réservées,
en conservant les événements de clavier. Approche décrite dans la
[documentation Android WebView](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets#the-zeroing-approach).

Reproduction sur Android 16 / WebView 153.0.8010.36, avec les vrais écrans du
didacticiel local, sans rejoindre de partie :

- APK 0.1 : marge CSS haute/basse de 24 px, en-tête du jeu décalé de 24 px.
- APK 0.2 : marges CSS nulles, en-tête à 0 px en jeu et dans les résultats.
- Clavier : hauteur visible de 866,29 à 553,90 px, puis retour à 866,29 px sans
  marge persistante et sans déplacement de l'en-tête.
- Portrait à l'accueil, paysage au grand tableau puis Retour : aucune marge CSS
  supplémentaire ; document conservé après rotation et reprise de l'application.
- Build Android, lint (0 erreur, 9 avertissements) et 11 tests JavaScript passent.

Mesures et captures : `.tmp/hybrid-measurements/insets-before.json`,
`insets-after.json` et les PNG associés. Vérification reproductible :
`node scripts/android/verify-hybrid-insets.mjs`.

APK : `android-hybrid/app/build/outputs/apk/debug/app-debug.apk`, version
`0.2-prototype` / code 2. SHA-256 :
`05b464483cfea82353e18c401f41c7e6b86adb9eefb73d3b82f7049c2e7ed37b`.
Paquet web : `f840424f10a2b460`, 138 fichiers vérifiés. Ce rebuild embarque aussi
la correction d'affichage de l'éponge. Aucune publication Store ni intervention VM.

Les résultats ci-dessous décrivent le premier prototype 0.1, conservés comme
référence des mesures initiales.

## Résultat fonctionnel vérifié

Sur l'émulateur `Medium_Phone_API_36.1`, Android 16, WebView 153.0.8010.36 :

- accueil React affiché, images chargées, absence de bouton plein écran ;
- portrait maintenu avec l'accéléromètre placé en paysage, sans plein écran web ;
- ouverture du vrai grand tableau par un appui tactile : paysage autorisé ;
- Retour Android : accueil et portrait rétablis ;
- rotations et Retour sans recréer le document React ;
- arrière-plan puis reprise depuis l'icône : document et portrait conservés ;
- son local récupéré et décodé, réponse partielle `206` de 16 octets vérifiée ;
- aucun service worker actif dans le prototype.

Ces vérifications ne constituent pas une validation de toutes les manches, du
clavier et de l'audio en partie, ni un test sur le téléphone de Paul.

## Ressources et mesures

Le paquet `b3ffe1679c9944bb` contient 138 fichiers, soit 17 385 936 octets avant
compression : code React et workers, médias critiques issus des manifestes du
jeu, polices locales, dictionnaire et deux sons. Tous les poids et SHA-256 ont
été vérifiés par `scripts/android/verify-hybrid-bundle.mjs`.

L'expérience compare le même code embarqué dans la même WebView. Seule la
source des médias sélectionnés change : serveur HTTPS ou APK. Trois passages
à cache froid et trois à cache chaud par variante ; les passages réseau ont
précédé ceux avec les fichiers embarqués. Les délais voulus de l'introduction
et des animations n'ont pas été modifiés.

| Mesure (médiane de 3 passages) | Médias réseau | Médias embarqués |
| --- | ---: | ---: |
| Octets transférés pour les médias sélectionnés, cache froid | 5 317 584 | 0 |
| Montage de l'accueil, cache froid | 8,27 s | 5,34 s |
| Montage de l'accueil, cache chaud | 4,85 s | 5,48 s |

Les temps présentent une forte dispersion : de 4,99 à 9,21 s pour l'accueil
avec médias embarqués à cache froid. Les valeurs mesurent le montage de
l'accueil, pas la fin de toutes ses animations, ni le temps complet depuis
l'appui sur l'icône Android. Les comptages réseau ne couvrent que les médias
sélectionnés ; API, ressources facultatives et polices Google restent en ligne.

Le gain de transfert est établi dans cet essai. Il n'y a pas de gain systématique
à cache chaud et aucun gain de fluidité en jeu n'est démontré. Les temps de cet
émulateur avec rendu logiciel ne doivent pas être extrapolés à un téléphone.
Ce n'est pas un comparatif complet TWA contre WebView.

Données brutes locales : `.tmp/hybrid-measurements/results.json` et
`.tmp/hybrid-measurements/runtime-checks.json`. Capture de l'accueil :
`.tmp/hybrid-screenshot.png`.

## Vérification et livraison locale

- 11 tests JavaScript ciblés passent (adaptateur natif, politique d'orientation,
  absence de bouton plein écran dans le wrapper).
- `assembleDebug` et `lintDebug` passent ; lint : aucune erreur, avertissements
  restant notamment sur les orientations fixes/grands écrans et les ressources
  de traduction du prototype.
- APK signé avec la clé debug :
  `android-hybrid/app/build/outputs/apk/debug/app-debug.apk`.
- SHA-256 : `34326fc40677390584c3d432ad63ba43a0f5d79e7cd32e08c650f9626fc6ebc2`.

## Suite avant production

Le prototype ne gère pas encore les packs de médias téléchargeables, leur quota
disque, leur mise à jour atomique et leur restauration après échec. Il ne remplace
pas non plus les intégrations Android à prévoir pour les notifications, les liens
de récupération, le partage et les fichiers. Les fichiers embarqués sont figés
dans cette version de l'APK.

L'étape utile suivante est une validation sur téléphone avec une session de test,
puis la décision sur le gestionnaire de packs. Voir les commandes et le périmètre
détaillé dans [android-hybrid/README.md](../android-hybrid/README.md).
