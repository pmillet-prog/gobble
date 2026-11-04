# Pool éditorial de la finale

Cet ensemble contient **4 200 propositions** : 2 100 énigmes et 2 100 questions
de culture générale. Les formulations ont été rédigées pour ce jeu. « Original »
décrit cette rédaction, pas une revendication d’invention de chaque idée de
devinette ou d’exclusivité d’un fait de culture générale.

Les 12 textes de départ sont conservés dans `seed.json`. Quatre lots de 72 textes,
quatre lots de 75 textes et trente-six lots de 100 textes complètent le pool.
`manifest.json` fixe leur ordre
d’assemblage. Les identifiants
`if-r…` et `if-q…` sont stables : une correction garde le même identifiant ; une
nouvelle question en reçoit un nouveau. Ne jamais réaffecter l’identifiant d’un
texte retiré à un autre texte. La question `if-q118` (axolotl) est archivée et
remplacée par `if-q151` (hibernation). Les derniers lots ajoutent les énigmes
`if-r1101` à `if-r2100` et les questions `if-q1102` à `if-q2101` : vingt lots
de 100 textes, répartis à égalité entre énigmes et questions de culture générale.
Ils explorent notamment les expressions, les charades, la vie quotidienne,
les arts, les sciences, le sport et les récits populaires. Les thèmes restent
explicites ; les réponses déjà présentes sont réutilisées lorsque l’indice ou le
fait demandé est différent.

L’objectif est désormais **10 000 textes** : ce palier représente 42 % du volume visé,
avec 5 800 textes supplémentaires à rédiger. Le compteur mesure les textes
disponibles dans l’atelier, pas des questions entièrement vérifiées et publiables.

## Utilisation et modifications

L’atelier importe `data/infortune-finale-bank.json`, produit par :

```powershell
npm run infortune:pool
```

Modifier les **lots sources** de ce dossier, puis reconstruire. Une entrée peut
porter `acceptedAnswers` pour les variantes correctes en un mot et
`excludedAnswers` pour les voisins orthographiques qui seraient de vraies erreurs.
Les catégories et le type sont hérités du groupe. `difficulty` reste propre à
chaque texte : 1 accessible, 2 intermédiaire, 3 plus exigeant. Ces niveaux sont
des estimations éditoriales, pas des mesures de difficulté réelle.

## Thèmes qui guident les joueurs

Paul accepte beaucoup de thèmes différents : leur nombre ne doit pas être limité
artificiellement. Chaque intitulé doit désigner clairement le sujet et aider à
chercher la réponse, sans métaphore ni association incompréhensible.

- Employer des noms explicites : « Orientation », « Bricolage », « Couture »,
  « Vêtements et accessoires », « Voyages et transports », « Fruits et légumes ».
- Séparer les sujets d’un lot : un outil et un feu de circulation ne partagent
  pas un thème « La rue et l’atelier ». Un vêtement et un bagage ne sont plus
  classés ensemble sous « S’habiller et partir ».
- Réunir les synonymes de catégories : « Le monde vivant », « Nature et vivant »
  et « Animaux familiers et sauvages » ont été regroupés sous « Nature ».
- Choisir selon l’énoncé : une question sur un animal de conte peut relever de
  « Littérature » ; le même animal étudié pour son mode de vie relève de « Nature ».
- Ne jamais donner la réponse dans le thème. Le calendrier est ainsi rangé sous
  « Papeterie », plutôt que sous « Temps et calendrier ».

`manifest.json` contient les intitulés utilisés. Cette liste est **extensible** :
ajouter un thème pertinent est autorisé sans quota. L’assemblage refuse un libellé
non déclaré pour repérer les fautes de frappe et les variantes accidentelles.
Une entrée peut définir sa propre `category` quand celle du groupe ne convient pas.

## Références et statut éditorial

Les références réutilisables figurent dans `references` du lot ; `reference`
les relie à une entrée. Une référence inexistante fait échouer l’assemblage.
Un lien n’est ajouté que s’il correspond réellement au fait concerné. Une entrée
sans lien reste explicitement à documenter ou vérifier lors de la relecture
factuelle. La source Wiktionnaire du jeu existant n’est pas utilisée.

`status` vaut `draft` par défaut. Le passage à `reviewed` est une décision
éditoriale explicite ; l’outil ne la prend jamais. L’atelier accepte les brouillons,
le tirage destiné au live les exclut déjà. Pour écarter aussi un texte des essais,
le déplacer dans un lot d’archive non cité dans `manifest.json`, en conservant son
identifiant. Cette opération n’exige aucun redémarrage du backend.

## Contrôles et limites

Le même assemblage produit `data/infortune-finale-pool.report.json`, contenant :

- répartition par type, thème et difficulté ;
- réponses partagées par plusieurs textes, variantes et accents normalisés ;
- proximités lexicales entre énoncés à examiner ;
- réponse présente dans un thème, chiffres immédiatement visibles, énoncés longs ;
- longueur, nombre de mots, lettres distinctes, couverture de E et coût de
  révélation intégrale avec le barème d’essai.

Le validateur existant bloque les doublons exacts d’énoncés et d’identifiants,
les réponses écrites dans leur propre énoncé, les variantes contradictoires,
les réponses incompatibles avec le format et les dépassements de longueur.

La recherche de proximité utilise les mots significatifs partagés ; elle n’est
**pas** un détecteur sémantique universel. Elle peut manquer une paraphrase ou
signaler deux questions différentes. Aucune de ces métriques ne certifie la
justesse d’un fait ni l’absence d’une autre réponse raisonnable.

Le coût intégral est un plafond connu, pas une estimation du coût moyen d’une
partie : des lettres absentes achetées au hasard coûtent aussi de l’argent, et un
joueur peut résoudre avant la révélation complète. Les espaces, la ponctuation,
le thème et la forme des mots apportent déjà des indices.

## Relecture avant élargissement

Pour chaque texte, vérifier la réponse attendue, chercher les alternatives
raisonnables, distinguer un nom générique d’une espèce ou d’un modèle particulier,
et vérifier que la consigne permet une réponse naturelle en un mot. Éviter de
tronquer artificiellement un nom composé pour le faire entrer dans le format.

Pour les faits, privilégier une référence institutionnelle ou l’œuvre d’origine.
Les données changeantes, les records fragiles et les classements contestables
doivent être datés et documentés ou remplacés par des faits stables. Une source
sert à vérifier le contenu ; elle n’autorise pas à recopier son texte.

Pour les prochains lots, même le niveau « exigeant » doit rester grand public.
La difficulté peut venir du rapprochement des indices ou du rappel d’une
connaissance générale ; éviter les réponses qui exigent un vocabulaire rare ou
un savoir spécialisé. Paul cite « axolotl » comme exemple de réponse trop
pointue : acheter des lettres ne doit pas aboutir à une réponse que le joueur
n’avait pratiquement aucune chance de connaître. Privilégier des indices précis
et une réponse reconnaissable plutôt qu’une rareté de vocabulaire. Ne pas
multiplier les questions inversées sur le même fait pour remplir un lot.

La difficulté doit ensuite être évaluée avec le thème visible et l’énoncé
partiellement masqué. Les essais en jeu permettront de réviser les niveaux et de
retirer les textes qui suscitent trop de mauvaises surprises. Il n’y a pas encore
de télémétrie de réussite ni de dispositif de signalement ajouté par ce lot.

Pour progresser vers 10 000, ajouter des lots identifiés avec la même démarche,
sans multiplier des reformulations d’un même fait pour augmenter le compteur.
Paul accepte explicitement qu’un même mot réponde à plusieurs questions,
pourvu que les questions soient différentes. Il n’y a ni objectif de réponses
toutes distinctes, ni plafond de répétition par mot. Ne pas chercher une réponse
rare uniquement pour éviter de réutiliser un mot connu.

On peut explorer plusieurs sens d’un mot, plusieurs faits sur un même sujet ou
des œuvres différentes d’un même auteur. La répétition de la réponse n’est pas
un défaut ; une simple paraphrase du même indice reste à éviter pour préserver
l’intérêt du jeu. Les répétitions restent visibles dans le rapport pour faciliter
la comparaison des questions. `editorial.note` peut préciser une distinction si
elle n’est pas évidente à la lecture. Ne jamais supprimer une variante correcte
pour masquer une répétition ou embellir le compteur.

Continuer à varier les sujets au fil des lots ; ne pas remplir artificiellement
un thème devenu difficile à enrichir avec des réponses grand public. La validation
des faits, l’ambiguïté et la difficulté réelle restent à examiner avant tout passage
au statut `reviewed`, même quand les contrôles techniques sont tous verts.

## Vérification locale

```powershell
npm run infortune:pool:check
npm run infortune:pool:test
```

`check` vérifie que les deux fichiers assemblés correspondent exactement aux
sources, sans les modifier. Les tests couvrent l’assemblage et ses alertes, ainsi
que les règles d’achat, de réponse et de révélation du tableau sur le pool actuel.
