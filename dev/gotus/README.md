# Vérification du client Gotus

Fixture des composants de production `GotusPlayground` et `GotusWaitingSatellite`, avec entraînement local et socket live simulée. Elle ne charge aucune API Gobble ; le mot local est fixé à `BALLON`. Le graphe Web Audio et les fichiers sonores restent réels.

```sh
node --preserve-symlinks --preserve-symlinks-main dev/gotus/verify.mjs
```

Le script lance un Vite isolé sur `127.0.0.1:5192`, puis un Chrome headless avec son propre profil temporaire ; il arrête uniquement ces processus à la fin. Les captures desktop/mobile, mesures de débordement, événements audio et quatre cascades sont écrits dans `.tmp/gotus-ui/`. Les formats mobiles sont simulés et ne remplacent pas un essai avec clavier logiciel sur téléphone.

`--responsive-only` vérifie les vraies surfaces plein écran entraînement (`GotusWaitingSatellite`) et live. Ce passage ne déverrouille pas les sons et ne joue aucune proposition. Il couvre les deux modes en 320×568, 360×640, 390×844, 430×932, 844×390, 1280×720, 1366×768 et 1920×1080, soit 16 cas : rapport largeur/hauteur des 36 cases et grille carrée, accès aux contrôles, présentateur desktop d’au moins 180 px et chat d’au moins 300 px. Les captures portent le préfixe `responsive-` et les mesures sont conservées séparément dans `responsive-measurements.json`. Ajouter `--desktop-only` limite ce passage aux six cas desktop et écrit `responsive-desktop-measurements.json`.

`--mobile-only` limite le passage responsive aux cinq formats mobiles et écrit `responsive-mobile-measurements.json`, sans remplacer les mesures desktop.

`--chat-only` vérifie le chat de production en entraînement et en live, sur desktop et mobile. La fixture utilise `createChatFeature`, `DesktopChatPanel` et `MobileChatLayer` ; seul le transport est remplacé par une mémoire locale. Les contrôles couvrent l’envoi avec accusé de réception et écho, la réception, le brouillon conservé après fermeture/réouverture, une seule zone de saisie du chat, le bouton mobile accessible en haut, le tiroir au-dessus de Gotus et le maintien du focus dans le chat à la fin d’une révélation. Aucun socket réel ni backend ne démarre. Rapport : `chat-measurements.json` ; captures : `chat-*.png`.

`--input-only` vérifie la saisie directement dans la grille en entraînement/live et sur desktop/mobile : première lettre préremplie, sélection initiale de la deuxième case, remplacement sans décaler les lettres, avance automatique, Backspace/Delete, flèches et limites du curseur, validation exacte du mot et verrouillage pendant la révélation. Il vérifie aussi que les lettres bien placées comptent dans la proposition suivante : après `BANANE`, saisir seulement `LLON` complète `BA` en `BALLON` ; après `BALLES`, saisir `ON` complète `BALL`. La frappe avance case par case et peut remplacer les lettres préremplies ; leur suppression laisse une vraie case vide. Les interactions passent par de vraies touches CDP ou des taps sur le clavier virtuel ; aucun appel direct au contrôleur ne modifie la proposition. Le test vérifie aussi que le chat conserve le focus pendant la révélation. Rapport : `input-measurements.json` ; captures : `input-*.png`.

`--intro-only` vérifie l'intro de production avec le WAV réel (68 132 échantillons à 48 kHz, soit 1,419416667 s) : une lecture à l'ouverture entraînement/live, agrandissement continu du logo synchronisé à l'horloge audio, sortie du viewport, contrôles inertes pendant l'intro puis libérés, aucune répétition au mot suivant, interruption du son et de l'animation à la fermeture, et animation silencieuse avec le réglage muet. Le rapport `intro-measurements.json` conserve les instants audio et les mesures de chaque image ; les captures portent le préfixe `intro-`. La fixture n'ouvre aucun jeu de fond dans ce mode.
