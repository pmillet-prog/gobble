# Confort Android — premier lot

Implémenté localement le 23 septembre 2026 dans le client du jeu.
Le wrapper de référence est désormais `.tmp/wrapp`.
Aucun déploiement web, redémarrage du serveur ou envoi sur Google Play n'a été effectué.

## Comportements

- Écran maintenu allumé pendant une manche visible sur mobile : live,
  défi quotidien et entraînement. Libération à la fin, à la fermeture ou au
  passage en arrière-plan ; nouvelle demande au retour. Si le navigateur ou
  l'économie de batterie refuse, le jeu continue sans boucle de nouvelles demandes.
- Retour mobile : fermeture du panneau courant, retour depuis les écrans
  secondaires, puis confirmation avant l'abandon d'une manche. Les statistiques,
  le profil et son éditeur, les fenêtres natives d'achat, et le tableau avec
  son brouillon conservent leurs propres actions de fermeture.
- Un seul cran d'historique temporaire est utilisé et retiré à l'accueil.
  La navigation du navigateur sur ordinateur n'est pas interceptée.
- Indication « Reconnexion… » dans les en-têtes mobiles standard, compact et
  trois mots pendant une interruption du live. Appuyer dessus utilise le
  mécanisme existant de reconnexion, avec son contrôle de fréquence.
- Après installation du service worker lors d'une visite en ligne, une navigation
  hors connexion, un serveur en erreur 5xx ou une attente des en-têtes dépassant
  huit secondes affiche une page autonome avec « Réessayer ». L'URL d'entrée
  est conservée. Les erreurs 401/403 et les requêtes API ne sont pas masquées.
- Le premier lancement sans aucun chargement préalable reste dépendant du navigateur :
  le service worker ne peut pas encore fournir son écran de secours.
- Le secours réseau ne constitue pas un mode de parties multijoueurs hors connexion.

## Organisation

Les contrôleurs et hooks sont dans `src/features/mobile`.
`App.jsx` et `LegacyApp.jsx` n'ont pas été modifiés.
La logique précédente de protection de sortie et son dialogue ont été retirés
de `GobbleApplication.jsx` au profit des modules dédiés.
Aucun intervalle permanent ni recherche DOM par rendu n'a été ajouté.

Le service worker garde les caches existants d'images/avatars/tableau.
Son nouveau cache contient seulement les deux fichiers de secours :
`public/offline.html` et `public/offline-retry.js`.
Les bundles JavaScript/CSS et les données de jeu ne sont pas précachés :
en cas de panne au démarrage, le choix est d'afficher le secours autonome.

## Validation locale

27 tests passent, couvrant les courses des demandes de verrou d'écran, le retour
et la confirmation de sortie, le nettoyage des abonnements, les ouvertures
répétées, les refus d'économie de batterie, le réseau lent, le stockage indisponible,
la reconnexion existante et les caches d'avatars/tableau.

Commande :
```powershell
node --test src/features/mobile/mobileExperience.test.js src/features/mobile/offlineNavigation.test.js src/features/connection/createConnectionHealthFeature.test.js src/features/avatar/avatarAssetCache.test.js src/features/chalkboard/chalkboardTextureCache.test.mjs
node ./node_modules/vite/bin/vite.js build --outDir .tmp/android-mobile-build
```

Le build est destiné à une prévisualisation locale, pas à un déploiement.
Les avertissements Vite concernant la police `04B_30__.TTF`, la taille des
bundles et le format des modules existaient déjà dans le projet et restent présents.

## Vérifications sur téléphone avant publication

1. Manche live, défi quotidien et entraînement : mise en veille automatique,
   verrouillage manuel, retour dans l'application, fin de manche.
2. Retour gestuel et trois boutons : chat et clavier, paramètres/sous-panneaux,
   statistiques/profil/éditeur, abandon d'une manche, sortie depuis l'accueil.
3. Achat en attente et brouillon du tableau : le retour conserve les protections
   déjà présentes.
4. Mode avion après une visite en ligne, réouverture de l'application, « Réessayer »,
   puis retour du réseau ; panne temporaire du serveur.
5. Bascule Wi-Fi/données pendant une manche : apparition puis disparition du statut
   de reconnexion dans les trois présentations mobiles.

Aucune validation visuelle sur téléphone n'a été réalisée dans cette session.
Ces changements sont côté site : reconstruire seulement l'AAB ne les rendra pas
visibles dans l'application tant que le client web n'est pas déployé.

## Rotation du grand tableau dans le wrapper

Le wrapper de référence `.tmp/wrapp` autorise maintenant `any` dans
`twa-manifest.json` et `app/build.gradle`. `LauncherActivity` laisse aussi
l'orientation libre, sans imposer de portrait pendant le lancement.

Le jeu possédait déjà la demande de rotation libre sur le grand tableau.
La politique de `src/features/layout/screenOrientation.js` et son hook gardent
désormais le portrait hors tableau pour une application Android installée,
même si la présentation passe en desktop après la rotation. Le manifeste de la
PWA conserve son portrait par défaut ; aucune logique n'est ajoutée à `App.jsx`.

Validation : 26 tests d'orientation, de viewport/canvas du tableau et de layout
responsive passent :

```powershell
node --test src/features/layout/screenOrientation.test.js src/features/chalkboard/chalkboardViewport.test.mjs src/features/chalkboard/chalkboardCanvasWindow.test.mjs src/utils/desktopResponsiveLayout.test.mjs
```

La compilation web et les compilations Android release APK/AAB réussissent.
Android Lint ne signale aucune erreur (11 avertissements). Les artefacts du
wrapper ont été reconstruits dans `.tmp/wrapp/app/build/outputs`.

À vérifier sur un vrai téléphone avec le nouveau wrapper et le client web :
rotation dans les deux sens sur le tableau, retour au portrait en quittant le
tableau en paysage, dessin/brouillon conservé, arrière-plan/reprise.
Les anciens fichiers du wrapper dans `C:\Users\Paul\Desktop\wrapp` ne sont pas modifiés.

### Correction web après le retour sur l'application publiée

La rotation est désormais gérée par `ScreenOrientationSatellite`, monté dès le
chargement de l'interface, avant la fin de l'introduction. Le téléphone est
reconnu par son environnement mobile même si le wrapper n'expose pas de referrer
Android ou si le viewport devient assez large pour une présentation desktop.
Seule la vue `chalkboard` demande `any` ; les autres vues demandent `portrait`.
La sortie du tableau remplace directement le verrou, sans appeler `unlock()`
qui rétablirait la rotation libre choisie par le wrapper.

Le contrôleur réapplique la politique après reprise, changement de plein écran
ou rotation inattendue, et retente un refus initial à la prochaine interaction.
Les réponses tardives d'une ancienne demande ne peuvent pas annuler le portrait.
Cette correction nécessite le déploiement du client web, sans nouvelle version
Android. Le comportement matériel reste à confirmer sur le téléphone : les tests
locaux vérifient les demandes et leur cycle de vie, pas l'autorisation du navigateur.

## Lots suivants proposés

Les raccourcis de l'icône Android, le partage des résultats et les notifications
push restent à implémenter. Leurs propositions initiales sont dans
`.tmp/wrapp/ANDROID_UPDATE.md`.
Le lot présent n'ajoute ni abonnement aux notifications ni changement du serveur.
