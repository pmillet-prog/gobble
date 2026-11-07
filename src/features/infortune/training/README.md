# Diagnostic volontaire de la roue

Accessible depuis Entraînement → Tester le lancer de roue, à `/entrainement/roue/index.html`.
L’index explicite est nécessaire avec le serveur de production `serve -s` :
le chemin de dossier `/entrainement/roue/` est intercepté par le fallback du jeu.
Le document commence par une explication modale. Le moteur et les ressources du
plateau ne sont importés qu’au démarrage du premier passage.

Le parcours impose successivement `flat`, `light`, `balanced`, puis `detailed`.
Chaque passage 3D joue l’introduction ; la 2D laisse lancer dès qu’elle est prête,
sans attente de caméra ni de son. Chaque passage attend l’arrêt de la roue et
l’animation de résultat, puis propose le passage suivant. Une seconde tentative
par qualité est possible. Un joueur peut interrompre un passage ou terminer
plus tôt pour répondre au questionnaire. Une préparation dépassant 45 secondes
au premier plan est enregistrée comme interrompue. Aucun score réel n’est modifié.
Le geste est fixé au lancer par puissance ; le lancer au clic reste disponible.
Les gestes alternatifs sont réservés à l’atelier.

Les passages du diagnostic ne lisent ni n’écrivent la préférence de qualité du joueur.
Une erreur 3D est enregistrée explicitement : elle ne devient pas silencieusement
une mesure de la 2D. Après l’envoi réussi d’un nouveau bilan identifié par appareil,
une recommandation calculée depuis les mesures est conservée séparément ; elle
ne remplace pas un choix manuel. Voir le [réglage par appareil](../graphics/README.md).

## Mesures

`createWheelDiagnosticRun.js` collecte les appels de rendu réels, sans lancer de
boucle graphique supplémentaire. Les FPS, p95, intervalle maximum et proportion
d’images lentes sont séparés entre introduction, geste, rotation et résultats.
Les périodes inactives et les pauses en arrière-plan ne constituent pas des
intervalles de mesure. Le seuil d’image lente tient compte de la cible de 30 FPS
en 3D légère, contre 60 pour les autres qualités.

Le temps de chargement commence au clic qui lance un passage, donc comprend aussi
l’import différé du code. Sont conservés le temps au premier plan, le temps total,
le délai avant l’intro (incluant une éventuelle attente du son), la préparation des
images, des graphismes et la calibration. Les tâches longues sont relevées lorsque
le navigateur expose cette API. Les informations matérielles sont indicatives.
Le temps CPU d’un rendu ne constitue pas une mesure indépendante du temps GPU.

Chaque mode peut charger ses propres ressources, notamment au premier passage
en 3D après la 2D. Chaque passage recrée puis détruit sa scène et son contexte
graphique, ses contrôleurs, écouteurs, sons et séquences caméra. Le test ne conserve
pas de plateau entre les passages : cela masquerait les différences de chargement
entre navigateurs. Le navigateur peut conserver son propre cache HTTP et de shaders.
Le cache de contexte ajouté au jeu et à l’atelier est explicitement désactivé
pour ces passages : les mesures continuent à inclure toute la préparation
graphique. Le diagnostic ne consomme ni ne remplace une éventuelle réserve
graphique de la page.

Le rapport conserve les durées par étape (`timings.steps`) : textures, shaders,
ombres, reflets et premier rendu. Ces essais ne sont pas à cache vide.
La validation des programmes mesure séparément les appels bloquants `LINK_STATUS`
et l’attente entre appels. Les totaux et les seize programmes les plus lents sont
visibles et copiables dès le plateau, puis dans chaque bilan de passage. La mesure
n’ajoute aucune requête WebGL : pas d’inspection des sources GLSL ou de changement
de stratégie de compilation pour obtenir ces chiffres.

## Sondage et réception

Le questionnaire recueille la fluidité ressentie par qualité, les saccades 3D,
le chargement (non / première fois / plusieurs passages), les défauts d’image,
le geste, le son, la version préférée et un commentaire facultatif. Le joueur
déclenche lui-même l’envoi. Un brouillon conservé en `sessionStorage` permet de
retrouver un bilan non envoyé après rechargement du même onglet. L’échec d’un envoi
ne nécessite pas de refaire les lancers ; une copie JSON est téléchargeable.
« Revoir l’aperçu », en haut du questionnaire, relance les quatre qualités depuis
la 2D, y compris après restauration d’un brouillon ou envoi du bilan. Cela crée un
nouvel identifiant de session et remet les mesures, tentatives et réponses à zéro.

- Envoi : `POST /api/infortune/diagnostics`, rapport normalisé et borné.
- Lecture : `GET /api/dev/infortune/diagnostics`, compte authentifié autorisé par
  la même liste serveur que les ateliers dev, vérifié à chaque requête.
- Consultation : menu dev → Ateliers et simulations → Roue · diagnostics et
  retours des joueurs (`/entrainement/roue/index.html?diagnostics=1`).
- Stockage : `GOBBLE_DATA_DIR/wheel-diagnostics.sqlite`, ou le dossier `data` local.
  Ouverture paresseuse ; au maximum les 5 000 derniers rapports. Pagination par 25.
  Un identifiant de session rend les nouvelles tentatives d’envoi idempotentes.
  Le serveur associe le compte et son pseudo ; aucun identifiant envoyé par le
  client n’est utilisé comme identité. Les invités peuvent également participer.
  L’adresse IP n’est pas enregistrée dans les rapports.

Les routes seront disponibles lors du prochain démarrage habituel du backend
avec ces fichiers. La mise en place ne démarre ni ne redémarre un serveur.
