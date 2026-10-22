# Atelier Motus — Thierry Baccardo

Prototype autonome du mini-jeu, pour essais locaux avant intégration à Gobble.

## Lancer

Depuis la racine du projet :

```sh
npm run motus:dev
```

Ouvrir **http://127.0.0.1:8786/**. Le serveur sert uniquement ce dossier, sur l’interface locale. Aucun backend Gobble, aucune API, aucun compte ni installation supplémentaire ne sont nécessaires. Pour utiliser un autre port, définir `MOTUS_PORT` avant le lancement. Arrêter ce serveur avec Ctrl+C.

## Règles de cette première version

- Six lettres, six essais, première lettre offerte, sans chronomètre.
- Le mot proposé doit figurer dans le dictionnaire. La première lettre donnée est un indice : elle peut être effacée dans la saisie et remplacée pour proposer un mot commençant par une autre lettre. Une proposition incomplète, inconnue ou déjà utilisée ne consomme pas d’essai.
- Carré rouge orangé : lettre bien placée. Cercle jaune : lettre présente ailleurs. Les occurrences bien placées sont décomptées avant les indices jaunes.
- À la tentative suivante, les lettres déjà trouvées sont reportées en blanc sur bleu ; les emplacements inconnus portent un point. Les lignes non utilisées restent vides.
- Accents ignorés. Infinitifs et participes passés acceptés comme cibles. Une graphie ayant un emploi non verbal attesté reste admissible, même si elle peut également être conjuguée.
- Les conjugaisons restent valides comme propositions, y compris celles exclues du tirage.
- Saisie au clavier ou avec le clavier à l’écran ; révélation progressive, victoire et fin des six essais. Le bouton « Nouveau mot » annule proprement une révélation en cours.
- Ouvrir « Atelier de test » pour charger une cible précise, révéler la solution ou accélérer la révélation. Par exemple : `BALLON`, puis `BANANE`, `BALLES`, `BALLON` pour examiner les occurrences et les lettres reportées.

Les cinq sons fournis par Paul sont dans `assets/audio/` : un son par lettre bien placée, mal placée ou absente, puis le son de victoire ou celui du dernier essai raté. « Voir la solution » ne joue pas le son de défaite. Les sons s’activent après une première interaction ; la case « Activer les sons » permet de les couper sans arrêter l’animation.

À la victoire, seule la ligne gagnante s’anime : une lettre à la fois retrouve brièvement son fond bleu, puis redevient valide quand la suivante clignote. Les quatre passages suivent l’horloge audio et les quatre arpèges du MP3 (départs à 0,048 / 0,516 / 0,995 / 1,474 s ; fin à 1,953 s). Le son de pièce chevauche la fin du quatrième passage. Le mode « Révélation rapide » ne change pas le tempo de la victoire. Une nouvelle manche coupe les sons et l’animation ; le réglage système de réduction des animations conserve les lettres valides sans clignotement.

## Banque de mots reproductible

```sh
npm run motus:words
```

Le script lit `public/dico.txt` et le dump français **complet** `data/frwiktionary-latest-pages-articles.xml`, déjà disponible localement. Il ne modifie aucune source. Il ne dépend pas d’un service distant. Le dump est lu en flux et les mots sont filtrés à six lettres.

La classification examine toutes les rubriques grammaticales françaises et fusionne les variantes sans accents. Elle ne repose pas sur des suffixes ni sur la première définition. Ainsi, `PORTES` reste une cible grâce au nom « portes », et `MANGES` grâce au participe « mangés ». Les formes uniquement conjuguées sont exclues des cibles. Les formes sans preuve grammaticale suffisante sont également exclues du tirage par prudence, tout en restant dans les propositions.

Sorties :

- `data/words.json` : listes indépendantes `accepted` et `targets`, métadonnées et empreinte du dictionnaire ; chargée une seule fois par le prototype.
- `data/word-summary.json` : bilan et listes des exclusions par motif.
- `.tmp/motus/word-report.json` : rapport détaillé par mot, décisions, catégories et liens vers les pages sources ; conservé hors du runtime.

Premier passage : **17 991 propositions**, **11 780 cibles**, **5 868 formes uniquement conjuguées**, **343 non classées**. Les cibles sont grammaticalement filtrées, sans sélection de difficulté ou de fréquence : des mots rares peuvent donc être tirés. Le filtre ne prétend pas remplacer une relecture éditoriale.

Options du script : `--dictionary`, `--dump`, `--output`, `--report`, suivies chacune d’un chemin. Sans dump disponible, la banque déjà générée suffit pour jouer.

Données grammaticales dérivées du Wiktionnaire français (CC BY-SA / GFDL) ; liens de provenance par graphie dans le rapport détaillé. Les phrases de définition et les exemples ne sont pas distribués dans la banque de jeu.

## Organisation et vérification

- `model.mjs` : règles pures, évaluation des occurrences, progression de la manche.
- `controller.mjs` : état, commandes, minuterie de révélation et nettoyage.
- `feedback.mjs` : chargement des cinq sons, lecture Web Audio et cascade de victoire synchronisée sur l’horloge audio ; horloge locale de secours si le son est indisponible.
- `view.mjs` : rendu ciblé des 36 cases, du clavier et du présentateur.
- `app.mjs` : chargement et raccordement des événements de l’interface.
- `word-rules.mjs` et `scripts/build-motus-words.mjs` : classification et génération de la banque.
- `assets/` : décor, planche de sept sprites, sources, conversion et prompts ImageGen ; voir [la documentation des assets](assets/README.md).

```sh
npm run motus:test
```

Les tests couvrent les occurrences répétées, propositions invalides, conjugaisons admises en proposition, lettres reportées, victoire, six échecs, annulation des minuteries, classification grammaticale et synchronisation/nettoyage des retours sonores et visuels.

Le prototype ne charge aucun module de l’application Gobble, ne modifie ni `App.jsx` ni `LegacyApp.jsx`, et n’entre pas dans sa compilation. Les réponses sont présentes dans le navigateur pour les essais locaux ; l’intégration multijoueur devra confier le tirage et la validation au serveur.
