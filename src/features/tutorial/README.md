# Didacticiel en situation

Le didacticiel s’ouvre depuis **Accueil → Apprendre à jouer**, depuis les paramètres ou au premier accès au jeu. La question « Tu débutes sur Gobble ? » permet de passer directement au jeu.

## Parcours

Les bases demandent seulement trois tracés différents, sur une même grille préparée :

1. **ARME** : voisinage, diagonales, relâcher pour valider, doublons.
2. **QUAD** : valeur des lettres et L2, 25 points avec le chemin proposé.
3. **QUADRILATÈRE** : 12 lettres, les quatre tuiles spéciales réunies, bonus de longueur, 300 points et double Gobble. Une seule carte récapitule tous les bonus.

Le joueur découvre ensuite le classement live, le flux et les rôles de Laurent Rhum&Co, Julien Lechéper et Maître Gobbello. Ce dernier suggère une terminaison réellement présente dans la grille. Le focus encadre uniquement leurs trois pastilles. Les trois premiers tracés utilisent le même parcours vert transparent que le survol des résultats desktop ; les quatre bonus sont exposés séparément avec les couleurs des badges du jeu.

Le catalogue explique le mini-tournoi et donne accès, dans n’importe quel ordre, à huit ateliers : Rapidité, Massive Boggle, Lettre en or, Faux jumeaux, 3 mots, Mot le plus long, Meilleur mot, Grille monstrueuse. Rapidité contient 20 secondes de recherche libre. OCID n’a pas encore d’atelier.

**Faux jumeaux** fait tracer BRAS puis PERLE : deux lectures de la même tuile, sur des chemins différents. Chaque mot passant par cette tuile reçoit +50 points. Un focus sur le compteur explique l’objectif commun : 40 % de ces mots pour +500 points. Le conseil central est de concentrer ses recherches sur cette tuile, quitte à délaisser le reste de la grille. BAIN/PAIN reste un exemple secondaire de validation simultanée, pour éviter de refaire un même tracé.

**3 mots** utilise les emplacements et les bonus déplaçables du jeu, avec le chrono en pause :

1. Tracer ZÈBRE, puis TIRE depuis une autre case ; les cases intermédiaires restent réutilisables.
2. Glisser M3 sur leur E commun, guidé par un doigt animé : les deux scores sont triplés.
3. Supprimer TIRE avec sa croix, puis le remplacer par TIRER pour améliorer le score.
4. Proposer volontairement RIBRE, absent du dictionnaire, pour constater qu’un score affiché reste provisoire.
5. Essayer librement les autres bonus, avec des conseils de placement pour profiter des chemins communs.
6. Voir le récapitulatif animé des trois propositions : le vrai vérificateur refuse RIBRE et lui attribue zéro. Les mots valides, leurs chemins et les derniers bonus placés déterminent le résultat affiché dans l’interface habituelle.

Les gestes de cet atelier font avancer les consignes automatiquement. Les consignes courtes restent sur le bas de la grille, hors des chemins guidés, des emplacements de mots et du plateau des bonus. L’aide donne l’explication complète. Le bilan rappelle la stratégie du trio et le seul Gobble disponible, celui du plus long mot.

Après la démonstration vocabulaire, les consignes se lisent directement en overlay sur les résultats. Sur téléphone, le titre de la page affichée est mis en surbrillance : classement manche, classement général, mots trouvés puis tous les mots trouvables. Chaque page a son explication ; le doigt animé accompagne les balayages et les retours en arrière retrouvent l’explication correspondante. Survoler ou toucher ARME puis ouvrir sa définition fait avancer le parcours automatiquement, sans boutons « Essayer » ou « Continuer ». La définition reste lisible jusqu’à sa fermeture.

Pendant le tracé, une consigne identifiée « Didacticiel » laisse le champ de validation libre. « Aide et options » ouvre les commandes explicites : reprendre, montrer le chemin, passer l’étape, quitter. Les étapes peuvent être passées et le parcours quitté à tout moment. Seuls les chapitres entièrement suivis sont marqués comme terminés ; un replay repart au début.

## Responsabilités

- `TutorialApplication.jsx` et `TutorialCoach.jsx` : uniquement les overlays, le catalogue, les focus et les indices. Aucun écran de jeu ou de résultats alternatif.
- `createTutorialSession.js` : scénario, observation des actions, progression et temporisations du guide. Aucun calcul ou attribution du score de jeu, aucune saisie parallèle.
- `useTutorialGameBridge.js` : liaison avec les services et commandes existants de `GobbleApplication`. Le contrôleur reste vivant quand l’application passe de l’accueil au jeu ; les abonnements cessent à la fermeture.
- `tutorialPreparedRounds.js` : données d’une manche locale et des joueurs simulés, au format des vrais résultats. Les mots et scores du joueur proviennent du moteur réel. Les définitions pédagogiques utilisent la fenêtre habituelle du dictionnaire.
- `tutorialScenarios.js` : textes, objectifs et paramètres des variantes.
- `tutorialThreeWords.js` : scénario des manipulations de la manche 3 mots. `tutorialThreeWordsResults.js` applique le vérificateur commun `shared/dailySpecialReview.js` uniquement aux résultats ; le faux mot ne rejoint jamais le dictionnaire. Le récapitulatif réutilise `DailySpecialRecapDialog`.
- `tutorialBoards.js` et `tutorialBoardPacks.json` : grilles fixes, chemins pédagogiques et solutions précalculées.

La manche entre par `standaloneTrainingFeature.startPreparedSession`, puis par les fonctions habituelles de lancement, de soumission, d’effets et de résultats. Son état reste celui d’un entraînement local ; seule la présentation affiche les commandes et classements d’une manche live. Aucun appel réseau ne crée la manche ou ne publie les joueurs simulés. La progression vocabulaire est une démonstration et n’écrit pas dans les statistiques du compte.

Les composants de jeu, de résultats, les gestes souris/tactile/clavier, les sons et les assets sont ceux du runtime actuel. `LegacyApp.jsx` n’est ni importé ni utilisé.

## Vérifier ou modifier

```sh
node scripts/build-tutorial-boards.mjs
node --test src/features/tutorial/createTutorialSession.test.mjs src/features/training/createStandaloneTrainingFeature.test.js
node --test src/features/tutorial/tutorialNativeThreeWords.test.mjs server/tests/dailySpecialReview.test.js
```

Le générateur utilise `public/dico.txt` et le solveur existant, vérifie les chemins pédagogiques et écrit les solutions. Les tests couvrent les chemins, les règles des variantes, les résultats, les actions attendues, la sauvegarde et le nettoyage, ainsi que l’absence de présence réseau pour une manche préparée.

La progression est enregistrée par identité sous `gobble:guided-tutorial:v2:<identité>`. Les données du premier prototype ne sont pas reprises, puisque le parcours a changé.
