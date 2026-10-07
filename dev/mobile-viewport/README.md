# Vérification locale du viewport mobile

Depuis la racine du dépôt :

```powershell
node --preserve-symlinks --preserve-symlinks-main dev/mobile-viewport/verify.mjs
```

Le script démarre uniquement Vite sur `127.0.0.1:5186` et un Chrome headless avec un profil dédié sous `.tmp/mobile-viewport-review`, puis ferme ces deux processus. Il ne démarre ni ne contacte le backend Gobble. Les polices Material utilisées en production peuvent être chargées depuis Google Fonts. `CHROME_PATH` permet de choisir le binaire Chromium ; `MOBILE_VIEWPORT_ORIGIN` permet de réutiliser une fixture frontend déjà démarrée.

La fixture monte les vrais `HomeLobby`, `LiveSalonScene`, `MobileStandardPlaying`, `MobileHeader`, `MobileGrid` et `ChatStyleSlide`. Les feuilles CSS sont celles de production. Le tracker de viewport et les verrous de document sont également réels. Les données de partie, de classement et de chat sont en mémoire ; aucune session multijoueur n'est simulée côté serveur. Le dimensionnement des blocs de la partie est fourni par la fixture : ce test ne remplace pas une vérification du contrôleur complet de layout de l'application.

## Scénarios automatisés

- Portrait 440 × 956, marges système haute/basse de 62/34 px ; 440 × 894 avec barre de statut déjà réservée et marge basse de 34 px ; Android 412 × 915 et marge basse de 24 px.
- Accueil après rechargements et réductions de hauteur, boutons du bas accessibles.
- Chat ouvert en partie : grille et en-tête stables, champ visible, focus et brouillon conservés pendant trois cycles de clavier ; restauration des dimensions à la fermeture.
- Réduction du seul viewport visuel avec décalage vertical, puis réduction réelle du viewport de mise en page à la manière d'un conteneur Android qui se redimensionne.
- Salon en portrait et en paysage 956 × 440, marges latérales de 62 px et clavier simulé laissant 220 px disponibles.
- Restitution des styles du document après démontage de tous les écrans propriétaires du verrou.

Les insets CSS sont injectés par `Emulation.setSafeAreaInsetsOverride`. Les événements et mesures du clavier sont injectés dans `visualViewport`. Pour vérifier l'immobilité physique lors d'un pan, les positions comparées sont `getBoundingClientRect().y - visualViewport.offsetTop`. Les images restent des captures du navigateur de bureau ; elles ne montrent pas un véritable clavier iOS.

Passage final du 6 octobre 2026 : **103 assertions passent sur 69 états mesurés, aucune exception navigateur**. Ces résultats concernent la fixture et les simulations décrites ici. En paysage, les contrôles sont vérifiés hors des encoches et `elementFromPoint` confirme que le bouton Envoyer n'est pas recouvert par les réglages.

Le rapport JSON et les captures PNG sont écrits dans `.tmp/mobile-viewport-review`. Le rapport précise les dimensions, marges, rectangles DOM, focus, police du champ et échecs éventuels. HMR est désactivé pour que les modifications parallèles du dépôt ne rechargent pas la fixture au milieu d'une mesure.

Ajouter `--font-only` exécute uniquement la vérification de cascade de police du champ de chat et écrit `font-cascade.json`, sans remplacer le rapport complet. L'ancienne classe `text-sm` est ajoutée puis retirée dans le DOM pour comparer sa taille calculée avec le correctif.

La mesure du 6 octobre confirme **18 px avec le correctif, 14 px avec l'ancienne classe `text-sm`, puis 18 px après restitution** ; les quatre assertions de ce diagnostic passent.

## Limites et validation sur iPhone

Chrome sur Windows, même avec ces dimensions, n'est ni Safari iOS ni le conteneur d'une PWA installée. Ce test valide nos calculs et leur application au DOM, pas les animations UIKit, le clavier système, l'attribution native de la zone de statut ou un bug propre à une version d'iOS.

Sur l'iPhone concerné, relever le modèle, la version iOS et la version du client. Vérifier l'installation existante puis une nouvelle installation de test, sans considérer une désinstallation comme nécessaire :

1. Ouvrir une partie depuis l'icône de l'écran d'accueil. Vérifier l'en-tête sous les icônes système et les commandes du bas au-dessus de l'indicateur d'accueil.
2. Pendant la partie, ouvrir le chat, toucher le champ, taper un message avec accents, l'envoyer, fermer puis rouvrir. Répéter dix fois ; tester aussi la fermeture du clavier système. La grille et l'en-tête ne doivent ni changer de taille ni rester décalés.
3. Refaire après passage en arrière-plan et retour, puis après rechargement. Tester l'accueil et le retour en partie.
4. Comparer le même parcours dans Safari. Sur Android, comparer wrapper TWA et prototype WebView, notamment après plusieurs rechargements.

## Références de conception

Apple décrit `apple-mobile-web-app-status-bar-style=default` comme réservant une zone distincte pour la barre de statut ; `black-translucent` autorise le contenu à s'étendre derrière cette barre. Garder `viewport-fit=cover` implique de respecter les insets résiduels dans le document. [Métadonnées Apple](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html), [zones sûres WebKit](https://webkit.org/blog/7929/designing-websites-for-iphone-x/).

Les rapports WebKit décrivent des incohérences spécifiques aux applications installées : marges sous `contain`, décalage inférieur sous `black-translucent`, et hauteurs divergentes sur certaines versions iOS. Ils motivent les scénarios de test sans démontrer la cause exacte sur l'appareil de Paul. [WebKit 236445](https://bugs.webkit.org/show_bug.cgi?id=236445), [WebKit 301994](https://bugs.webkit.org/show_bug.cgi?id=301994).
