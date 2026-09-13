# Mot de passe SMTP chiffré sur la VM

Le client mail accepte `SMTP_PASSWORD_FILE`. Le fichier indiqué contient le
secret déchiffré fourni au service par systemd ; il est prioritaire sur
`SMTP_PASSWORD` et `SMTP_PASS`. Un fichier absent, vide ou illisible met l’envoi
en attente avec `mail_credential_unavailable`, sans révéler le secret et sans
retomber sur un ancien mot de passe en clair. Les PNG restent archivés.

Le chiffrement se fait **sur la VM**, avec `systemd-creds` et
`LoadCredentialEncrypted=` (systemd 250 ou supérieur). Le dépôt ne contient
aucune clé de déchiffrement. Cette procédure concerne `gobble-back.service`,
le nom utilisé par le déploiement du projet.

La configuration et le secret ont été installés sur la VM le **13 septembre 2026**,
avec l’accord de Paul et sans redémarrage du backend. Leur activation attend
le prochain démarrage prévu du service. Ne pas réinstaller le secret : voir le
[compte rendu de l’installation](../../docs/operations/2026-09-13-chalkboard-mail.md).

## Préparer le secret

Vérifier sur la VM que `systemd-creds` est disponible et que la version de
systemd convient. Ne pas remplacer cette procédure par une mise à jour système
automatique si ce n’est pas le cas.

```sh
systemd --version
command -v systemd-creds
```

Dans une session administrateur sur la VM, créer le répertoire puis lancer une
saisie masquée. Le mot de passe transite par un tube, sans argument de commande,
variable d’environnement ni fichier temporaire en clair. Ne pas activer `set -x`.

```sh
sudo install -d -m 0700 /etc/credstore.encrypted
sudo bash -c 'set -euo pipefail
umask 077
test ! -e /etc/credstore.encrypted/gobble-smtp-password.cred
systemd-ask-password --timeout=0 "Mot de passe SMTP Gobble :" |
  systemd-creds encrypt --with-key=host --name=gobble-smtp-password - /etc/credstore.encrypted/gobble-smtp-password.cred'
```

La commande refuse d’écraser un secret déjà installé. Elle utilise la clé locale
de la VM, normalement dans `/var/lib/systemd/credential.secret`, accessible à
root. Copier uniquement le fichier `.cred` sur une autre machine ne suffit pas
à le déchiffrer. Un administrateur root de la VM conserve la possibilité de lire
le secret : le chiffrement protège son stockage au repos, pas un serveur compromis.

## Raccorder le backend

Après déploiement du code qui lit `SMTP_PASSWORD_FILE`, installer le fichier
`gobble-back.smtp.conf.example` comme surcharge systemd :

```sh
sudo install -d -m 0755 /etc/systemd/system/gobble-back.service.d
sudo install -m 0644 server/chalkboard/gobble-back.smtp.conf.example /etc/systemd/system/gobble-back.service.d/40-chalkboard-smtp.conf
sudo systemctl daemon-reload
```

Ces commandes ne redémarrent pas Gobble. La prise en compte du secret nécessite
le **prochain démarrage du service**, à organiser avec Paul car des joueurs
peuvent être en partie. Ne pas déclencher de redémarrage sans son accord explicite.

Au démarrage, systemd déchiffre le secret dans le répertoire privé du service.
`%d/gobble-smtp-password` désigne ce fichier temporaire ; seul son chemin est
transmis à Node. Les workers d’export utilisent le même accès. Le mot de passe
reste nécessaire en mémoire le temps de l’authentification SMTP.

Retirer les anciennes valeurs `SMTP_PASSWORD`/`SMTP_PASS` des configurations
persistantes du serveur lors de la migration. `UnsetEnvironment=` empêche leur
transmission au processus mais ne supprime pas leurs anciennes copies sur disque.
La copie dans `.tmp` sur le PC reste distincte ; elle est exclue de Git et des
archives de déploiement.

Documentation officielle : [identifiants de service systemd](https://systemd.io/CREDENTIALS/).
