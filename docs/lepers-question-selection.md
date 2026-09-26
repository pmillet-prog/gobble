# Questions de Julien Lechéper

Le sélecteur utilise les solutions de la grille, les critères de rareté existants
et les définitions locales. Il exclut désormais les mots et définitions des
100 dernières questions retenues pour une manche démarrée. La comparaison des
définitions ignore la casse, les accents, la ponctuation et les espaces multiples.
Un mot récent reste exclu même si une autre définition est disponible.

Le worker filtre l'historique avant de consulter les définitions des 72 meilleurs
mots admissibles. Pour un mot non exclu, il peut choisir un autre sens si sa
première définition a déjà été posée. Il renvoie les candidats classés au serveur.
Au démarrage de la manche, le serveur vérifie l'historique courant et choisit
parmi les huit meilleurs candidats encore admissibles. Si aucun ne reste, il
n'y a pas de question pour cette manche ; aucun repli ne réutilise une question
récente. Les autres critères de sélection et les bonus restent inchangés.

L'historique de l'unique salon est détenu par le processus serveur et enregistré
dans `GOBBLE_DATA_DIR/lepers-question-history.json` (par défaut dans `data/`).
Il est chargé avant le démarrage des manches et écrit de façon asynchrone,
ordonnée et par remplacement du fichier. Préparer puis abandonner une grille
ne consomme pas de question. Le contrôle final protège contre les historiques
de préparation devenus obsolètes. En cas d'échec d'écriture, une erreur est
journalisée et la protection reste active en mémoire.

Au premier lancement avec cette fonctionnalité, l'historique commence vide :
les anciennes questions ne sont pas reconstituées. Il ne faut pas écraser ce
fichier lors des mises à jour.

## Liste des mots jamais trouvés

Cette liste est un instantané figé dans `data/word-rarity.sqlite` (ou
`GOBBLE_WORD_RARITY_DB`). Le service la lit avec `OPEN_READONLY` et
`PRAGMA query_only = ON`. Trouver un mot en partie ne le retire pas de la catégorie
`never_found`. La base est reconstruite seulement par le script manuel
`server/scripts/build-word-rarity.mjs` (`npm run rarity:build`), à partir d'un
export des statistiques. Ne pas ajouter de mise à jour automatique de cet
instantané. L'historique de Julien est indépendant de cette classification.

## Validation locale

```powershell
node --test server/tests/lepersChallenge.test.js server/tests/lepersQuestionHistory.test.js server/tests/lepersLive.test.js server/tests/lepersLivePresentation.test.js
```

Les tests vérifient l'exclusion des mots et définitions, le renouvellement des
candidats avant la limite des 72 recherches, les préparations obsolètes,
l'expiration après 100 questions, la persistance et les erreurs d'écriture.
Ils utilisent des fichiers temporaires et ne démarrent pas le backend.
