# Vérification du client Gotus

Fixture des composants de production `GotusPlayground` et `GotusWaitingSatellite`, avec entraînement local et socket live simulée. Elle ne charge aucune API Gobble ; le mot local est fixé à `BALLON`. Le graphe Web Audio et les fichiers sonores restent réels.

```sh
node --preserve-symlinks --preserve-symlinks-main dev/gotus/verify.mjs
```

Le script lance un Vite isolé sur `127.0.0.1:5192`, puis un Chrome headless avec son propre profil temporaire ; il arrête uniquement ces processus à la fin. Les captures desktop/mobile, mesures de débordement, événements audio et quatre cascades sont écrits dans `.tmp/gotus-ui/`. Les formats mobiles sont simulés et ne remplacent pas un essai avec clavier logiciel sur téléphone.

`--responsive-only` vérifie les vraies surfaces entraînement (`GotusWaitingSatellite`) et live avec des hôtes de portail. Les dimensions du plateau mobile sont calculées par `computeMobileGameLayoutSizing` pour une manche cible et une barre supérieure de 64 px. Ce passage ne déverrouille pas les sons et ne joue aucune proposition. Il couvre 320×568, 360×640, 390×844, 430×932, 844×390 et 1280×900 : rapport largeur/hauteur des 36 cases et grille carrée sur mobile, boutons « Voir la solution » et « Rejoindre le live » d’au moins 44 px, et accès à chaque contrôle après défilement. Le format desktop conserve ses proportions et vérifie l’absence de régression des contrôles. Les captures portent le préfixe `responsive-` et les mesures sont conservées séparément dans `responsive-measurements.json`. Ajouter `--desktop-only` limite ce passage aux deux surfaces desktop et écrit `responsive-desktop-measurements.json`.

`--mobile-only` limite le passage responsive aux cinq formats mobiles et écrit `responsive-mobile-measurements.json`, sans remplacer les mesures desktop.

`--intro-only` vérifie l'intro de production avec le WAV réel (68 132 échantillons à 48 kHz, soit 1,419416667 s) : une lecture à l'ouverture entraînement/live, agrandissement continu du logo synchronisé à l'horloge audio, sortie du viewport, contrôles inertes pendant l'intro puis libérés, aucune répétition au mot suivant, interruption du son et de l'animation à la fermeture, et animation silencieuse avec le réglage muet. Le rapport `intro-measurements.json` conserve les instants audio et les mesures de chaque image ; les captures portent le préfixe `intro-`. La fixture n'ouvre aucun jeu de fond dans ce mode.
