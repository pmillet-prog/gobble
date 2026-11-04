# Vivier Gotus

Depuis la sélection du 1er novembre 2026, le jeu intégré utilise **6 567 cibles**
au lieu de 11 780. Les **17 991 mots autorisés comme propositions** restent admis,
y compris les mots retirés du tirage. Le serveur live et l’entraînement lisent
le même fichier `public/gotus/words.json`.

## Filtre léger

La classification grammaticale du Wiktionnaire reste la première condition :
infinitifs, participes passés et emplois non verbaux attestés. Les formes uniquement
conjuguées restent hors du tirage. La sélection utilise ensuite Lexique 4.10 :

- Si une mesure de familiarité est disponible, conserver les mots reconnus par
  au moins **50 %** des répondants (`Preval`, avec `PrevalNb > 0`).
- Sinon, conserver les mots dont la fréquence orthographique dans le corpus de
  sous-titres est d’au moins **0,02 occurrence par million** (`FreqOrtho`).
- Les mots absents de cette source sont écartés du tirage.

Le meilleur résultat parmi les graphies normalisées sans accents est retenu,
comme dans Gotus. Les lignes grammaticales d’un homographe ne sont pas additionnées :
`FreqOrtho` les regroupe déjà. Le filtre ne dépend pas des statistiques des joueurs
ni de la fréquence d’apparition des mots dans les grilles Gobble.

Exemples : `ALEVIN` reste une cible grâce à sa familiarité, malgré sa faible fréquence
dans les sous-titres ; `LITCHI` reste admis grâce au seuil de fréquence permissif.
`GABBRO`, `ORPHIE`, `ARILLE` et `BREDIN` restent valides comme propositions mais
sortent du tirage. Ce filtre réduit les mots obscurs ; il ne garantit pas que chaque
mot soit facile. Une absence dans le corpus ne signifie pas qu’un mot est incorrect.

Le rapport `data/gotus-word-selection.report.json` conserve les exclusions :
3 392 sans mesure, 724 sous le seuil de familiarité et 1 097 sous celui de fréquence.

## Génération reproductible

```sh
npm run gotus:words
node --preserve-symlinks --preserve-symlinks-main --test scripts/lib/gotusWordSelection.test.mjs
```

La génération courante est locale, sans téléchargement. Elle lit la banque
grammaticale `dev/motus/data/words.json` et l’extrait de mesures versionné
`data/gotus-word-familiarity.json`, puis produit la banque publique et le rapport.
Les seuils sont centralisés dans `scripts/lib/gotusWordSelection.mjs`.
Le navigateur ne télécharge que les listes finales : aucun calcul de fréquence
ni nouvelle requête par mot pendant une partie.

Pour renouveler les sources : générer d’abord la banque grammaticale avec
`npm run motus:words` si nécessaire, puis télécharger l’archive officielle
[Lexique 4.10](https://www.lexique.org/databases/Lexique410/Lexique4.1.zip) et en extraire
`Lexique4.1.tsv` dans `.tmp/motus/`.

```sh
npm run gotus:words -- --lexique .tmp/motus/Lexique4.1.tsv
```

L’import conserve uniquement les mesures des cibles grammaticalement admissibles,
avec les empreintes SHA-256 du TSV et de la banque source. Si cette dernière change,
une génération sans réimport est refusée pour éviter d’utiliser un extrait périmé.
Les lignes mal formées sont écartées et comptées dans le rapport. La génération
ne lance aucun serveur et ne modifie aucune donnée de joueur.

## Sources

- Classification grammaticale : Wiktionnaire français, dump local ; provenance
  par graphie dans `.tmp/motus/word-report.json`, CC BY-SA / GFDL.
- Familiarité et fréquences : [Lexique 4.10](https://www.lexique.org/), Boris New,
  Christophe Pallier, Gauvain Schalchli, Jessica Bourgin et Manuel Gimenes,
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- Présentation scientifique : New et al. (2026),
  [Lexique 4: A major upgrade of the Lexique French lexical database](https://doi.org/10.3758/s13428-026-02967-5).

L’extrait de mesures et la sélection de données dérivée sont distribués sous
CC BY-SA 4.0. L’attribution accompagne la banque publique dans ses métadonnées et
dans `public/gotus/WORDS-LICENSE.txt`. Le TSV complet n’est pas distribué avec le jeu.
