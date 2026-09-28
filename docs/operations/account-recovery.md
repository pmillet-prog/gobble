# Récupération de compte par email

Implémentation locale du 28 septembre 2026. Aucun déploiement ou redémarrage de
Gobble effectué pour cette évolution.

## Parcours joueur

- Dans « Connexion » → « Mot de passe oublié », saisir le pseudo. Si le compte
  possède un email enregistré, il reçoit un lien à usage unique valable 30 minutes.
  Les comptes déjà inscrits sont pris en charge sans modification ni réinscription.
- Le lien ouvre `/reset-password#token=…`. Le joueur choisit et confirme son
  nouveau mot de passe, puis retourne au jeu pour se connecter. L'ouverture du
  lien seule ne modifie rien. Le secret est retiré de l'URL avant les traces client.
- Après validation, toutes les sessions et les tickets de connexion du compte
  sont invalidés, ses connexions temps réel sont fermées et tous ses liens de
  récupération sont supprimés. Les autres joueurs restent connectés.
- « Demander de l'aide » permet d'envoyer un pseudo, un message et un email de
  contact facultatif. L'envoi part de `support@gobble.fr` vers `pmillet@gmail.com`.
  L'adresse de contact est uniquement utilisée en Reply-To, sans modifier le
  compte. L'identité du demandeur doit être vérifiée avant une intervention.
- `support@gobble.fr` est également affiché comme contact direct.

## Configuration et stockage

Le transport SMTP est partagé avec celui du grand tableau : `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD_FILE` (ou les anciennes variables de
secret). La lecture des credentials systemd reste identique. Les tests n'envoient
aucun message réel et ne consultent pas les credentials de production.

L'expéditeur par défaut est `support@gobble.fr` (`GOBBLE_ACCOUNT_MAIL_FROM`, puis
`SMTP_FROM`, permettent une configuration serveur). Le destinataire du support
reste fixé côté serveur à `pmillet@gmail.com`.

`GOBBLE_PUBLIC_URL` vaut par défaut `https://gobble.fr`. Ce paramètre détermine
l'origine des liens ; aucun Host ou email fourni par le navigateur ne détermine
leur destination. HTTPS est obligatoire, sauf localhost en développement.
Le proxy existant sert les chemins du client Vite, dont `/reset-password`.

La migration idempotente `2026-09-28-password-recovery.sql` est appliquée par le
démarrage normal du service. Elle ajoute les jetons hachés et les limites d'envoi.
Aucun email ou compte existant n'est modifié par la migration. Un jeton est lié
au mot de passe et à l'email actuels ; une modification de l'un des deux invalide
automatiquement les anciens liens.

Les réponses aux demandes de lien sont identiques pour un compte absent, sans
email ou avec email. Les envois sont asynchrones et limités à quatre tâches en
parallèle pour éviter de révéler la présence d'un email par la latence SMTP.
En cas d'échec SMTP, le jeton correspondant est supprimé et une erreur sans
données personnelles est journalisée ; le joueur peut utiliser le contact direct.
Les tâches ne sont pas une file durable : une demande interrompue par l'arrêt
du processus devra être renouvelée.

Limites persistantes : 10 demandes de lien par IP en 15 minutes, 3 par pseudo
en une heure, 5 par adresse en une heure, 100 demandes globales par heure ;
3 demandes d'aide par IP et 20 globalement par heure. Les clés des compteurs
sont hachées et les compteurs expirés sont purgés à la prochaine demande.

## Vérification VM en lecture seule

Le 28 septembre 2026 : 304 comptes, dont 176 avec un email de format valide et
128 sans email ; 167 adresses distinctes. Plusieurs comptes peuvent donc partager
un email, d'où l'identification par pseudo. Le processus actif dispose des
paramètres SMTP et d'un fichier credential lisible ; aucun secret n'a été affiché.
Cette vérification ne constitue pas un test de réception dans une boîte réelle.

La mise en ligne devra inclure le client, les modules serveur et la migration.
L'activation du code serveur exige un redémarrage expressément autorisé par Paul,
en tenant compte des joueurs en partie. Aucun script de redémarrage n'est lancé
par ce travail.
