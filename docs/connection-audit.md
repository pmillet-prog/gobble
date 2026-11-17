# Journal de connexions

Le journal `connection-audit.sqlite`, dans `GOBBLE_DATA_DIR`, associe le compte authentifié côté serveur au navigateur qui présente un installID et à l’adresse réseau observée. Les événements couvrent la création de compte, la récupération d’un ancien profil, la connexion par mot de passe et l’ouverture d’une session existante via `/api/auth/status`.

Ce n’est pas un historique d’activité en partie. Les contrôles de session identiques sur une minute sont regroupés par suppression des répétitions ; un changement de compte, d’IP ou d’installID reste enregistré. Aucun mot de passe, cookie, jeton de session, adresse email ou contenu de requête n’est copié dans ce journal.

## Consultation et accès

Profil joueur → Administration → Historique des connexions. Le serveur applique l’autorisation de `adminAccess.js` à chaque lecture (variables `GOBBLE_ADMIN_USER_IDS` / `GOBBLE_ADMIN_ACCOUNTS`, ou les administrateurs existants en leur absence). L’accès de modération seul ne suffit pas. Un compte devant renouveler son mot de passe ne peut pas lire le journal. Les réponses ne sont pas mises en cache et les lectures depuis une autre origine sont refusées.

## Adresse IP et proxies

`GOBBLE_CONNECTION_TRUSTED_PROXIES` accepte une liste d’adresses ou de réseaux CIDR, séparés par des virgules. La valeur par défaut est `127.0.0.1,::1`, pour le proxy local. Une chaîne vide désactive la confiance dans les en-têtes de transfert. Ne pas utiliser une plage couvrant tous les visiteurs.

La chaîne `X-Forwarded-For` est parcourue de droite à gauche, jusqu’au premier pair non autorisé. Les en-têtes d’un client arrivant directement d’une adresse non autorisée sont ignorés. La configuration globale Express `trust proxy: true` n’est pas utilisée pour ce journal. Le proxy Vite ajoute son pair réel (`xfwd: true`).

Les proxies déclarés doivent ajouter l’adresse réelle de leur pair ou remplacer l’en-tête avec une valeur vérifiée. En présence d’un CDN ou de plusieurs proxies, n’autoriser que les intermédiaires effectivement utilisés et protégés contre le contournement ; sinon le journal affiche l’adresse de cet intermédiaire. Il ne faut pas présenter une adresse de proxy comme celle du joueur. Le journal précise si l’adresse vient du pair réseau ou de la chaîne transmise par un proxy autorisé. Le navigateur ne fournit pas une empreinte matérielle vérifiée.

## Conservation et information

La durée est de 180 jours, définie dans `shared/connectionAudit.js` et reprise dans À propos → Confidentialité. Les entrées expirées sont exclues des lectures et purgées au démarrage puis toutes les heures, même sans nouvelle connexion. SQLite utilise `secure_delete` et un checkpoint du WAL après la purge. Les éventuelles sauvegardes doivent suivre une politique de conservation cohérente ; aucune sauvegarde existante n’est modifiée par ce code.

La rubrique décrit le responsable (Paul Millet), la finalité de sécurité et de prévention des abus, l’intérêt légitime, les données, les destinataires, la durée et les moyens d’exercer les droits via support@gobble.fr. Son accès est uniquement dans À propos, conformément au choix de Paul ; aucune validation, bannière ou ouverture automatique n’est ajoutée. Ce choix d’interface n’est pas une certification de conformité juridique. La nécessité et la proportionnalité du traitement doivent rester documentées par le responsable.

L’ancien fichier `server/logs/connections.log` est distinct : il contient des entrées en salon avec pseudo, IP et user-agent, sans compte ni installID. Il n’est ni importé, ni modifié, ni présenté comme le nouveau journal. Sa politique de conservation et celle des autres journaux techniques restent indépendantes.

## Exploitation

Le journal dispose de sa propre base et de sa propre file bornée. Une panne est signalée sans exposer les données dans le journal général et sans empêcher les joueurs de s’authentifier. La purge et les écritures sont arrêtées et attendues lors de la fermeture normale du serveur. Aucun redémarrage ou déploiement n’est réalisé par cette fonctionnalité.
