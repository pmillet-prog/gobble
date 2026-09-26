# BigScore : prototype PixiJS et mesures du 26 septembre 2026

Le prototype est fonctionnel et reste activable par `?bigscoreRenderer=pixi` dans
le jeu local. Le CSS reste le défaut. **Les mesures ne justifient pas de remplacer
le rendu CSS par ce prototype.** Sur cet ordinateur, Pixi ajoute du travail sur le
thread principal sans améliorer la cadence ou la réactivité mesurées.

## Ce qui a été comparé

PixiJS 8.21.0 / WebGL et le composant DOM/CSS existant utilisent les mêmes sept
WebP, durées, trajectoires, tailles, transparences et options d'effets allégés.
Le prototype conserve les messages de mots invalides en CSS et les confettis dans
canvas-confetti. Le code est externalisé dans `src/features/celebration/bigscore/`.

Machine : Windows, Intel Core i5-11400F, NVIDIA GeForce RTX 3060 via ANGLE/D3D11,
Chrome 154.0.8037.57. Chrome est lancé en mode headless avec le GPU activé.
Le banc utilise le véritable composant de célébration compilé en production,
une grille interactive de test et des mouvements de souris envoyés par CDP.
Il ne démarre pas le serveur Gobble et ne simule pas une partie multijoueur complète.

Trois répétitions par moteur et scénario, avec alternance de l'ordre des moteurs :
72 séquences sur trois configurations. Les chiffres ci-dessous sont les médianes
des trois répétitions. Le scénario combiné inclut Double Gobble, bonus, confettis
et une secousse de grille. Le scénario rapproché enchaîne six effets.

## Ordinateur, sans ralentissement artificiel

Occupation cumulée du thread principal (`Performance.TaskDuration`), en ms pour
l'ensemble de la séquence. Les entrées souris et le coût de la fixture sont inclus
dans les deux modes ; les pourcentages ne décrivent pas le coût du jeu entier.

| Configuration | Séquence | CSS | PixiJS | Écart Pixi |
| --- | --- | ---: | ---: | ---: |
| 1 920 × 1 080, DPR 1 | Épique, 2,6 s | 173,0 ms | 194,7 ms | +12,5 % |
| 1 920 × 1 080, DPR 1 | Combinée, 5,2 s | 407,8 ms | 469,7 ms | +15,2 % |
| 1 920 × 1 080, DPR 1 | Rapprochée, 5,2 s | 394,7 ms | 420,1 ms | +6,4 % |
| 1 280 × 800, DPR 2 | Épique, 2,6 s | 171,4 ms | 184,1 ms | +7,4 % |
| 1 280 × 800, DPR 2 | Combinée, 5,2 s | 409,1 ms | 455,8 ms | +11,4 % |
| 1 280 × 800, DPR 2 | Rapprochée, 5,2 s | 388,1 ms | 420,8 ms | +8,4 % |

- Intervalle rAF au 95e percentile : **7,2 ms dans les deux moteurs**, soit une
  cadence échantillonnée voisine de 144 Hz.
- Délai pointeur → prochain rAF : médianes des p95 entre 7,5 et 7,8 ms en CSS,
  entre 7,5 et 7,9 ms avec Pixi pour ces séquences. Aucun gain net.
- En DPR 2, le scénario combiné comporte deux intervalles rAF supérieurs à 25 ms
  sur les trois passages Pixi (maximum 27,8 ms), contre zéro en CSS.
- Au repos, zéro rendu Pixi, zéro rAF propre en attente et zéro écouteur dans le
  ticker système Pixi. Les 1,2 s de fixture avec mouvements de souris occupent
  environ 50–53 ms dans les deux moteurs ; ce n'est pas un repos sans interaction.

La décomposition explique le résultat : en 1080p, sur la séquence combinée, le
temps de recalcul des styles diminue de 102,3 à 7,6 ms, mais le temps JavaScript
augmente de 31,8 à 202,1 ms. Pixi déplace une partie du travail vers la boucle de
rendu JavaScript ; le bilan global de ce prototype reste défavorable.

## CPU ralenti ×4 dans Chrome

Le p95 rAF reste à 7,1 ms, mais il masque des à-coups plus rares : sur le scénario
combiné, le maximum observé est de **27,8 ms en CSS contre 173,8 ms avec Pixi**.
Sur les effets rapprochés : 14,0 ms contre 41,9 ms. Le p95 pointeur du scénario
combiné est de 11,8 ms contre 12,4 ms.

Les temps cumulés varient beaucoup dans cette configuration : par exemple,
Épique en CSS prend de 616,7 à 1 105,8 ms selon le passage. Cette série ne permet
pas d'établir un pourcentage stable de surcoût sous contrainte CPU. Elle ne montre
pas de bénéfice et révèle des pauses ponctuelles plus longues avec Pixi.
Le scénario combiné comprend la première utilisation de nouvelles textures après
la chauffe Épique ; le banc ne sépare pas leur premier upload du rendu courant.
Ce ralentissement n'est pas une simulation d'iPhone ou de GPU peu puissant.

## Mémoire et chargement

Le tas JavaScript après GC, médiane des neuf sessions par moteur, est de 12,99 Mio
en CSS et 13,82 Mio avec Pixi. Après démontage : 13,00 et 13,72 Mio. Les modules
chargés et l'instrumentation restent présents ; ces chiffres ne mesurent ni la
mémoire GPU ni toute la mémoire du navigateur et ne constituent pas un test de
fuite de longue durée.

Le module principal Pixi de la compilation du jeu représente 381,25 kB minifiés
(112,13 kB gzip), plus ses petits modules d'environnement. Le test vérifie qu'il
n'est pas téléchargé en mode CSS. Les sept textures appartiennent à l'instance et
sont détruites, avec le contexte et le canvas, au démontage de la surcouche.

## Validation

- 36 poses capturées, soit 18 comparaisons CSS/Pixi : position, échelle, dimensions
  et opacité, en formats ordinateur, mobile et allégé. Captures desktop/mobile
  également inspectées. Il ne s'agit pas d'une identité pixel par pixel.
- 72 séquences de mesure terminées sans exception navigateur.
- Repli CSS vérifié après perte du contexte et lorsqu'aucun contexte WebGL ne peut
  être créé ; démontage du canvas vérifié ; texte invalide conservé en CSS.
- 17 tests ciblés réussis : préchargement des images, feature de célébration,
  effets, live feed et validation des mots au clavier/tactile.
- Compilation de production du client réussie dans `.Tmp/bigscore-pixi-build`.
  Les fichiers publics n'ont pas été recopiés dans cette sortie de validation.

La mesure porte sur la surcouche isolée, dans Chrome sur cette machine. Elle ne
mesure pas l'affichage physique de l'écran, l'INP, l'énergie, Safari/iOS ou une
partie complète. Le prototype reste disponible pour des essais sur d'autres
appareils, sans activation générale et sans déploiement.

[Protocole et commandes de reproduction](../dev/bigscore-benchmark/README.md).
Résultats bruts locaux : `.Tmp/bigscore-review/results.json` ; captures PNG dans le
même dossier. Relancer avec `npm run benchmark:bigscore`.
