# Dictionnaire humoristique — corpus étendu

**5 043 propositions pour 5 043 mots distincts**, de 3 à 10 lettres.
Les 1 620 textes initiaux sont conservés à l’identique ; 3 423 entrées ont été ajoutées.

- [Parcourir le dictionnaire](index.html) : recherche, tri par fréquence de chaque
  type de manche, lecture alphabétique et tirage de 20 entrées au hasard.
- [Corpus avec les fréquences](catalog.fr.json) : export structuré, autonome.
- [Source éditable](../../data/humor/definitions.fr.txt) : une ligne `MOT|Définition`.

Les textes ont été rédigés pour ce corpus. Ils constituent une première version
éditoriale humoristique, pas des définitions lexicales de remplacement. Le serveur
utilise l’[export compact](../../data/humor/runtime.fr.json) pour Laurent Bafouille ;
le client ne reçoit que l’intervention choisie.

## Laurent Bafouille aux résultats

Laurent Bafouille remplace MomoMotus dans le roster avec le même niveau de jeu.
Les phases de résultats alternent Pinot puis Bafouille, sans remise à zéro entre
les mini-tournois. Son portrait remplace celui de Pinot dans le bouton des résultats.
Les manches cibles « mot le plus long » et « meilleur score » sont réservées à
Pinot, avec l’étymologie du mot cible. Après une manche cible, Bafouille est
prioritaire sur la prochaine manche non cible, quel que soit le tour prévu avant.
Un appui affiche sa définition avec les mêmes animations de parole et réactions
aux coups que les autres présentateurs. La copie dans le chat suit l’affichage de
l’intervention, sous son nom et selon les réglages de visibilité des messages de bots.
La préférence de visibilité de MomoMotus est conservée pour son remplaçant.

Les candidats sont les mots présents dans les solutions de la grille, qu’ils
aient été trouvés ou non par les joueurs, disposant d’une définition humoristique
directe ou rattachés à l’une d’elles par le dictionnaire lexical local. L’export
contient **20 728 formes supplémentaires**, soit **25 771 mots potentiellement admissibles** pour
les 5 043 définitions. Les mots de deux lettres restent exclus.
Une définition humoristique directe reste prioritaire sur un rattachement.
Les 100 derniers lemmes et définitions de Bafouille sont exclus avant de choisir
le moins fréquent : changer de pluriel ou de conjugaison ne contourne pas ce filtre.
La comparaison utilise les effectifs du type joué : classique, massive ou finale ;
les autres variantes utilisent le classique comme approximation. Un effectif nul
est prioritaire, mais ne prouve pas à lui seul qu’un mot est rare. Les ex æquo sont
départagés par ordre alphabétique de la clé normalisée.

La fréquence comparée est celle du mot réellement présent sur la grille, jamais
celle du lemme. Les correspondances sont calculées hors ligne à partir des
descriptions grammaticales du dictionnaire, avec le lecteur de formes déjà
utilisé pour les définitions. Les références ambiguës, les cycles et les champs
`form_of` erronés ne servent pas à inventer des rapprochements. Aucun accès à la
base lexicale n’est ajouté à la sélection pendant les manches.

Pinot et Bafouille partagent six introductions, dont « On pouvait aussi trouver ».
Une forme fléchie n’est retenue que si son lemme est absent des solutions de la
grille. Les simples prolongements comme CHATS → CHAT sont exclus de l’index :
le chemin contient déjà le lemme entier. Les autres formes sont aussi écartées
si leur lemme est trouvable ailleurs sur la grille, avant de comparer les fréquences.
La bulle rappelle par exemple « BUVAIS, forme conjuguée de » en caractères plus
petits et en italique, puis **BOIRE** en gras et sa définition.
Le lemme reste cliquable pour ouvrir sa fiche. Les manches cibles conservent
l’intervention d’étymologie dédiée de Pinot.

Si le présentateur prévu n’a aucun texte admissible, l’autre est essayé avant
l’envoi des résultats : Pinot peut remplacer Bafouille, et Bafouille peut remplacer
Pinot. Les manches cibles restent réservées à Pinot et l’entraînement exclut Bafouille.
Aucun ancien texte n’est réutilisé pour contourner l’anti-répétition de Bafouille.
L’alternance suit celui qui intervient réellement : un remplacement par Pinot
laisse Bafouille prioritaire à la prochaine grille admissible, et inversement.
Si aucun des deux n’a de texte, aucune intervention n’est annoncée et le tour
prévu est conservé ; une manche cible laisse toujours le prochain tour à Bafouille.
La préparation lexicale de Pinot est réutilisée et n’est pas lancée lorsque
Bafouille, prévu en premier, a déjà un candidat. L’historique et le prochain tour sont
conservés dans `GOBBLE_DATA_DIR/bafouille-results-history.json` (dossier
`data` par défaut). La préparation d’une manche ne consomme aucune entrée et
l’entraînement ne modifie ni cet historique ni l’alternance publique.

La configuration par défaut inclut `humorist` dans `GOBBLE_AMBIENT_CHAT_BOT_KEYS`.
Si cette variable est explicitement définie, ajouter cette clé pour activer
Bafouille.

Les images sont dans `public/bots/presenters/bafouille`. Pour les reconstruire :
`node scripts/import-bafouille-assets.mjs .tmp/bafouille`. Le script sépare les
contours réels de la planche, dont les rectangles englobants se chevauchent, puis
aligne six poses complètes dans des cellules de 500 × 600 pixels. La dernière
pose neutre, tronquée dans l’image fournie, est écartée. Le bouton de 250 × 300
pixels reprend l’échelle du portrait de Pinot ; les images sources restent intactes.

## Sélection et lecture des fréquences

La sélection prolonge les [premiers candidats](../humor-dictionary-candidates.md)
en élargissant aux noms, adjectifs, infinitifs et quelques mots grammaticaux qui
offrent un angle comique. Les 69 candidats précédemment détaillés sont présents.
Les mots retenus sont admis par le dictionnaire du jeu et ont tous été observés
dans au moins un des trois échantillons de 1 000 grilles.

Parmi ces entrées, **926** apparaissent dans au moins 1 % des grilles classiques ;
**1 530** atteignent 1 % dans au moins un des trois types. Ce sont des constats sur
les échantillons, pas des garanties de fréquence réelle ni de couverture cumulée.
Les mots moins observés sont conservés pour varier les sujets.

Une présence compte une fois par grille, indépendamment du nombre de chemins et
des trouvailles des joueurs. Les fréquences des trois types restent séparées.
Un zéro signifie « non observé dans cet échantillon », pas « impossible ».
Les fréquences des pluriels ne sont pas ajoutées à celles du singulier.

Le mot affiché précise le sens choisi lorsque les accents sont neutralisés dans
la grille : SALÉ, RUSÉ, SÛR, etc. La clé normalisée reste unique dans le corpus.
La base lexicale locale a été consultée en lecture seule ; ses indicateurs de
formes fléchies ne suffisent pas à éliminer un mot. Par exemple, MÂLE, NEIGE et
TENUE ont un sens autonome malgré des métadonnées locales ambiguës ou erronées.

## Réédition et vérifications

Modifier la source éditable, puis reconstruire depuis la racine du dépôt :

```sh
node scripts/build-humor-dictionary.mjs .tmp/word-grid-frequency/first-1000/report.json
```

Le rapport complet de mesure doit être disponible localement ; on peut fournir
un autre chemin en argument. L'export conserve les effectifs par type et les
empreintes SHA-256 du rapport et du texte source pour identifier sa provenance.

La construction vérifie : au moins 5 000 entrées, clés uniques après la
normalisation du jeu, trois lettres minimum, mots admis, couverture des longueurs
par le rapport, calcul des pourcentages, textes distincts, format et ponctuation.
Un futur ajout absent des trois échantillons est accepté avec trois effectifs nuls.
Les textes de cette version ont entre 32 et 104 caractères. Aucun texte identique
ni aucune suite identique de sept mots n’a été relevé entre deux définitions.

La recherche sans accents, les tris, la pagination, l'échantillonnage sans
doublons et l'affichage sur ordinateur et petit écran ont été vérifiés dans
Chrome. Ces contrôles techniques ne mesurent pas l'efficacité comique : celle-ci
reste une appréciation éditoriale à affiner à partir de la lecture et du jeu.
