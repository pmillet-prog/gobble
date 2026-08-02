# Générateur du mini-jeu d’attente des manches cibles

Ce dossier contient la génération hors ligne et le chargement local Dev des
énigmes proposées aux joueurs qui ont déjà trouvé la cible d’une manche
`target_long` ou `target_score`. Les manches OCID sont exclues.

Le bouton du menu Dev arme la simulation pour la prochaine manche : il ne masque
plus la manche en cours. Au démarrage suivant, le laboratoire remplace localement
la grille centrale comme si la cible avait déjà été trouvée. Les choix de lettres,
la série et le mini-score prennent la partie haute du panneau latéral, tandis que
le flux live inférieur reste affiché. Le mini-score ne modifie pas le classement
de la manche cible. Chaque session dure 90 secondes et permet de comparer quatre
ou cinq choix.

## Génération

Commande par défaut :

```powershell
npm run target-wait:build
```

Commande paramétrée :

```powershell
node server\scripts\build-target-wait-puzzles.mjs --count 1000 --seed catalogue-v1
```

Utiliser `--help` pour afficher tous les seuils disponibles.

Le script :

1. charge `public/dico.txt` dans un trie compact dédié au calcul hors ligne ;
2. sélectionne des mots cibles de 7 à 11 lettres disposant d’une définition ;
3. place chaque cible sur un chemin légal d’une grille 4×4 ;
4. retire une lettre simple du chemin ;
5. résout les 26 remplacements possibles de la case vide ;
6. conserve une grille seulement si la cible est son unique mot le plus long ;
7. choisit jusqu’à quatre leurres produisant plusieurs autres mots naturels avec la case vide ;
8. déduplique les rotations et symétries ;
9. écrit un catalogue compact et un rapport de contrôle détaillé.

Tous les calculs lexicaux sont réalisés par ce script. Le futur service live ne
devra effectuer qu’une sélection de grille et une comparaison de lettre en temps
constant.

## Garanties d’une énigme

- la réponse figure une seule fois parmi les choix ;
- la cible utilise la case vide et suit le chemin enregistré ;
- la cible est l’unique mot le plus long avec la bonne lettre ;
- chaque leurre affiché produit un mot strictement plus court que la cible ;
- chaque leurre affiché permet plusieurs mots utilisant réellement la case vide ;
- la bonne lettre permet aussi d’autres mots que la cible ;
- les mots utilisés pour qualifier les choix ont une définition, ont déjà été
  trouvés par des joueurs et ne sont pas marqués comme simples formes fléchies ;
- une option stricte permet de rejeter une grille si une lettre quelconque de
  l’alphabet, même non affichée, atteint la longueur cible.

## Fichiers produits

- `data/target-wait-puzzles.dev.json` : catalogue compact de 500 grilles utilisé
  par le laboratoire Dev ;
- `data/target-wait-puzzles.dev.report.json` : statistiques et échantillons de
  contrôle du catalogue Dev ;
- les chemins sans suffixe `.dev` restent les sorties par défaut destinées au
  futur service de production.

Exemple d’entrée compacte :

```json
{
  "id": "tw-000001",
  "grid": "YRIOLSLU_ANGERAR",
  "blankIndex": 8,
  "choices": ["E", "P", "G", "M", "I"],
  "answer": "I",
  "word": "GRANULAIRE",
  "path": [11, 15, 14, 10, 7, 6, 9, 8, 13, 12],
  "difficulty": 4
}
```

La grille compacte contient toujours 16 caractères. `_` représente la case vide
et `Q` représente une tuile `Qu`.

## Tests

```powershell
node --test server\tests\targetWaitPuzzleGenerator.test.js server\tests\targetWaitCatalogService.test.js server\tests\targetWaitGame.test.js
```

Les tests couvrent la normalisation, les tuiles `Qu`, les chemins légaux, le
solveur compact, l’analyse de la case vide, la déduplication géométrique, le
format du catalogue, les variantes quatre/cinq choix et le barème des séries.
