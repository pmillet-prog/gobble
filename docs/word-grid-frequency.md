# Fréquence de présence des mots dans les grilles

Cette mesure répond à « dans quelle proportion de grilles ce mot est-il
traçable ? », indépendamment des mots trouvés par les joueurs. Elle sert à
choisir les entrées d'un futur dictionnaire humoristique.

## Utilisation

Depuis la racine du dépôt, avec les dépendances Node du projet et du serveur
déjà installées :

```sh
npm run words:frequency
```

Par défaut : 1 000 grilles classiques 4×4, deux workers locaux maximum.
Prévoir plusieurs minutes : toutes les grilles candidates passent par le vrai
solveur, et seules les grilles retournées constituent les observations.
Le script importe le worker de calcul existant, jamais `server/index.js`.
Il ne lance ni serveur HTTP ni partie, ne contacte pas la VM et ne modifie
ni les données des joueurs ni la base des mots rares/jamais trouvés.

```sh
# Premier échantillon rapide
npm run words:frequency -- --count 100 --output-dir .tmp/frequency-pilot

# Comparer séparément les trois types fixes du mini-tournoi
npm run words:frequency -- --modes normal,massive_boggle,finale --count 10000

# Tous les types pris en charge : count grilles PAR type, calcul plus long
npm run words:frequency -- --modes all --count 1000

# Tableau limité aux mots de 5 à 9 lettres, sans changer les grilles générées
npm run words:frequency -- --count 10000 --min-length 5 --max-length 9
```

`--workers` accepte 1 à 8 ; plus de workers consomment davantage de mémoire,
car chacun charge le dictionnaire et, si nécessaire, la base de rareté.
`--timeout-ms` limite une préparation (120 secondes par défaut).
`--seed` permet de choisir un autre échantillon. À code, dictionnaire et base
de rareté identiques, une graine donnée produit les mêmes observations,
indépendamment du nombre de workers. Augmenter `--count` avec la même graine
étend l'échantillon initial : ne pas additionner les deux rapports, qui se
recouvrent. Aucun fichier de reprise n'est nécessaire ; le calcul repart du début.

## Tableau produit

Le dossier de sortie doit être nouveau ou vide. À défaut de `--output-dir`,
un dossier daté est créé sous `.tmp/word-grid-frequency/`.

- `index.html` : tableau autonome à ouvrir dans un navigateur, avec recherche,
  choix de manche, filtre de longueur, tri et pagination.
- `frequencies.csv` : tableau complet, UTF-8 avec BOM, séparateur point-virgule
  et virgule décimale pour Excel en français.
- `report.json` : résultats, effectifs, paramètres exacts, durée, version Node
  et empreintes SHA-256 des fichiers de génération et des données utilisées.

Colonnes : type de manche, rang, mot, longueur, nombre de grilles contenant le
mot, nombre de grilles analysées de ce type, fréquence en pourcentage,
intervalle de confiance de Wilson à 95 %, nombre moyen de grilles par apparition.

Exemple : un mot présent dans 250 grilles sur 10 000 a une fréquence estimée
de 2,5 %, soit une présence dans une grille sur 40 en moyenne. Ce n'est pas
une garantie d'apparition toutes les 40 manches.

## Méthode et limites

Les grilles passent par `server/compute/worker.js` et ses critères de richesse,
grilles ancrées, bonus et variantes. Les plans viennent de
`server/training/trainingPoolConfig.js` : leurs paramètres de génération sont
actuellement identiques à ceux des types correspondants du salon live 4×4
(base : 150 mots). Il ne s'agit pas d'un échantillon du catalogue d'entraînement
préfabriqué. Lors d'une évolution des règles live, vérifier cette correspondance.

Chaque solution est normalisée comme dans le jeu. Un ensemble par grille
évite de compter plusieurs chemins du même mot. Les pluriels, formes conjuguées
et autres mots distincts ne sont pas fusionnés. Les tirages de grilles identiques
sont conservés : les éliminer fausserait leur probabilité naturelle.

Le générateur peut renvoyer sa meilleure grille de repli sans atteindre tous
ses objectifs de qualité. Elle reste dans l'échantillon, comme dans le chemin
live de préparation ; le rapport dénombre ces replis. Une préparation sans
résultat est retentée au maximum trois fois par observation et ne compte pas
dans le dénominateur. Un résultat mal formé, une panne ou un délai dépassé arrête
l'analyse, sans inventer de grille ni de fréquence nulle.

Les types de manches restent séparés : un échantillonnage égal de chaque type
ne représente pas leur proportion dans un mini-tournoi. Aucun classement global
pondéré n'est calculé. Les forçages du menu développeur ne sont pas reproduits.
Le défi thème est désactivé, conformément au réglage live par défaut : les
fréquences ne prétendent pas représenter un salon où il aurait été activé.
Les interventions de Julien ne changent pas la grille et ne sont pas préparées.
OCID, qui ne consiste pas à chercher des mots dans la grille, n'est pas inclus.
Pour « 3 mots », on mesure les mots traçables, pas les combinaisons de trois mots
et de placements de bonus propres aux joueurs.

Seuls les mots observés et correspondant aux filtres de longueur sont affichés.
Une absence ne prouve pas une impossibilité ; les faibles effectifs restent
incertains. Les intervalles sont individuels, pas une garantie simultanée sur
tous les mots, et ne corrigent aucun écart entre les paramètres simulés et le live.
La base de rareté locale reste ouverte en lecture seule par le générateur : ses
annotations de bonus ne servent pas de compteur de fréquence dans ce rapport.

Les résultats sont sauvegardés à la fin de chaque type et lors d'une interruption
gérée (Ctrl+C). Un rapport interrompu porte explicitement le statut `partial` et
le processus renvoie un code d'erreur. Un arrêt brutal du processus peut perdre
le type en cours ; seul un rapport `complete` couvre toute la commande demandée.

## Vérification

```sh
node --test server/tests/wordGridFrequency.test.js

# Génération réelle, reproductibilité avec un et deux workers, cohérence CSV
node --test server/tests/wordGridFrequency.integration.test.js
```

Les tests portent notamment sur les doublons par grille, les dénominateurs,
les replis, la séparation des types, les intervalles, les graines et les exports.
