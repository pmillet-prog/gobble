# Pools d’entraînement

Les entraînements autonomes utilisent exclusivement des grilles 4×4 pré-générées. Les dix
catégories correspondent aux manches du jeu, hors OCID. La génération ne lit ni n’écrit dans
`gobble.db`. Le dictionnaire et la base de rareté servent uniquement de sources locales en
lecture pendant la fabrication des grilles.

## Génération

```powershell
npm run training:pool:build
```

La commande produit par défaut 300 grilles par catégorie dans `data/training-pools`. Elle peut
être interrompue puis relancée : un point de reprise est écrit toutes les dix grilles.

Options utiles :

```powershell
npm run training:pool:build -- --mode finale --count 300 --workers 4
npm run training:pool:build -- --help
npm run training:pool:verify
```

Chaque résultat doit franchir les critères de qualité du mode. Les rotations et symétries d’une
même grille sont considérées comme des doublons.

## Fichiers

Chaque catégorie possède :

- `<mode>.jsonl` : une grille complète par ligne, avec ses solutions côté serveur ;
- `<mode>.index.json` : identifiants, offsets et longueurs en octets ;
- `<mode>.report.json` : rapport de qualité et statistiques de génération.

`TrainingPoolStore` met seulement les petits index en cache. Lors d’un tirage, il lit la tranche
correspondant à une seule grille dans le fichier JSONL. Aucun catalogue complet n’a donc besoin
d’être chargé en mémoire et aucune file SQLite n’intervient dans le jeu.
