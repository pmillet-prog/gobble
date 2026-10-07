# Présentateurs et bilan de manche

Ces pages rendent les composants React réels avec des données en mémoire. Elles
ne lancent pas le backend Gobble et ne se connectent pas à une partie publique.

Depuis la racine du dépôt, lancer le serveur frontend uniquement :

```powershell
node --preserve-symlinks --preserve-symlinks-main dev/presenter-results/serve.mjs
```

- Présentateurs et vocabulaire : http://127.0.0.1:8771/dev/presenter-results/
- Bilan QPUC et définitions : http://127.0.0.1:8771/dev/presenter-results/definition.html

Le serveur dédié précompile React ; celui de l'atelier des avatars sur 8770 ne
précompile pas les dépendances JSX de ces composants.

Vérifications navigateur (Chromium installé localement) :

```powershell
node --preserve-symlinks --preserve-symlinks-main dev/presenter-results/verify.mjs
$env:PRESENTER_REVIEW_ORIGIN = 'http://127.0.0.1:8771'
node --preserve-symlinks --preserve-symlinks-main dev/presenter-results/verify-definition.mjs
```

`PRESENTER_RESULTS_ORIGIN` permet de changer l'origine du premier script.
`CHROME_PATH` permet d'utiliser un autre exécutable Chromium. Sur Windows, le
sandbox peut bloquer le processus graphique ou esbuild ; ces deux commandes
nécessitent alors un lancement hors sandbox.

Les contrôles des présentateurs couvrent l'attente avant montage de l'overlay,
son affichage et son saut, le blocage des clics et demandes programmatiques,
la distinction question/réponse de Julien, la protection d'une réponse encore
illisible, sa reprise après une sortie de l'écran, et le changement de manche.
Ils enregistrent leurs captures et résultats sous `.tmp/presenter-results/`.
Ces scénarios isolés ne remplacent pas une vérification dans une partie réelle.
