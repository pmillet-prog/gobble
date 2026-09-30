# Page de maintenance et ERR_FAILED

Diagnostic du 28 septembre 2026, pendant un déploiement lancé par Paul.
La VM a uniquement été consultée en lecture ; aucun service n'a été modifié.

Constats : Caddy restait actif alors que les ports 3000 et 4000 étaient encore
indisponibles. Les deux domaines répondaient en HTTP 502, puis sont revenus en
HTTP 200 après la fin normale du déploiement. Deux défauts du parcours de secours
expliquent un affichage différent suivant le navigateur et son cache :

1. `navigationNetworkFirst` rejetait toutes les réponses 5xx, y compris le
   document « Gobble se refait une beauté » servi par Caddy en HTTP 502.
2. Sur le serveur statique actif, `/offline.html` renvoyait une redirection 301
   vers `/offline`, puis le document du jeu au lieu du véritable fichier de
   secours. La réponse ainsi mise en cache pouvait être redirigée, ce qui est
   incompatible avec les navigations dont le mode de redirection est `manual`.
   Ce cas est cohérent avec ERR_FAILED ; la console du navigateur de Paul n'a
   pas été accessible pour constater directement l'erreur interne.

Correctif local :

- le service worker reconnaît la page de maintenance, y compris son ancien
  titre, et conserve son contenu ainsi que son statut 502/503 sans la mettre
  en cache comme page du jeu ;
- `public/serve.json`, copié dans `dist` par Vite, désactive la suppression
  automatique de `.html` par `serve` ;
- le secours hors connexion porte un marqueur vérifié avant sa mise en cache,
  refuse les redirections au téléchargement, et produit une réponse neuve pour
  la navigation ; le cache hors connexion passe de v1 à v2 ;
- si ce secours n'a pas pu être téléchargé, une petite page intégrée reste
  disponible et l'installation du nouveau service worker peut aboutir.

Validation : 13 tests de navigation/cache passent, compilation Vite réussie.
Pas de simulation d'arrêt des services de production. Le correctif n'a pas été
mis en ligne pendant le diagnostic. Le navigateur doit recevoir le nouveau
service worker après déploiement et un chargement réussi du jeu ; il peut encore
utiliser son ancienne version durant le déploiement qui apporte ce correctif.

Références : [configuration de serve](https://github.com/vercel/serve#configuration),
[cas de réponse redirigée rejetée par Chrome](https://github.com/w3c/ServiceWorker/issues/1177).
