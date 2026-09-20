# Récupération du compte Serge

Opération demandée par Paul et appliquée sur la VM le 20 septembre 2026, sans
démarrage ni redémarrage du backend. Compte principal confirmé : `serge` (221).
Compte secondaire : `sergeD` (283).

- Gobblars : 741 + 509 = **1 250**, avec écritures compensées dans le journal.
- Vocabulaire : union de 2 814 et 1 034 mots, soit **3 360 mots distincts**.
  Les premières dates de découverte et les mots hebdomadaires sont conservés.
- Les déblocages de thèmes sont réunis ; le thème appliqué de Serge est conservé.
- L’appareil lié à SergeD est rattaché à Serge. Les données d’appareils partagés
  ne sont pas utilisées comme source de progression.
- Le mot de passe temporaire demandé est enregistré au format scrypt habituel,
  avec `must_reset_password=1`. Aucun mot de passe en clair n’est conservé ici.
- Toutes les sessions des deux comptes sont invalidées. Le mot de passe de
  SergeD est remplacé par une valeur aléatoire non conservée pour retirer son
  accès, tout en gardant sa ligne de compte et ses autres historiques.

L’absence des deux joueurs dans le salon actif a été contrôlée avant la
transaction. Le salon 5×5 est désactivé sur cette VM. Les soldes, les 3 360 mots,
les rattachements d’appareils, le drapeau de renouvellement et l’absence de
sessions valides ont été relus après validation.

Script : `server/scripts/recover-serge.py`, également conservé sur la VM dans
`/home/freebox/account-recovery/recover-serge.py`. La commande sans `--apply`
est une simulation. L’application exige le mot de passe via JSON sur stdin,
vérifie les identités et l’inactivité, sauvegarde les lignes concernées puis
réalise une seule transaction SQLite. Un marqueur empêche toute réapplication.

Sauvegarde privée avant modification (JSON, permissions 0600) :
`/home/freebox/account-recovery/account-recovery-serged-283-to-serge-221-20260920-1789930615068-24acea.json`.
Elle contient les lignes originales, y compris les anciens hashes et les
sessions ; elle doit rester sur la VM dans le dossier privé de maintenance.

Validation locale : quatre tests sur base en mémoire couvrent la conservation
des soldes, la réunion sans doublons, la compatibilité avec le vérificateur de
mot de passe Node, les nouvelles sessions/achats, l’annulation complète sur
erreur et la protection contre une seconde application.
