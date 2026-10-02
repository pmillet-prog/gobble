# Historique du chat pour la modération

Le panneau **Modération → Historique du chat** affiche les messages des joueurs,
leurs modifications et leurs suppressions. Un raccourci existe dans le menu dev
uniquement pour les comptes disposant aussi des droits de modération.
La recherche porte sur une période, un pseudo ou le texte ; les pages contiennent
au maximum 50 événements. Les dates affichées utilisent le fuseau du navigateur.

L'archivage est automatique, indépendamment de l'ouverture des menus. Il commence
à l'activation de cette version du serveur : aucun ancien message n'est reconstitué.
Les messages de bots, annonces système et réactions ne sont pas archivés.
Chaque événement contient l'identifiant du message, le salon, la date, le pseudo
et les identifiants d'auteur issus de la session serveur. Les modifications gardent
le texte avant/après ; le texte saisi avant le filtre anti-spoiler est conservé s'il
diffère du texte affiché. Supprimer du chat ne supprime pas le journal de modération.

La base dédiée est `${GOBBLE_DATA_DIR}/chat-audit.sqlite`, ou `data/chat-audit.sqlite`
sans cette variable. Elle doit rester dans le répertoire de données persistant,
hors des fichiers servis publiquement. Elle est exclue de Git. SQLite utilise WAL
et `synchronous=FULL` ; le serveur attend l'écriture avant de publier/acquitter un
message ou d'appliquer une modification/suppression. Une panne d'archivage refuse
l'opération avec `chat_archive_unavailable` ; elle ne passe pas silencieusement.
Les commandes sont sérialisées par salon, avec une file bornée, sans bloquer le
thread principal sur les accès disque.

Conservation par défaut : **30 jours par événement**, avec exclusion immédiate des
résultats expirés et purge au démarrage puis toutes les heures. La variable serveur
`GOBBLE_CHAT_AUDIT_RETENTION_DAYS` permet de changer cette durée (0 = sans limite).
Les sauvegardes éventuelles de cette base doivent suivre leur propre politique de
rétention. Les règles du chat indiquent aux joueurs la conservation pour modération.

L'événement `moderation:chat-history` vérifie `requireModerationAccess` avant et
après la lecture. Les droits sont ceux du menu de modération existant, configurés
côté serveur (`GOBBLE_MOD_ACCOUNTS` / `GOBBLE_MOD_USER_IDS`, ou la configuration
d'accès existante). Le déverrouillage du menu dev ne suffit pas.

Validation locale, sans démarrage du backend :

```text
node --test server/chat/chatAudit.test.js src/features/admin/chatAuditClient.test.js
node node_modules/vite/bin/vite.js build --outDir .tmp/chat-audit-build
```

L'installation en live nécessite le déploiement du client et du serveur, puis
l'autorisation explicite de Paul avant tout redémarrage : des joueurs peuvent
être en pleine partie. Cette modification n'active rien sur la VM à elle seule.
