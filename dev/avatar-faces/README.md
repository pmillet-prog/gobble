# Deux visages supplémentaires

Vue de revue locale : lancer `node dev/avatar-faces/serve.mjs` depuis la racine
du dépôt, puis ouvrir http://127.0.0.1:8770/dev/avatar-faces/.
Elle utilise le moteur réel des avatars sans
compte ni connexion au backend. Les essais ne sont pas enregistrés.

Deux choix sont proposés dans l’éditeur du jeu : **Fin** (`slim`) et
**Pattes-d’oie** (`crows_feet`), chacun sur les bases Homme et Femme. Leur
statut graphique reste candidat ; aucun modèle existant n’est remplacé.

La page permet de comparer les six visages, d’essayer une teinte personnalisée,
de montrer ou masquer une coiffure, et d’isoler la tête sur fond clair, sombre
ou damier. Les réglages n’écrivent aucune décision de revue.

PNG du nouveau lot :
`public/avatars/v1/candidates/skins/lot_014/2026-10-06-visages/`.
Les sources et les prompts sont conservés dans le lot de même nom de
`.Tmp/avatar/avatar/assets/candidates/skins/lot_014/`.

Génération avec **image_gen intégré**, un appel par PNG. Les prompts exacts sont
aussi archivés dans [`prompts.json`](./prompts.json). Les quatre fichiers RGBA
natifs mesurent 1254 × 1254 ; le moteur existant les dessine dans le repère 1024
sans rogner les marges. Leur alpha est conservé intégralement.
