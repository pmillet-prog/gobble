# Statistiques — aperçu local commun

La vérification du top 3 fait désormais partie de l’aperçu général des statistiques dans `dev/stats`. Celui-ci monte la vraie `StatsApplication` avec des données fictives en mémoire, sans serveur Gobble.

Depuis la racine du dépôt, dans deux terminaux :

```powershell
node --preserve-symlinks --preserve-symlinks-main dev/stats/serve.mjs
node --preserve-symlinks --preserve-symlinks-main dev/stats/verify.mjs
```

Aperçu : `http://127.0.0.1:8774/dev/stats/`.

Les anciennes commandes `dev/weekly-top3/serve.mjs` et `dev/weekly-top3/verify.mjs` délèguent aux mêmes scripts. L’ancienne page `/dev/weekly-top3/`, sur ce serveur au port 8774, redirige vers `/dev/stats/`. Il n’y a qu’une seule suite à maintenir.

Le vérificateur ouvre une instance Chrome/Edge headless dédiée, bloque les URL du site public et les API, puis la ferme. Il vérifie les catégories, les périodes « Cette semaine / Depuis toujours », les classements dont les 11 types de manches du top 3, les longs pseudos, les points négatifs, les liens de profil et de définition, les états vide/chargement/erreur et le récapitulatif hebdomadaire. Les captures et le rapport sont écrits dans `.tmp/stats-verification/`.

Sous sandbox Windows, Vite peut nécessiter l’accès élargi aux dépendances et Chrome l’autorisation d’exécution habituelle des aperçus locaux. Les règles de comptabilisation côté serveur restent couvertes séparément par les tests des services de statistiques.
