# Préparation de la note majeure du 13 septembre 2026

Le [texte proposé aux joueurs](./2026-09-13-majeure.md) rassemble les changements
du répertoire de travail depuis la note du 11 septembre. La note datée du
13 septembre 2026 est intégrée en tête d’À propos → Patchnotes dans
`src/components/about/patchNotes/PatchNotes20260913.jsx`.
Le coordinateur des fenêtres d’accueil utilise le nouveau marqueur
`patch-notes:2026-09-13`, pour la présenter aux comptes existants qui ne l’ont
pas encore vue. La lecture de la note du 11 septembre ne masque pas celle-ci.

Suivi de la mise en ligne :

- L'ouverture publique du grand tableau est maintenant implémentée : lecture
  pour tous et publication pour les comptes connectés. La modération et l'envoi
  de PNG restent réservés aux comptes autorisés. Le changement de droits sera
  effectif avec la mise à jour du backend, déployée par Paul le 13 septembre.
- La copie corrigée de la base des étymologies a été activée sur la VM le
  13 septembre à 11 h 34, après le déploiement majeur et sur autorisation de Paul.
  Le backend a été redémarré et les corrections vérifiées sur l’API publique.
  Voir le [compte rendu](../operations/2026-09-13-definitions.md).
  Cette activation reste une opération distincte du déploiement du code :
  `deploy-major.bat` exclut `.tmp` et les bases SQLite de l'archive ; ses scripts
  distants conservent les bases de la VM sans reconstruction automatique.
- La chaîne de génération, d'archivage et d'envoi du PNG est branchée. Le
  lancement local `npm run start:local` depuis `server/` charge le fichier SMTP
  déjà renseigné dans `.tmp/chalkboard-mail.env`. La présence de ses paramètres
  a été vérifiée sans imprimer le secret ni envoyer de mail. Le lancement normal
  `npm start` ne charge pas ce fichier.
- Le stockage chiffré SMTP sur la VM est documenté et préparé, mais n'a pas été
  installé par cette intervention. Aucun accès VM, envoi réel ou redémarrage du
  backend n'a été effectué.

Vérifications du vocabulaire effectuées localement le 13 septembre : aucun
écart entre les compteurs et les lignes de vocabulaire des 13 identités
contrôlées (7 914 lignes globales), et aucun mot hebdomadaire absent de son
historique global. Cette lecture ne vaut pas audit de la base en production.
Les tests SQL couvrent aussi les appareils liés, les doublons, les semaines,
les écritures concurrentes, les reprises après échec et le payload des résultats.
