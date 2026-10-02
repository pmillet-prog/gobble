# Gobble Prototype Android

Prototype indépendant de la TWA publiée, installé sous `fr.gobble.hybrid.prototype`.
Il utilise une WebView appartenant à l'application, conserve la page lors des
changements d'application et gère l'orientation via Android, sans bouton plein écran.
La connexion reste séparée de celle du navigateur et de la TWA.

## Code web et médias natifs (depuis la version 0.4)

Le HTML, le JavaScript, les CSS, les workers et les catalogues JSON viennent du
site. Ils ne sont plus embarqués ni servis depuis l'APK. Un déploiement web
ordinaire suffit pour les corrections du jeu et de l'interface, sans mise à jour
sur le Store. Une nouvelle version native reste nécessaire pour modifier le wrapper.

`npm run build` produit aussi `dist/native-assets.json`, à déployer avec le reste
de `dist`. Aucune commande serveur ni étape manuelle supplémentaire. Ce manifeste
décrit les médias utilisés, leur taille et leur SHA-256 : 867 fichiers. Depuis la
version 0.6, la réserve APK est un sous-ensemble distinct, limité à 30 Mio : boutons
de tous les écrans, fonds, polices UI et Grand Tableau, dictionnaire, petits visuels
et sons UI. Les calques d'avatars, musiques, sons de jeu, textures décoratives et
animations des présentateurs sont téléchargés puis mis en cache à leur première
utilisation. Ils restent tous décrits par le manifeste web et disponibles dans
l'application. Les fichiers sont lus à la demande, sans être tous chargés en mémoire.
Les références directes du client et les catalogues d'avatars alimentent cette
sélection, complétée par les familles dont les noms sont construits à l'exécution.
Les sources graphiques et anciens exports inutilisés ne sont pas copiés.
La réserve 0.6 contient 106 fichiers (24,47 Mo avant compression), pour un APK
debug de 20,21 Mo. Les autres médias restent accessibles et sont mis en cache à
la demande, dans la limite de stockage décrite ci-dessous.

À chaque navigation principale, le natif lit le manifeste HTTPS sans réutiliser
une réponse HTTP périmée. Un fichier identique est servi depuis l'APK ou le cache
privé. Un fichier modifié sous le même nom est téléchargé, vérifié puis conservé
sur disque ; les fichiers inchangés ne sont pas téléchargés à nouveau. Le cache
des téléchargements terminés est limité à 64 Mio, avec éviction des plus anciens,
et chaque fichier à 32 Mio. Les téléchargements sont dédupliqués et validés avant
leur publication ; les réponses audio permettent les plages d'octets.

Si le manifeste manque (ancien déploiement), est invalide ou indisponible, la
WebView charge les médias depuis le site. Elle ne substitue jamais arbitrairement
un ancien asset de l'APK. Les ressources absentes du manifeste, API et sockets
suivent également le chargement web habituel. Les URLs avec paramètres aussi,
à l'exception du seul paramètre `v` des sons publics : leur version reste vérifiée
par l'empreinte du manifeste courant. Les paramètres de nouvelle tentative
(`asset_bust`) conservent leur passage par le web. Les
pages de maintenance sont celles du site. Aucun cookie n'est envoyé par le cache
natif de médias publics ; les sessions restent gérées par la WebView.

Le service worker du site n'est pas enregistré dans cet hôte ; le cache natif
possède les médias sélectionnés et la WebView son cache HTTP normal. Le natif
ne mélange pas des morceaux de code issus de plusieurs versions embarquées.

## Reprise et affichage

Revenir d'une autre application ne recharge pas le jeu et ne force pas une mise
à jour en pleine partie. Le document, les champs et l'historique sont conservés
tant qu'Android garde le processus en mémoire. Les nouvelles versions web sont
prises au prochain chargement du document. Android peut toujours détruire un
processus sous pression mémoire ; ce cas utilise la récupération de session du jeu.

Sur l'accueil, tirer vers le bas puis relâcher actualise le document et son
manifeste de médias. Ce geste est désactivé dans les autres écrans, pendant une
partie ou une connexion, avec une fenêtre ouverte, un champ actif ou une zone
défilée. Les gestes horizontaux, trop courts ou à plusieurs doigts sont ignorés.
Il faut installer l'APK 0.5 ou supérieur et déployer le client web correspondant
pour l'activer. Le manifeste publié doit également contenir les médias ajoutés :
un APK récent avec l'ancien manifeste de 40 fichiers continue de charger les
polices et le fond du Grand Tableau par le web.

Portrait par défaut ; paysage autorisé sur le grand tableau ou selon le réglage
du joueur. Rotation, Retour et reprise ne recréent pas l'activité. Le conteneur
natif réserve les barres système et transmet des marges nulles à la WebView,
tout en conservant les événements du clavier (correctif 0.2).

La passerelle native, de protocole 1, n'accepte que la fenêtre principale de
`https://gobble.fr`. Elle expose l'orientation, l'actualisation et des compteurs de diagnostic,
sans accès générique aux fichiers ni exécution arbitraire. Les liens externes
s'ouvrent hors de la WebView.

## Construire

Prérequis : Node et dépendances du dépôt, JDK 17+, Android SDK 37, dépendances
Maven téléchargées. Android 7+ et une WebView avec `WEB_MESSAGE_LISTENER` et
`DOCUMENT_START_SCRIPT` sont requis.

```powershell
npm run build
.\scripts\android\build-hybrid.ps1 -Offline
node scripts/android/verify-hybrid-bundle.mjs
```

La première commande construit le site à déployer. La deuxième prépare les
médias et construit le wrapper, sans compiler ou embarquer le code React.
`-SkipWebBundle` conserve la réserve de médias déjà préparée ; son nom est
conservé pour compatibilité. Sans `-Offline`, Gradle peut récupérer ses dépendances.

APK debug signé avec la clé de développement, à installer par-dessus le prototype :
`android-hybrid/app/build/outputs/apk/debug/app-debug.apk`.
Il reste distinct de Gobble publié et n'est pas destiné au Store en l'état.

## Vérifications reproductibles

```powershell
.\scripts\android\test-media-cache.ps1
node --test scripts/android/media-manifest.test.mjs src/features/mobile/nativeHost.test.js src/features/mobile/nativePullToRefresh.test.js src/features/layout/screenOrientation.test.js src/utils/displayMode.test.js
adb -s emulator-5554 install -r android-hybrid/app/build/outputs/apk/debug/app-debug.apk
node scripts/android/verify-web-updates.mjs
```

Le dernier test utilise un serveur local et `adb reverse`, sans VM. Il simule
deux déploiements web avec le même APK, un asset remplacé à URL identique, sa
réutilisation après redémarrage, les manifestes absents/invalides, la maintenance,
le passage à une autre application puis le vrai client Gobble et ses rotations.
Il contrôle aussi les médias ajoutés et le geste de rafraîchissement de l'accueil.
Captures et mesures : `.tmp/hybrid-measurements`. Ce contrôle requiert un émulateur.
La redirection vers la boucle locale est réservée aux builds debug et activée
explicitement par le test ; les builds release restent limités à HTTPS Gobble.

`verify-hybrid-insets.mjs` contrôle les écrans du didacticiel et le clavier sur
WebView 144+. `measure-hybrid.mjs` compare médias web et cache natif pour le même
site déployé ; ne pas déployer pendant la comparaison. Ce n'est pas un comparatif
avec la TWA ni une mesure sur le téléphone de Paul.

`measure-chalkboard.mjs` rejoue une copie JSON du tableau public rempli et son
catalogue de polices depuis `.tmp/hybrid-measurements`. Il mesure l'API, les polices,
la texture et les jobs du worker jusqu'au rendu visible, puis la réouverture.
`GOBBLE_CHALKBOARD_VARIANTS` choisit `native-live`, `native-current` ou `web-media` ;
`GOBBLE_CHALKBOARD_SAMPLES` règle le nombre de passages. Ces variantes conservent
la même WebView : elles ne constituent pas une comparaison avec Chrome ou la TWA.
Utiliser un émulateur accéléré (`-gpu host`), le rendu logiciel étant trop lent
sur les contributions riches en particules. Aucun contenu n'est publié par le test.

## Limites

Pas encore de notifications, de partage ou de sélecteur de fichiers natif.
Le code web, les catalogues et le jeu en ligne requièrent le
réseau. La compatibilité complète des manches et des usages doit être validée
avant de remplacer l'application publiée. Bilan : [prototype](../docs/android-hybrid-prototype.md).

Aucun déploiement VM, redémarrage du backend ou publication Store n'est effectué
par ces scripts.

Références : [WebViewClient](https://developer.android.com/reference/android/webkit/WebViewClient),
[cache HTTP de WebView](https://developer.android.com/reference/android/webkit/WebSettings#setCacheMode(int)).
