# Vérification locale de l’historique des gobblars

Cette fixture monte le véritable dialogue avec des réponses réseau simulées, sans serveur de jeu, compte réel ou opération financière. Elle couvre la prime d’équipe gagnante, les achats d’avatar et de thème, la restitution d’une remise à zéro, les anciens articles sans prix détaillé, la pagination et les états de chargement, d’erreur et de liste vide.

Depuis la racine du projet :

```powershell
node --preserve-symlinks --preserve-symlinks-main dev/gobblars-history/serve.mjs
node --preserve-symlinks --preserve-symlinks-main dev/gobblars-history/verify.mjs
```

Le serveur Vite isolé écoute sur `127.0.0.1:8774`. Le second script ouvre un Chromium invisible et contrôle l’affichage à 1280, 390 et 320 pixels, ainsi que les montants signés accessibles et la pagination. Les captures et le compte rendu vont dans `.tmp/gobblars-history/`. Fermer le serveur Vite après la vérification.
