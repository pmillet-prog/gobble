# Envoi du grand tableau — diagnostic du 13 septembre 2026

Les copies PNG étaient bien produites, mais les envois locaux et ceux de la VM
restaient en attente avec `mail_not_configured`.

## Causes et correction locale

- Le `npm start` local ne lisait pas `.tmp/chalkboard-mail.env`.
- Le service de la VM n’avait aucune variable SMTP et aucun secret chiffré installé.
- Le serveur sortant du profil mobile, `mta2.priv.ovhmail-u1.ea.mail.ovh.net`,
  résout vers `10.2.3.2`. La connexion depuis le PC expirait avant authentification.

La configuration locale et le modèle systemd utilisent maintenant
`smtp.mail.ovh.net:465` avec TLS, conformément au
[guide OVHcloud Zimbra](https://docs.ovhcloud.com/fr/guides/web-cloud/email-and-collaborative-solutions/zimbra/mail-apps).
L’authentification SMTP avec le secret déjà fourni a réussi depuis le PC, sans
envoi de message. Depuis la VM, la connexion TLS et le certificat ont été validés
sans transmettre de secret.

Depuis `server/`, `npm start` et `npm run start:local` passent par
`scripts/start-server.mjs`. Le lanceur charge uniquement les variables mail du
fichier local, avant les imports du backend et la création des workers, sans
écraser les valeurs fournies par le lanceur. En production, le fichier local est
ignoré. Neuf tests ciblés sont passés : chargement local, isolation de la
production, lecture du secret, conservation des PNG et reprises d’envoi.

## Installation sur la VM effectuée sans redémarrage

La configuration non secrète et le script d’installation sont préparés :

- `/home/freebox/chalkboard-smtp-20260913.conf` ;
- `/home/freebox/chalkboard-mail-install-20260913.mjs`.

Après accord explicite de Paul pour une installation sans coupure le
13 septembre 2026, l’installation a vérifié l’authentification SMTP depuis la VM,
puis chiffré le secret avec `systemd-creds` dans
`/etc/credstore.encrypted/gobble-smtp-password.cred` et installé la surcharge
`/etc/systemd/system/gobble-back.service.d/40-chalkboard-smtp.conf`.
Le secret est transmis par l’entrée standard de SSH ; il ne figure pas dans
les arguments, sorties, fichiers de préparation ou variables systemd persistantes.
La surcharge expose uniquement `SMTP_PASSWORD_FILE` et retire les anciennes
variables de mot de passe du processus.

L’installation avait d’abord été différée en attendant cet accord. Elle est
maintenant terminée. Aucune commande d’arrêt ou de redémarrage de Gobble n’a été
exécutée : seul `systemctl daemon-reload` a rechargé les fichiers de configuration.

Vérifications effectuées :

- authentification SMTP réussie depuis la VM, sans envoi de message ;
- déchiffrement du fichier installé et égalité avec le mot de passe fourni,
  vérifiés en mémoire sans afficher le secret ;
- secret `root:root`, permissions `0600` ; surcharge `root:root`, `0644` ;
- surcharge présente dans `DropInPaths`, unité `loaded`, `NeedDaemonReload=no` ;
- backend toujours `active`, PID **284386**, démarré le **13 septembre 2026
  à 09:34:37 UTC**, compteur de redémarrages inchangé (**0**) ;
- réponse `/health` correcte après installation.

**Activation au prochain démarrage prévu du backend**, notamment celui de
`deploy.bat`. Le processus actuellement en jeu conserve son environnement
antérieur ; l’envoi mail n’est donc pas encore activé dans ce processus. Aucune
installation SMTP supplémentaire n’est nécessaire avant ce déploiement.

La file existante contient quatre copies locales et une copie sur la VM,
toutes déjà générées et demandées manuellement. Leur reprise dépend du prochain
lancement avec les bons paramètres et de leur délai de nouvelle tentative.
Aucun message de test supplémentaire n’a été créé.
