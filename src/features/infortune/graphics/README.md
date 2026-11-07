# Affichage de la roue par appareil

Le réglage automatique vise le niveau le plus détaillé qui reste régulier autour
de 30 FPS. Il essaie haute, moyenne, puis légère. Tout passage suffisamment
mesuré sous 25 FPS est exclu, y compris un passage interrompu par le joueur.
Entre 25 et 30 FPS, le niveau inférieur est privilégié. La tolérance numérique
est 29 FPS pour ne pas rejeter un plafond de 30 mesuré à 29,9 ; le p95 doit rester
à 50 ms ou moins. Introduction et rotation doivent chacune comporter au moins
40 intervalles et 1,5 seconde mesurée. Les résultats sont aussi examinés quand
ils ont été mesurés. La proportion d’images lentes des anciens diagnostics ne
sert pas de seuil : elle était calculée pour 60 FPS sur les qualités moyenne/haute.

`shared/wheelGraphicsRecommendation.js` est commun au navigateur et au serveur.
Il calcule la capacité indépendamment du choix « Quelle version choisirais-tu ? ».
Ce choix, quand il désigne un mode précis, est repris comme préférence manuelle
prioritaire et dispense de mesure, même si les anciennes mesures sont incomplètes.
Les défauts visuels
signalés restent pertinents et conduisent à une proposition prudente en 2D.
Une erreur lors d’une tentative ne disparaît pas derrière une seconde tentative
réussie dans le même bilan. Des essais absents ou sautés ne prouvent pas à eux
seuls une incapacité de la 3D. Le chargement lent des shaders n’est pas assimilé
à un faible taux d’images.

## Parcours et activation

`WheelGraphicsGate` précède le montage du jeu : aucune entrée automatique dans
une salle ni manche ne démarre derrière la mesure. Il est conditionné par
`RELEASE_SCOPE.infortuneTournament`, activé dans la mise à jour majeure. Le client
Vite de développement permet aussi les essais du tournoi normal local (backend
`npm run start:local`). Le parcours initial respecte les choix et diagnostics
déjà enregistrés. Le sélecteur Graphismes est visible en production.

Essai volontaire : `/entrainement/roue/index.html?reglage=1`, également dans le
menu dev. Il permet de refaire explicitement une mesure. En développement,
`?reglage=initial` permet de vérifier le parcours initial et la réutilisation
des données sans forcer une nouvelle mesure.

Le parcours initial réutilise une mesure locale sans limite artificielle de
14 jours. Sinon il cherche le bilan du compte authentifié pour l’identifiant
aléatoire de ce navigateur. Aucun autre compte n’est consulté. Les anciens
rapports sans identifiant d’appareil reprennent automatiquement le choix explicite
le plus récent du compte, puis le mémorisent localement, sans confirmation ni test.
Cette préférence n'est pas enregistrée comme une mesure de l'appareil courant.
En l'absence de choix explicite, les anciens bilans sont proposés avec leur date
et leur navigateur : confirmer le bon bilan dispense de toute nouvelle mesure.

La fenêtre peut être remplacée par un **choix manuel immédiat**, avant ou pendant
la mesure. Les quatre niveaux restent sélectionnables, même lorsqu’un niveau
est déconseillé. Une préférence manuelle reste prioritaire sur la recommandation.
Choisir « Automatique » dans Graphismes réutilise la recommandation. Les lancers
ordinaires ne relancent ni calibration ni collecte FPS ; seule une erreur de rendu
peut déclencher le repli en 2D. Les mesures restent réservées au parcours d’accueil
et au diagnostic volontaire.
Les changements faits dans Graphismes s’appliquent au prochain plateau monté.

## Mesure et récupération

`createWheelGraphicsSetup` possède la progression, les requêtes et les délais.
Chaque niveau utilise la scène et le profil réels du jeu, joue l’introduction,
puis effectue un lancer automatiquement et recueille trois secondes de rotation.
Il est muet, ne modifie ni compte ni cagnotte, et n’envoie pas ses mesures.
Le contrôleur et les ressources de chaque scène sont libérés au changement de
niveau ou au choix manuel. Les périodes en arrière-plan sont exclues.

Chaque niveau dispose de 45 secondes visibles pour charger puis de 15 secondes
pour mesurer l’introduction et le lancer. Ces budgets sont renouvelés pour chaque
niveau : aucun délai global ne peut sauter la moyenne ou la légère après la haute.
Un délai dépassé passe au niveau suivant ; après les trois essais, le repli reste
provisoire. Ces délais ne peuvent interrompre un
appel bloquant du pilote : ils sont traités lorsque JavaScript reprend. Un marqueur
enregistré avant la mesure évite de recommencer automatiquement après un crash
ou un rechargement pendant celle-ci. Une interruption ou un délai dépassé conserve
le précédent résultat mesuré s'il existe. Sinon, la 2D est indiquée comme un
affichage provisoire, sans conclure que l'appareil manque de puissance. Le bilan
permet de reprendre explicitement le contrôle ; aucun nouveau test GPU n'est
imposé au prochain chargement. Le lancer de mesure utilise le lancement automatique,
indépendamment du rythme ou de la puissance du mini-jeu au bouton.
Le résultat est conservé pour la session si
le stockage est indisponible ; il ne peut alors survivre à un redémarrage.

## Diagnostics existants et API

Les nouveaux diagnostics volontaires incluent `environment.deviceId`.
Après un envoi réussi, leur recommandation et leur choix explicite sont mémorisés
séparément dans ce navigateur. Le menu de consultation affiche aussi le résultat
calculé pour les anciens bilans, sans réécrire leurs mesures ni leurs réponses.

`GET /api/infortune/graphics?device=...` renvoie la recommandation et la préférence
du compte authentifié, séparément, ainsi que les propositions anciennes de ce compte. L’identifiant
d’appareil sert de filtre, jamais d’autorisation. Sans compte, les mesures locales
restent utilisables. L’API ne reçoit pas de bilan automatique et ne change pas
les comptes. Aucun redémarrage du backend n’est effectué par cette mise en place.
