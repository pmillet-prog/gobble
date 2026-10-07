# Top 3 hebdomadaire — fixture locale

Cette page monte la vraie `StatsApplication` avec un état en mémoire. Aucun backend Gobble, aucune donnée de joueur et aucun appel métier ne sont nécessaires.

Depuis la racine du dépôt, dans deux terminaux :

```powershell
node --preserve-symlinks --preserve-symlinks-main dev/weekly-top3/serve.mjs
node --preserve-symlinks --preserve-symlinks-main dev/weekly-top3/verify.mjs
```

Aperçu : `http://127.0.0.1:8773/dev/weekly-top3/`.

Le vérificateur utilise une instance Chrome/Edge headless dédiée, bloque les URL du site public et les API, puis la ferme. Sous sandbox Windows, Vite peut nécessiter l'accès élargi aux dépendances et Chrome l'autorisation d'exécution habituelle des fixtures.

Il contrôle les 11 choix de manches et leurs données distinctes, les pourcentages et comptes (y compris 0 %), les profils, la navigation clavier/tactile, la conservation du type sélectionné, les onglets hebdo/saison, la fermeture, les états vide/chargement/erreur et le suivi commencé en cours de semaine. Les dimensions testées sont 1280 × 900, 390 × 844 et 320 × 568.

Les captures et le rapport sont écrits dans `.tmp/weekly-top3/`. Une vérification réussie produit 136 assertions, 12 captures et aucune exception JavaScript. Elle valide l'interface ; les règles de comptabilisation côté serveur sont couvertes séparément par les tests du service de statistiques.
