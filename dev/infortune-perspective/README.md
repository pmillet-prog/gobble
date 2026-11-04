# Atelier 3D — aperçu séparé

L’atelier d’origine dans `dev/infortune` conserve son apparence et ses paramètres
physiques. Ce second aperçu réutilise le moteur physique, la géométrie de contact
de la languette souple et le son existants, dans une scène Three.js indépendante.
Il utilise des tiges plus fines (rayon 1,3) et fournit ce même rayon au moteur de contact ;
le rayon par défaut de la maquette d’origine reste inchangé.

L’atelier est accessible depuis l’accueil du jeu, dans **Ateliers · Temporaire →
La roue de l’infortune · 3D**, avec le démarrage habituel `npm run dev`.
Depuis un téléphone sur le même réseau, ouvrir l’adresse **Network** affichée
par Vite (normalement `http://IP-DU-PC:3000/`), puis ce menu. Aucun serveur
supplémentaire sur le port 8777 n’est nécessaire. Le lien **Accueil du jeu**
permet de revenir à Gobble. Les réglages et la cagnotte d’essai restent locaux
à cette page ; ils sont réinitialisés en la quittant.

Les ateliers 3D et 2D sont aussi inclus dans `npm run build`, puis accessibles
avec `npm run preview -- --host 0.0.0.0` pour les essais du rendu compilé.
Ils restent des documents séparés : leurs styles et leur scène ne sont pas
chargés sur l’accueil, et quitter l’atelier libère son document et son rendu.
Le menu est temporaire et fait partie du client ; aucun déploiement n’est effectué.

Le panneau **Candidats du plateau** permet de choisir, pour chacune des deux
places, un avatar de test ou l'un des cinq présentateurs déjà présents dans Gobble.
Bernard Pinot et Julien Lechéper sont affichés initialement. Les noms suivent sur
le meuble en 3D et sous la roue en mode 2D. Les portraits conservent leur proportion,
leur éclairage et leurs reflets. Le choix se fait hors animation et ne modifie
aucun joueur ni groupe réel. En partie, le serveur fournit les deux autres membres
du groupe de la manche : voir `server/infortune/README.md` à la racine du projet.

Le lancement indépendant reste disponible :

```sh
node --preserve-symlinks --preserve-symlinks-main node_modules/vite/bin/vite.js --config dev/infortune-perspective/vite.config.mjs
```

Ouvrir <http://127.0.0.1:8777/dev/infortune-perspective/>. Le serveur ne lance pas
le backend Gobble et n’ouvre pas de socket vers le jeu.

La caméra regarde depuis le bord du curseur : hauteur **20°**, perspective **100 %**,
focale **28 mm**. L’ouverture utilise la **vue d’ensemble** (cadrage 78 %, décalage
vertical +10 %) pour inclure les trois personnages. Le bouton **Vue rapprochée**
retrouve le cadrage de la roue à 100 %, avec décalage vertical −8 %.
La perspective rapproche le point
de vue en compensant son échelle de base. Le réglage « Focale & recul » (14–85 mm,
référence film 35 mm) combine angle de champ et déplacement de caméra : grand-angle
près de la roue, longue focale plus loin. L’échelle au centre reste comparable,
mais les rapports entre plans et la position du point de fuite vertical changent.
C’est une projection rectiligne, sans déformation fish-eye. Au grand-angle extrême,
la caméra peut passer au-dessus du bord et couper fortement le premier plan.
Le plan proche avance progressivement avec le recul de la caméra pour conserver
la précision de profondeur aux longues focales, sans modifier le cadrage.

Le cadrage est libre de 30 à 300 %, sans remise à l’échelle automatique pour
garder toute la roue dans l’image. Les réglages de composition permettent de
décaler la scène et d’incliner le cadre, y compris pour des coupes volontaires.

La section **La réalisation** propose deux timelines : **Intro · 5 s** et
**Lancer · 3 s**, avec une ligne par réglage caméra. Choisir un instant avec
la tête de lecture ou le champ **Temps**, puis modifier la valeur d’une ligne
pose un point clé (précision 0,1 s). Les curseurs habituels et les deux cadrages
préréglés posent aussi des points à cet instant. Cliquer sur un losange sélectionne
son instant ; le bouton ◆ en bout de ligne retire le point sélectionné.
Entre deux points, l’interpolation `t² × (3 − 2t)` adoucit le départ et l’arrivée.
Après le dernier point, la valeur est conservée. Les pistes du lancer héritent
de la fin de l’intro à 0 s, sauf si un point explicite la remplace.

**Lire / Pause** prévisualise la séquence courante ; **Prévisualiser les 8 s**
enchaîne les deux pour la caméra seule. La première configuration fait passer
la perspective de 0 à 100 % pendant l’intro ; les autres réglages restent fixes.
Les points sont sauvegardés dans le stockage local du navigateur, pour cette
adresse de l’atelier. Le bouton **Un autre tour** se trouve dans le bandeau du haut.
Avec **Jouer les séquences pendant les tours**, l’intro démarre une fois le plateau
chargé, puis à chaque nouveau tour ; le lancer démarre au lâcher réussi de la roue.
Prendre la roue en main interrompt une éventuelle prévisualisation de caméra.
Masquer l’onglet met la timeline en pause ; il est possible de reprendre avec **Lire**.

Le lecteur de timeline réutilise la caméra Three.js et met à jour ses affichages
directement, sans rendu React à chaque image. Le canvas ne change de taille que
si la vue change réellement de dimensions. Une image physique peut absorber la
demande de rendu caméra pour éviter deux dessins de la scène au même instant.
Le lecteur et ses points sont isolés dans `createCameraTimelinePlayer.js`,
`cameraTimeline.js` et `useCameraTimeline.js` ; ils ne modifient pas la physique.

Le son de l’intro est un extrait local de 5,1 secondes du générique choisi par
Paul (`assets/intro.mp3`, source détaillée dans `assets/intro.source.json`). La
lecture suit la timeline, avec un fondu de 4 à 5 secondes et arrêt à 5 secondes.
Pause, déplacement de la tête de lecture, nouveau tour et bouton **Son coupé**
sont pris en compte. Si le navigateur exige un geste pour activer l’audio,
**Entrer sur le plateau** démarre l’intro avec le son ; la roue reste verrouillée
jusqu’à la fin de l’intro. Aucun lecteur SoundCloud n’est chargé à l’exécution.

`Bonus_Wheel_Music.mp3`, fourni par Paul, accompagne la rotation physique avec
un fondu entrant de 0,4 s et sortant de 0,65 s à l’arrêt. Les `suspense-drums`
démarrent sous 0,18 tour/s et continuent jusqu’à l’arrêt réel, y compris pendant
les rebonds ; ils sont indépendants des trois secondes de caméra. La musique
baisse sous les tambours. Tous ces sons suivent le bouton Son et la visibilité.

Le bilan utilise six bruitages procéduraux originaux, générés par
`generateResultSounds.py` : petit gain (jusqu’à 200), beau gain, 1 000, Bonus,
Banqueroute et Échange. Ce dernier reste uniquement une préfiguration sonore.
Les fichiers suivent les trois secondes du retour plateau, y compris pause et
relecture. **Bruitages du bilan → Écouter les variantes** permet de les auditionner
entre deux animations, sans changer le résultat. Aucun générateur IA audio ni
calcul de synthèse n’est exécuté pendant le jeu.

Une des cases 100 est remplacée par **Passe**, une tuile sans gain (`kind: pass`,
`amount: 0`). Les 24 secteurs et les positions opposées de Bonus / 1 000 sont
conservés. Le bonus de qualité du geste reste indépendant du secteur obtenu.

Les réactions de public fournies par Paul partent une seule fois à l’arrêt
physique : 100 / 150 → « pas ouf 1 » ou « pas ouf 2 » au hasard ; 200 à 300 →
« honorable » ; 400 / 500 → « 500 » ; 1 000 / Bonus → « top prix ». Les autres
secteurs n’ont pas de réaction de public attribuée. La timeline ne redéclenche
pas ces réactions ; **Bruitages du bilan → Réactions du public** permet de les
écouter séparément. Elles s’arrêtent au nouveau tour et respectent Son coupé.

Le plateau a une tranche, une bordure métallique, des tiges verticales et des
plaques fines avec de vraies perforations autour de petites tiges de centrage.
L’épaisseur est d’environ 1 unité pour les plaques peintes et 1,36 pour les dorées,
biseaux compris. Le chanfrein est discret ; les rondelles, les guides et la fine
sous-couche dorée suivent cette échelle. La languette possède une épaisseur et suit exactement l’arc
souple utilisé par la physique. Tous les volumes participent à la perspective,
aux reflets et aux ombres.
Les bandes bleues et dorées du pourtour partagent leurs bords : aucune surface
bleue ne double les incrustations dorées. Le dessus du meuble s’arrête également
avant sa moulure extérieure. Le corps des tiges utilise un métal poli anisotrope
(reflets étirés suivant leur axe), avec le même environnement que leur couronnement.

Le médaillon central fixe porte **ROUE DE L’INFORTUNE** en lettres dorées et
**GOBBLE** en ivoire émaillé, sur un fond bleu nuit verni cerclé de laiton.
Les lettres sont extrudées et biseautées : leurs reflets et leurs ombres viennent
des lumières du plateau. Le médaillon utilise quatre maillages, sans texture de
texte ni animation supplémentaire. La police Helvetiker Bold est fournie par
Three.js ; sa licence est reproduite dans `FONT-LICENSE.txt`.

Le réglage **Le curseur** conserve la **Languette actuelle**, active par défaut,
et propose une **Aiguille souple**, ainsi qu’une **Goutte sur pivot**. Le choix se
fait entre deux lancers et prépare un nouveau tour. L’aiguille mesure 56 unités,
avec un rayon de contact de 0,65 et
une épaisseur de 2,2 ; sa base s’élargit seulement dans la zone inaccessible aux
taquets. La languette garde ses dimensions 54 / 2 / 6 et ses coefficients d’origine.
Le même profil est fourni au maillage, aux contacts et à la lecture du résultat.
Le rappel et l’amortissement de l’aiguille sont réduits dans le modèle élastique
simplifié, sans temporisation de suspense ni choix forcé du gain. Des arrivées
d’énergie très proche produisent une flexion prolongée puis un passage ou un
retour en arrière.

La goutte reprend une base circulaire de rayon 10,5, prolongée par deux flancs
tangents jusqu’à une pointe à 27 unités du centre. Son axe est placé au centre
du cercle, sous le boulon visible, à 285 unités du centre de la roue. La réduction
est homothétique de moitié ; le support est aminci en conséquence. La pièce
est portée à Y = 26,5, à hauteur de contact des tiges. Avec le meuble rehaussé,
sa visibilité au premier plan dépend du cadrage. La pièce rouge de 1,6 unité d’épaisseur
tourne en bloc ; son maillage ne se déforme jamais. Un ressort de torsion
linéaire et un amortissement au pivot assurent le rappel. Les contacts utilisent
les flancs et la pointe de cette même forme, dans `pivotPawlGeometry.js` ; le
résultat est lu sous sa pointe mobile. Les trois variantes gardent le pas
physique fixe de 1/240 s et la même roue, sans choix aléatoire du résultat.

Le plateau de test comprend un meuble annulaire, un socle et un sol presque noir.
Trois rangées photoréalistes de public détouré occupent des gradins circulaires
dans la pénombre, avec de faibles reflets bleutés sur les têtes. Le reste du fond est noir ; les trois
faisceaux bleuté, ambré et mauve descendent depuis les projecteurs suspendus
au-dessus des gradins, hors champ en vue d’ensemble. Christian Morin est au
centre, derrière le meuble ; Alix et Sam
sont deux candidats fictifs, un de chaque côté. Leurs configurations figurent
dans `stageFixtures.js`. Elles sont rendues par le moteur d’avatars du jeu sur
des canvas transparents, puis placées dans l’espace avec des plans verticaux.
Les candidats sont orientés de trois quarts vers la zone de jeu de la roue,
sans étirement de l’image et sans orientation automatique vers la caméra.
La perspective affine ainsi leurs visages au lieu de les présenter de face.
Les matériaux des portraits reçoivent les lumières ; une faible contribution
émissive conserve la lisibilité de l’éclairage déjà dessiné dans les textures.
Le meuble masque naturellement les parties basses via le tampon de profondeur.
Sa façade arrière mesure 255 unités de haut, avec un dessus à Y = 120,5 ;
le devant reste abaissé pour dégager le curseur. Toute la paroi verticale
intérieure est un écran courbe continu, jusqu’en bas et sur tout le cercle.
`stageDeskScreen.js` dessine un fond bleu lumineux commun et de larges touches
de couleur qui se fondent les unes dans les autres, sans cadres individuels.
Le titre occupe le centre, les pseudos et cagnottes sont inscrits sous les
avatars dans la partie haute, entre Y = 40 et 96, au-dessus du ruban LED à
Y = 14. Les montants restent masqués en manche 4. Les dimensions et les repères
de texte sont partagés dans `stageDeskDimensions.js`.
La paroi est remplacée directement, sans surface superposée. Ses UV sont
orientés pour lire depuis l’intérieur, avec le raccord sur le devant abaissé.
Un matériau émissif utilise une seule texture canvas réutilisée, mise à jour
uniquement lorsque les informations changent : 4 096 × 512, ou 2 048 × 256 en
qualité légère, dans la limite de la carte graphique. Aucun chargement d’image,
aucune boucle supplémentaire et aucune passe de rendu ne sont ajoutés.

Les trois silhouettes portent un halo extérieur calculé depuis la transparence
de leur image, avec une marge pour ne pas le couper aux bords du fichier. Le masque
stocke aussi la direction extérieure du contour. À chaque rendu,
`dynamicActorHalo.js` combine les positions, directions, couleurs, intensités et
pénombres réelles des trois spots : les bords tournés vers la lumière brillent
davantage. L’angle entre cette lumière et la caméra module l’éblouissement ; le
halo évolue donc lorsque « Focale & recul » déplace la caméra. Les spots gardent
leur position dans le plateau. Ce calcul s’applique aussi depuis la caméra de
reflet, sans régénérer les masques. Le gain de puissance des projecteurs est
compensé uniquement dans la réponse du contour pour conserver son intensité
actuelle ; la forme, l’étendue et la couleur des halos restent identiques.
À l’intérieur de la silhouette,
un dégradé noir vers transparent assombrit le contour, renforcé par un liseré
intérieur presque noir sur cinq pixels du masque, puis adouci jusqu’à dix pixels.
Ce traitement assombrit aussi l’émission du portrait, sans modifier l’alpha,
ses proportions ni sa silhouette dans les ombres. Les masques sont
préparés une seule fois au chargement dans `actorContourEffects.js`, à une
résolution plafonnée. Les images sources restent intactes ; seul le halo ajoute
un plan transparent par personnage, sans passe de bloom sur tout l’écran.

Un bandeau de 224 diodes cyan à cœur clair parcourt les faces verticales intérieure
et extérieure du meuble, dans un logement sombre sous le plateau. La partie
intérieure, à Y = 14, reste visible autour de la roue dans le cadrage d’ensemble,
même lorsque le devant du meuble sort du champ. Chaque bandeau épouse la pente de
sa façade et dépose une lueur diffuse au-dessus et en dessous. L’ensemble est
construit dans `createStageLedBand.js` avec des textures procédurales partagées
sur le pourtour. Les diodes ont un matériau émissif HDR d’intensité 5, également
visible dans la capture du décor. Leur émission seule ne produit pas de rebond
lumineux automatique avec ce moteur de rendu.

`stageLedLighting.js` ajoute donc six `RectAreaLight` par face, soit douze sources
cyan fines d’intensité 8, pour approximer les rubans lumineux continus. Elles
éclairent directement les matériaux physiques : vers la roue pour le bandeau
intérieur, vers l’extérieur et le bas pour l’autre. Leur lumière contribue au
diffus et au spéculaire, sans passe de rendu supplémentaire. Ces sources ne
calculent pas d’ombres ; il s’agit d’un éclairage d’appoint, sans simulation de
rebonds ni d’occultation par le meuble. Les textures LTC nécessaires sont
partagées entre les instances de l’atelier et libérées avec la dernière.
Les personnages et leurs halos ont leur propre reflet.

Le portrait du présentateur a été créé avec l’outil intégré **image_gen**, à partir
d’une référence publique de Christian Morin et du style du présentateur Lepers
déjà présent dans le projet. L’asset avec transparence est conservé dans
`assets/christian-morin-v1.png` ; le prompt exact et les références sont dans
`assets/christian-morin-v1.prompt.txt`. Aucun nom parodique n’est attribué.

Le rendu utilise **Three.js 0.179.1**, `WebGLRenderer`, des matériaux physiques
`MeshStandardMaterial` / `MeshPhysicalMaterial` et une caméra `PerspectiveCamera`.
La physique de la roue reste le simulateur local, indépendant de Three.js.

L’éclairage associe deux sources directionnelles (principale 1,6, appoint 0,4),
une faible lumière hémisphérique (0,14), trois projecteurs arrière suspendus
à Y = 1040 / 1160 / 1040, au-dessus des spectateurs. Ce sont trois `SpotLight`,
dont la puissance est multipliée par 2,5 (intensités 1 300 000 / 1 600 000 /
1 300 000 dans les unités du plateau),
avec des demi-angles indépendants de 0,29 / 0,34 / 0,29 rad (ouvertures totales
d’environ 33° / 39° / 33°) et une pénombre de 0,15. La visée couvre les personnages
et les points de réflexion spéculaire du meuble dans le cadrage d’ensemble.
Les reflets directs restent calculés par les matériaux physiques et se déplacent
normalement avec la caméra. Des boîtiers et lentilles 3D, dans `spotFixture.js`,
matérialisent les sources pour la capture d’ambiance. Aucun grand sprite de halo
tourné vers la caméra ne représente les projecteurs. La brume est limitée aux
cônes et suit leur couleur, leur puissance, leur atténuation et leur extinction.
Une carte de studio sombre à trois panneaux
lumineux (intensité globale 0,6) complète cet éclairage. Elle est précalculée via `PMREMGenerator`.
Cette carte fournit l’ambiance de base. Une fois les trois personnages chargés,
une `CubeCamera` placée près de la roue capture le décor et une ambiance lointaine
de public plongé dans le noir. Le public utilise trois images RGBA distinctes,
générées par l’outil intégré **image_gen**, de huit spectateurs chacune, tous
photographiés frontalement avec le corps entier et le siège visibles :

- `assets/audience-row-front-v1.png` ;
- `assets/audience-row-middle-v1.png` ;
- `assets/audience-row-back-v1.png`.

Les prompts exacts sont conservés à côté de chaque image dans son fichier
`.prompt.txt`, et réunis dans `assets/audience-rows-v1.prompts.txt`.
Chaque image mesure 2172 × 724 et garde son véritable alpha, notamment entre
les têtes et sous les sièges. Les rangées ne contiennent aucun autre rang déjà
dessiné : leur occultation provient de la profondeur de la scène.

Dans `audienceRows.js`, chaque rangée occupe un arc de cercle concentrique à la
roue, de rayon **580**, **690**, puis **800**. La hauteur de l’image reste 440 et
sa longueur d’arc conserve les proportions de la photo. La base monte de −30 à
85 puis 200 ; le rang intermédiaire est légèrement décalé angulairement. De
petites plateformes annulaires sombres soutiennent les sièges. Les multiplicateurs
linéaires de luminosité sont 0,08 / 0,055 / 0,035 pour ne laisser principalement
paraître que les reflets bleus sur les têtes. Un dégradé noir supplémentaire,
propre à chaque rangée, conserve seulement 4 % de cette lumière en bas et 60 %
en haut : les pieds se fondent dans le noir et les têtes restent voilées.
L’assombrissement ne diminue pas l’opacité des personnes : elles cachent réellement
les rangs suivants.

`createAudienceEnvironment.js` installe ces trois surfaces dans la scène
principale. Leur perspective et leur parallaxe suivent la caméra ; la capture
d’ambiance attend le chargement des trois images. Le détourage et le tampon de
profondeur laissent apparaître les têtes du fond tout en masquant une partie des
corps et des jambes. Les tests vérifient cette occultation à partir du véritable
alpha des PNG, ainsi que le cadrage complet du premier rang en vue d’ensemble.
La roue et les
personnages sont exclus de cette capture. Deux panneaux de studio hors
champ complètent les reflets ; la carte filtrée est affectée aux métaux, aux
secteurs vernis de la roue et au meuble. Cette capture est faite une fois, pas à chaque image : les
reflets restent sensibles au mouvement de la roue et de la caméra. Il s’agit
d’une approximation depuis une seule position, destinée aux surfaces satinées.

L’essai **Sphère synchronisée**, disponible dans **Ambiance · essai sphérique**, reprojette les reflets de cette
capture sur une sphère de taille finie centrée au même endroit. Le shader calcule
l’intersection du rayon réfléchi avec la sphère, puis consulte la carte filtrée.
Cela concerne les reflets des métaux et des vernis, avec la même rugosité et sans
changer l’éclairage diffus. La sphère n’est pas un objet visible du décor.
Le rayon suit la focale selon `R = 500 + (R28 − 500) × focale / 28`, en unités du
plateau ; `R28` vaut 2100 par défaut. Le minimum conserve le meuble à l’intérieur
du volume. Cette loi reste expérimentale et concerne uniquement l’ambiance.
Le mode **Lointaine**, actif par défaut, garde une projection à l’infini.
Le rayon calculé est affiché et la taille à 28 mm est ajustable dans
**Calibrer la taille de départ**. L’essai est isolé dans `sphericalReflections.js`.

Les personnages, leurs halos et les petits éléments du meuble dépassant de son
dessus sont rendus séparément dans `createActorReflections.js`. Une caméra
réfléchie par le dessus réel du meuble à Y = 120,5 reprend exactement la projection,
le décalage et l’inclinaison de la caméra principale. Elle rend les véritables
plans des personnages à leur position 3D, avec leur transparence et leur
éclairage. La découpe du plan et le tampon de profondeur gèrent les occultations.
Le matériau du dessus du meuble consulte cette image à la place de l’ambiance
aux endroits où elle contient un personnage ; ses mipmaps adoucissent le reflet
selon la rugosité. Les côtés verticaux, la roue et les surfaces courbes conservent
les reflets d’ambiance : cette réflexion plane est réservée au dessus du meuble.

La capture des personnages est limitée à 512 × 512, sans anticrénelage multiple,
et reste en cache pendant les lancers. Elle est renouvelée après un changement
de cadrage ou des paramètres des lumières, sans recalculer les cartes d’ombres
pour cette passe. Le bouton **Personnages : activés / masqués** permet de comparer.
Les ressources privées de cette réflexion et les masques des halos sont libérés
avec la scène. Le calcul d’alignement est vérifié sur plusieurs focales, décalages
et inclinaisons ; le rendu visuel reste à apprécier dans l’atelier.

Les tuiles colorées sont non métalliques, avec une rugosité de 0,34 à 0,38 et un
vernis satiné de 0,42 pour rendre les reflets perceptibles sans blanchir la couleur.
Le métal et l’or conservent des reflets plus concentrés. Le tone mapping est
`NeutralToneMapping`, avec exposition 0,95.

Les trois personnages projettent leur silhouette grâce à leur transparence dans
les cartes d’ombres. Les projecteurs arrière conservent ces cartes après le
chargement du plateau, sans recapturer la roue à chaque image. Une brume
volumétrique légère remplit chaque cône : 24 tranches orientées vers la caméra
échantillonnent son intérieur, sa puissance, sa pénombre et ses ombres filtrées.
La diffusion favorise légèrement la direction de la lumière. Le poids de chaque
échantillon suit son espacement réel pour rester cohérent quand la caméra change.
Le tampon de profondeur masque les tranches derrière le meuble et les silhouettes.
Les tranches d’un projecteur partagent un maillage et un appel de dessin ; aucune
copie de profondeur ni passe de scène supplémentaire. Il s’agit d’une intégration
approchée de la diffusion simple, sans diffusion multiple ni bloom optique. Le coût
de remplissage augmente avec les volumes visibles, même si les appels de dessin
diminuent. Géométries,
shaders et cartes d’ombres sont libérés avec la scène. Les réglages de caméra et la
physique du lancer restent indépendants de cet éclairage.

Repères : [matériaux physiques](https://threejs.org/docs/pages/MeshStandardMaterial.html),
[caméra](https://threejs.org/docs/pages/PerspectiveCamera.html),
[reflets du décor](https://threejs.org/docs/pages/CubeCamera.html),
[import glTF/GLB](https://threejs.org/docs/pages/GLTFLoader.html).

La souris et le doigt utilisent un rayon issu de la caméra pour retrouver le
point sur le plateau, même après décalage et inclinaison du cadre. WebGL est
nécessaire pour cet atelier. Les réglages de caméra ne modifient pas la physique.

Le mini-jeu de **qualité du lancer** partage son contrôleur avec l’intermanche,
avec son état dans `wheelLaunchGame.js` et son interface dans `LaunchControls.jsx`.
Le premier bloc **Le lancer → Mini-jeu au geste** permet d’essayer trois modes
dans l’atelier, en 3D comme en 2D. L’intermanche conserve pour l’instant **Puissance**.
Une seule jauge affiche la puissance de 0 à 100 %, avec un repère minimum à
environ 36 % (6,5 rad/s sur un maximum de 18). La roue suit directement la main
dans les deux sens ; aucune préparation d’élan ni préférence de sens n’est requise.
En mode **Puissance**, `wheelScreenGesture.js` mesure la composante tangentielle du glissement
en pixels CSS, rapportée à la largeur de la vue. La vitesse est ainsi indépendante
de l’amplification des angles par la perspective et de la densité de pixels.
`wheelGesturePower.js` la filtre avec une constante de temps de 100 ms, puis
calcule `puissance = 1 − exp(−abs(vitesse) / 1,8)`, en largeurs de vue par seconde.
Cette saturation progressive laisse une plage de dosage aux gestes ordinaires.
Le calcul tient compte de la durée réelle entre événements ; une pause laisse
redescendre la jauge progressivement, même sans nouvel événement. La puissance
au lâcher fournit directement la vitesse initiale de la roue, avec son signe.

Au clic, Espace ou Entrée : une première activation démarre la jauge de puissance,
la suivante la bloque et lance la roue si le minimum est atteint. Un aller de
0 à 100 % prend entre 0,44 et 0,56 seconde. La cible et cette durée changent entre
les essais, mais restent fixes pendant chaque tentative. Cette variation est
déterministe, sans hasard injecté dans le résultat de la roue.

Le geste **Puissance** et le clic visent la même zone : au plus 2,8 points de pourcentage
du centre doré pour **Lancer parfait**, au plus 11 pour **Beau lancer**, sinon
aucun bonus. Seule la puissance compte ; un geste dans l’un ou l’autre sens
peut obtenir le même bonus. La valeur de la jauge correspond à la vitesse
effectivement transmise au simulateur.

Les deux autres variantes au geste sont gérées par `wheelSkillShot.js` :

- **Fronde** : attraper la roue fait apparaître un lien élastique et une cible
  qui oscille légèrement. Tirer puis lâcher fournit une vitesse proportionnelle
  à l’étirement, dans le sens opposé à la traction. Le bonus dépend de la distance
  entre le doigt et la cible au moment exact du lâcher, sans modifier cette vitesse.
- **Balayage de précision** : une courbe apparaît depuis le point de prise. Il faut
  la suivre d’un geste continu et lâcher dans la cible, qui termine réellement
  le guide. Des flèches indiquent le sens ; la trace du doigt et la puissance
  restent visibles pendant le geste. Le dosage propre à ce mode accepte un
  tracé régulier de l’ordre de 0,6 à 1 seconde, sans exiger le coup rapide du mode
  Puissance. Le bonus juge la sortie, l’écart
  moyen au tracé et les retours en arrière ; arriver dans la cible n’efface pas un
  mauvais trajet. La vitesse de progression fournit la puissance physique et une
  pause fait redescendre celle-ci. Au lâcher, un échec indique sa cause : vitesse
  insuffisante, sortie de la cible, écart au tracé ou retour en arrière.

Les guides restent dans la vue et utilisent des distances écran normalisées,
sans dépendre de la focale ou de la densité de pixels. Le tracé est échantillonné
par distance parcourue, pas par nombre d’événements tactiles. Les cibles varient
entre les tours. Leurs marqueurs SVG suivent la boucle existante, sans état React
par image. Le clic conserve toujours la jauge rapide, quelle que soit la variante
gestuelle choisie. La maquette d’origine n’est pas modifiée.

Le barème d’essai est **50 / 100**, modifiable avant un lancer. Le bonus est
comptabilisé une seule fois au lancement réussi dans une cagnotte locale,
distincte de l’affichage du secteur. Une préparation annulée, un lâcher trop
faible ou un clic supplémentaire n’ajoute rien. Le score et le montant du bonus
ne changent jamais l’angle, la vitesse ou le secteur final ; seuls les gestes
et valeurs choisis alimentent la physique. Les tests comparent notamment le
même lancer avec différents barèmes et différents taux de rafraîchissement.
Cette cagnotte se réinitialise au rechargement et n’est pas reliée au compte
du joueur ni au backend. La maquette d’origine conserve son bouton à maintenir.

Le rendu suit les images du contrôleur physique et les changements de caméra :
aucune boucle de rendu permanente à l’arrêt, aucun état React mis à jour à chaque
image. Les marqueurs des jauges sont mis à jour directement dans le DOM ; quand
seules les jauges bougent, la scène 3D immobile n’est pas redessinée. Les cibles
apparaissent aussi sur la vue pendant le geste pour rester lisibles sur mobile.
Les tiges et les paillettes utilisent des instances. Géométries, textures,
matériaux, ombres et ressources du renderer sont libérés au démontage.
Le démarrage WebGL est différé et annulable : le montage de contrôle de
`StrictMode` ne construit plus une première scène aussitôt détruite. Aucun rendu
partiel ne démarre pendant le chargement. Avant de déclarer le plateau prêt,
la préparation transfère les textures, pose les modifications définitives des
matériaux avant la première compilation et prépare seulement les objets visibles
sur les couches de chaque passe (écran, capture cubique, reflets des avatars),
puis effectue le premier rendu complet. Les étapes rendent la main au navigateur
et sont indiquées à l’écran ; l’intro conserve ses cinq secondes après cette
préparation. Une compilation en cours termine avant la destruction de ses
ressources GPU.

`compileWheelPass` soumet les programmes puis interroge leur état de compilation
sans blocage si `KHR_parallel_shader_compile` est disponible ; sinon il compile
par petits lots avec une pause entre les lots. L’attente est annulable et se
termine aussi si le contexte est perdu, sans laisser de timer de compilation.
Le compteur d’objets ne prétend pas que le pilote a fini de compiler.
`finishWheelPrograms` vérifie ensuite les liens des programmes WebGL un à un,
avec une progression distincte et une pause avant chaque interrogation du pilote.
Cela répartit l’attente auparavant masquée dans le premier rendu ; sans l’extension,
un appel individuel du pilote peut encore bloquer. Les programmes déjà validés
ne sont pas vérifiés à nouveau lors des captures suivantes.
Les copies temporaires partagent les géométries et matériaux, sans déplacer les
objets de la scène. Les tuiles Échange encore cachées sont précompilées
explicitement pour ne pas reporter leur coût au début de leur chute.
Le bandeau LED conserve six sources surfaciques par face, quel que soit le
navigateur. Leur shader utilise une boucle compacte ; les lectures des tables
LTC et les transformations communes au fragment sont calculées une seule fois
avant cette boucle. Les contributions des sources gardent leur ordre et leur
modèle d’éclairage. Les spots, leurs ombres et les reflets restent de vrais
calculs 3D. Les portraits plans transparents sont rendus en une passe double face.

Le jeu et l’atelier partagent un cache graphique local à leur document :
`wheelSceneSession` possède le canvas, le renderer et le générateur PMREM ;
`wheelRendererCache` garde au maximum une scène suspendue pendant cinq minutes
après son dernier affichage. Le prochain plateau est reconstruit avec les
candidats, noms et cagnottes actuels sur le même contexte. L’ancienne scène garde
ses références aux programmes jusqu’à la fin de toutes les nouvelles passes,
puis libère ses textures, géométries et matériaux. Le cache fonctionne donc aussi
quand les candidats changent. Les callbacks de la vue précédente sont détachés ;
aucun rendu, geste, son ou séquence caméra ne reste actif hors affichage.

Une préparation interrompue ou un contexte perdu sont détruits ; le choix de la
2D libère également la mémoire graphique. L’expiration, la navigation et le
remplacement à chaud invalident la réserve. Le canvas est inséré dans un hôte
React (`WheelCanvas`) pour que sa durée de vie soit indépendante de celle de la
vue. La calibration de 1,2 seconde reste exécutée à chaque plateau. Le panneau
de performances précise si le contexte a été réutilisé. Ce cache ne survit pas
à F5 ; le diagnostic conserve des contextes indépendants pour mesurer les
chargements complets, sans consommer ni remplacer la réserve du jeu.

Après huit secondes visibles de préparation, le rapport signale une attente
longue mais ne classe plus l’appareil en 2D : le temps de compilation ne mesure
pas sa fluidité. Le benchmark réel reste responsable du choix automatique.
Les anciennes décisions automatiques du cache v1 sont réévaluées une fois ; les
choix explicites sont conservés. Les onglets masqués ne consomment pas ce délai.
Un bouton de passage immédiat en 2D reste accessible pendant la préparation.
Le benchmark renonce à attendre huit échantillons lorsqu'il dépasse quatre
secondes sur un appareil extrêmement lent.

Le son précharge les octets compressés de l'intro sans AudioContext. Le contexte
est créé sur un geste, ou si le document autorise déjà l'audio après les actions
de jeu. Les autres sons sont décodés progressivement après l'intro. Le montage
de contrôle React est annulé avant de créer ses ressources audio.

**Affichage et fluidité**, en haut des réglages, propose Automatique, 3D détaillée,
3D équilibrée, 3D légère et 2D. Les choix sont mémorisés dans le stockage local
de cette origine ; ils sont également utilisés par la roue d’intermanche.
L’automatique commence en 3D équilibrée (légère si les indices matériels disponibles
le suggèrent). Après préparation, un mouvement de caméra de 1,2 seconde mesure
la cadence réelle ; les deux premières images sont écartées. En cas de difficulté,
la mesure recommence en légère, puis choisit la 2D si elle ne tient pas environ
30 images/s. Aucun téléphone n’est classé en 2D sur son nom ou sa mémoire seule.

Les niveaux réduisent la définition interne, les cartes d’ombres, les captures
des reflets des avatars et les couches de brume, en conservant les vraies lumières.
Le rendu vise 60 images/s, ou 30 en légère. La physique garde son contrôleur et
son pas de simulation ; seule la fréquence des dessins change. Pendant une
animation, deux fenêtres consécutives de ralentissement entraînent une baisse
de niveau. Un geste tenu se termine avant ce changement. Les périodes immobiles,
le chargement et les onglets masqués ne pénalisent pas la mesure. La qualité ne
remonte pas continuellement, pour éviter les oscillations.

La 2D utilise Canvas, les mêmes secteurs, les trois modèles de curseur, le même
mini-jeu de puissance et le même contrôleur. Changer d’affichage ne réinitialise
ni le lancer, ni le résultat, ni la cagnotte. Le décor, ses images et le moteur
d’avatars ne sont pas chargés quand le choix initial est 2D ; la scène WebGL
est importée à la demande. Une erreur de préparation 3D ou une perte du contexte
passe également en 2D. Le rendu du résultat est simplifié : secteur lumineux et
libellé horizontal. Les chronologies de l’intro, du son et du retour sont conservées.

Un choix manuel reste prioritaire. Une recommandation automatique est valable
14 jours, puis réévaluée ; en 2D, **Réessayer la 3D en automatique** relance la
préparation et la mesure. Le panneau expose cadence, 95e percentile et temps
séparés « images et avatars », « préparation graphique », « mesure ». Le premier
temps inclut téléchargement, décodage et composition, pas seulement le réseau.
La préparation graphique détaille désormais environnement, textures, shaders,
ombres, reflets du studio, reflets des avatars et première image, avec le nombre
de programmes et la disponibilité de la compilation parallèle.
Les seuils sont des valeurs initiales à calibrer sur des appareils réels ; les
tests automatisés ne constituent pas un benchmark de téléphone.
Le moteur d’avatars est chargé à la demande. La compilation de cet atelier
embarque seulement les pièces nécessaires aux deux candidats, leur catalogue
et les images générées du présentateur et du public, sans recopier tout le répertoire public du jeu.

```sh
node --preserve-symlinks --preserve-symlinks-main --test dev/infortune-perspective/*.test.js
node --preserve-symlinks --preserve-symlinks-main --test src/features/infortune/*.test.js
node --preserve-symlinks --preserve-symlinks-main node_modules/vite/bin/vite.js build --config dev/infortune-perspective/vite.config.mjs
```
