# Repères de nouveautés du grand tableau

Cette page isole les vrais composants `ChalkboardScrollHints`, `useChalkboardViewport`
et `useChalkboardUnseenRegions`, avec des messages factices. Aucun serveur de jeu
n’est lancé et aucune requête n’est adressée au site public.

Lancer uniquement l’aperçu Vite :

```powershell
node --preserve-symlinks --preserve-symlinks-main dev/chalkboard-unread/serve.mjs
```

Ouvrir <http://127.0.0.1:8772/dev/chalkboard-unread/>. Faire défiler horizontalement
jusqu’aux nouvelles entrées ; le scénario initial contient deux zones différentes.

Vérification Chromium aux formats 390 × 844 et 1280 × 900 :

```powershell
node --preserve-symlinks --preserve-symlinks-main dev/chalkboard-unread/verify.mjs
```

Le script vérifie les deux directions, la persistance après fermeture, la lecture
hors ordre, l’exclusion de ses propres entrées et la suspension pendant le
chargement ou l’édition. Les captures et résultats sont dans
`.tmp/chalkboard-unread/`. Il ne démarre et ne ferme que son propre Chromium.
