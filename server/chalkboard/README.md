# Grand tableau : stockage, copies et mesures

Le runtime serveur conserve les contributions, les masques, les droits de leur
auteur et la dernière suppression de chaque modérateur dans `chalkboard.sqlite`,
sous `GOBBLE_DATA_DIR` (par défaut `data/` à la racine du dépôt). Une opération
n'est confirmée au client qu'après son commit SQLite. Ne pas placer ce répertoire
dans un dossier temporaire ou remplacé pendant un déploiement.

Le tableau et son catalogue de polices sont publics, y compris sans connexion.
Tous les joueurs authentifiés peuvent publier et gommer leurs propres
contributions. La suppression de modération, son annulation, l'audit et les
exports PNG sont réservés aux comptes autorisés côté serveur.

Le lundi à 00 h, heure de Paris (vérification toutes les 60 secondes), la remise
à zéro et l'archivage du tableau précédent sont enregistrés dans une transaction.
Au démarrage, le même contrôle rattrape un lundi passé pendant une interruption.
L'archive contient la géométrie complète mais pas les identités privées.

Un worker séparé génère ensuite le PNG complet de 24 000 × 1 000 pixels dans
`GOBBLE_DATA_DIR/chalkboard-exports/`. Les textes utilisent les mêmes polices et
les tracés/masks le même code de dessin que le client. L'image est enregistrée
avant la tentative d'envoi. L'archive et les tentatives en attente survivent aux
redémarrages ; un échec est réessayé avec un délai croissant jusqu'à une heure.
Le bouton admin « Envoyer le PNG » copie la révision publiée au moment du clic,
sans effacer le tableau ni inclure un brouillon. Les routes contrôlent les droits
du compte côté serveur et limitent les demandes manuelles à une toutes les 30 s.

## Envoi par e-mail

Destinataire par défaut : `pmillet@gmail.com`. Expéditeur par défaut :
`support@gobble.fr`. Ces valeurs sont remplaçables dans l'environnement serveur :

```dotenv
GOBBLE_CHALKBOARD_MAIL_TO=pmillet@gmail.com
GOBBLE_CHALKBOARD_MAIL_FROM=support@gobble.fr
```

Si les alertes automatiques de la VM utilisent déjà un relais système compatible
sendmail, réutiliser sa configuration existante :

```dotenv
GOBBLE_MAIL_TRANSPORT=sendmail
GOBBLE_SENDMAIL_PATH=/usr/sbin/sendmail
```

Sinon, configurer le SMTP de la boîte OVH à partir de ses paramètres réels :

```dotenv
SMTP_HOST=smtp.mail.ovh.net
SMTP_PORT=465
SMTP_USER=support@gobble.fr
SMTP_PASSWORD=<secret dans l'environnement serveur uniquement>
```

Le port 465 utilise TLS direct ; un autre port exige STARTTLS. Ne pas désactiver
la validation des certificats. Aucun secret n'est envoyé au client. Sans relais
configuré, les copies PNG sont tout de même archivées et l'interface indique que
l'envoi reste en attente. En production, ces variables sont fournies par le
lanceur du backend. Pour la boîte Zimbra utilisée ici, les paramètres publics
sont `smtp.mail.ovh.net:465` avec TLS, conformément au
[guide OVHcloud](https://docs.ovhcloud.com/fr/guides/web-cloud/email-and-collaborative-solutions/zimbra/mail-apps).
Le nom `mta2.priv.ovhmail-u1.ea.mail.ovh.net` contenu dans le profil mobile
résout vers une adresse privée et ne doit pas être utilisé depuis le PC ou la VM.

### Lancement local avec la configuration déjà renseignée

Depuis `server/`, **`npm start`** charge les variables mail de
`.tmp/chalkboard-mail.env` avant de lancer le backend et ses workers.
`npm run start:local` est un alias du même lancement. Le lanceur utilise Node 22
et ne remplace pas les variables déjà fournies par l’environnement.
Un fichier absent ne bloque pas le démarrage. En production (`NODE_ENV=production`),
ce fichier local est ignoré : les paramètres et le secret restent gérés par systemd.
Le fichier local reste exclu du dépôt et des archives de déploiement.

Cette commande remplace le lancement habituel ; ne pas démarrer un second
backend en parallèle. Les copies déjà en attente sont conservées et l'envoi sera
réessayé après le lancement avec cette configuration. Vérifier la configuration
ne nécessite aucun envoi réel.

Pour un mot de passe chiffré au repos sur la VM, le backend accepte aussi
`SMTP_PASSWORD_FILE`, prioritaire sur le secret en variable d’environnement.
La [procédure systemd](./smtp-credential.md) et la surcharge
`gobble-back.smtp.conf.example` sont préparées : systemd conserve le secret
chiffré sur disque et le fournit au service à son démarrage. Aucun secret n’est
à renseigner dans ces fichiers du dépôt.

Le code des crash reports présent dans ce dépôt écrit automatiquement dans les
logs du serveur ; le bouton support utilise un lien `mailto:`. Une éventuelle
expédition automatique des logs par la VM est une configuration distincte, à
identifier avant d'installer un second relais.

## Vérification locale sans lancer le backend

```sh
node --test server/tests/chalkboardPersistence.test.js server/tests/chalkboardExports.test.js server/tests/chalkboardRaster.test.js
node server/scripts/benchmark-chalkboard-sponge.mjs
```

Le benchmark compare la recomposition des contributions à chaque mouvement avec
l'effacement incrémental sur des tuiles pré-calculées, sur le même tableau dense
et avec un vrai moteur Canvas. Il n'ouvre aucun port et n'envoie aucun e-mail.
Les tests SMTP utilisent un transport local en mémoire. Un benchmark Skia local
ne remplace pas une mesure dans le navigateur et sur un téléphone.

Les données étant jusque-là uniquement en mémoire, celles déjà perdues après un
redémarrage ne peuvent pas être reconstituées par ce changement. La mise en
service nécessite la mise à jour des dépendances serveur ; aucun script de ce
dossier ne redémarre le backend.
