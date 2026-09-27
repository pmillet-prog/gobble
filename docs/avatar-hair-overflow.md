# Coiffures et vignettes — correction du débordement

Les calques de coiffure conservent maintenant leurs coordonnées hors du carré
d’origine, y compris pendant l’application des masques anatomiques et des
couvre-chefs. Le cadrage visage réserve la hauteur nécessaire. Les réglages
enregistrés et les images sources ne changent pas.

`hair-fitting.js`, `lot_005_renderer.js` et `lot_007_renderer.js` dans
`src/features/avatar/renderer` sont désormais maintenus dans le jeu. L’import
de l’atelier actualise toujours les assets et les réglages, mais préserve ces
modules. L’adaptation du cadrage de `lot_002_renderer.js` reste dans l’importeur.

## Vignettes existantes

Le rendu des nouvelles vignettes porte la version 2. Pour mettre à jour les PNG
déjà stockés, après installation du code et des assets corrigés, utiliser le
script explicite ci-dessous sur la base d’authentification voulue :

```sh
node server/scripts/rebuild-avatar-thumbnails.mjs --db="chemin/auth.sqlite"
node server/scripts/rebuild-avatar-thumbnails.mjs --db="chemin/auth.sqlite" --apply
```

Sans `--apply`, il compte seulement les vignettes absentes ou obsolètes en
lecture seule. Avec `--apply`, il les régénère séquentiellement dans un worker,
sans modifier les configurations, révisions ou dates de sauvegarde des joueurs.
Une modification concurrente d’avatar fait ignorer le résultat devenu périmé.
Le script est reprenable ; les vignettes déjà à jour ne sont pas recalculées.
Il ne démarre et ne redémarre aucun serveur.

Les URL des miniatures incluent la version de rendu pour renouveler le cache
du navigateur au chargement du nouveau client. Les lectures chat/classement
continuent de servir des PNG préfabriqués, sans relancer le moteur de rendu.

La régénération sur la VM et le déploiement ne sont pas exécutés par les tests locaux.
