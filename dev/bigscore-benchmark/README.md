# Comparaison locale BigScore : CSS / PixiJS

Le prototype est branché sur le vrai `GameCelebrationOverlay`. Dans le jeu local,
ajouter `?bigscoreRenderer=pixi` à l'URL (ou `&bigscoreRenderer=pixi` si elle contient
déjà des paramètres). Recharger sans ce paramètre, ou avec `bigscoreRenderer=dom`,
pour retrouver le CSS. Le choix ne persiste pas et le CSS reste le défaut.

PixiJS 8.21.0 utilise WebGL pour les sept images BigScore et leurs bordures de flash.
Les durées, trajectoires, opacités, dimensions, modes mobile et allégé suivent le CSS
existant. Les messages de mots invalides restent en CSS ; les confettis et les effets
de grille conservent leur moteur actuel. Le module Pixi est chargé à la demande.
L'absence ou la perte de WebGL entraîne un retour au CSS.

Le canvas est limité à l'enveloppe des animations. Le rendu s'arrête au repos et
lorsque le document est masqué. Les boucles système et les événements pointeur de
Pixi sont désactivés pour cette surcouche décorative. Chaque instance possède ses
textures et détruit ses ressources, son contexte et ses écouteurs au démontage.

## Reproduire

Depuis la racine, avec les dépendances du client et de `server/` installées :

```sh
npm run benchmark:bigscore
node server/scripts/benchmark-bigscore.mjs --quick
node server/scripts/benchmark-bigscore.mjs --checks-only
```

Le script compile une fixture en production, démarre un serveur HTTP **de fichiers**
sur l'interface locale, puis lance un Chrome isolé sans désactiver le GPU. Il ne
démarre pas le backend Gobble. Sous Windows, le chemin par défaut est
`C:/Program Files/Google/Chrome/Application/chrome.exe` ; `CHROME_PATH` permet de
choisir un autre exécutable. Le profil Chrome temporaire et le serveur de fichiers
sont nettoyés en fin de test. Ne pas lancer plusieurs benchmarks simultanément.

La fixture peut aussi être ouverte depuis le serveur Vite du client à
`/dev/bigscore-benchmark/index.html?bigscoreRenderer=pixi`.

## Protocole

- Vrais composants React et CSS, vrais fichiers WebP, vraie feature de célébration.
  La grille interactive est une fixture ; ce n'est pas une partie multijoueur.
- Comparaison des poses CSS et Pixi à 160, 500 et 1 200 ms pour Épique et Double
  Gobble : position, échelle, dimensions et opacité. Formats ordinateur, mobile et
  allégé ; captures PNG aux mêmes instants.
- Vérification du rendu CSS des mots invalides, du chargement différé de Pixi,
  du démontage, du repos sans rendu ni ticker interne, de la perte de contexte et
  de l'indisponibilité initiale de WebGL.
- Trois configurations sur le même ordinateur : 1 920 × 1 080 / DPR 1,
  1 280 × 800 / DPR 2, puis 1 920 × 1 080 avec ralentissement CPU ×4 dans Chrome.
  Le ralentissement ne simule pas un iPhone.
- Trois répétitions, ordre CSS/Pixi alterné. Après un premier effet de chauffe :
  repos 1,2 s ; Épique 2,6 s ; Double Gobble + bonus + confettis + secousse 5,2 s ;
  six effets rapprochés 5,2 s. Mouvements de souris CDP toutes les 100 ms.
- Mesures : occupation du thread principal (`TaskDuration`), intervalles rAF,
  longues tâches et délai entre événement pointeur et prochain rAF. Ce dernier
  n'est pas une mesure d'INP ni du délai jusqu'à l'affichage physique.
- Tas JavaScript après GC et ressources de rendu contrôlés séparément. La mémoire
  GPU, les images réellement présentées par l'écran, l'énergie et les performances
  du jeu complet ne sont pas mesurées.

Résultats bruts : `.Tmp/bigscore-review/results.json`. Captures dans le même dossier.
Les sorties sont ignorées par Git. Les modes rapides écrivent des fichiers distincts.
