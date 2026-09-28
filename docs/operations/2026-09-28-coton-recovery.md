# Récupération de Coton

Demandée par Paul et appliquée le 28 septembre 2026, sans démarrage,
redémarrage ni modification du code du backend sur la VM.

- Compte conservé : Coton (280). Compte supprimé : Cotonbe (304), sur demande
  explicite de Paul. Aucun transfert de gobblars.
- Vocabulaire : union de 2 370 et 143 mots, soit **2 437 mots distincts**
  (+67), avec conservation des premières découvertes et des mots hebdomadaires.
- Statistiques cumulées : **285 manches**, 117 514 points, 3 269 mots trouvés.
  Meilleur « 3 mots » : **79** au lieu de 69 ; les autres records restent meilleurs
  sur Coton. Les temps cibles de Cotonbe ne dépassaient pas ceux de Coton.
- Mot de passe temporaire demandé enregistré au format scrypt, avec
  `must_reset_password=1`. Les anciennes sessions de Coton sont invalidées.
- Cotonbe et ses données SQLite associées ont été supprimés, après sauvegarde.
  Les historiques hebdomadaires JSON déjà publiés restent inchangés ; ils sont
  détenus en mémoire par le serveur actif.

Les deux comptes étaient absents du salon et inactifs depuis plus d’une minute.
La transaction a été précédée d’une simulation, puis suivie d’une relecture du
hash, du drapeau de renouvellement, de la suppression, du vocabulaire, du record,
de l’invalidation des sessions et du solde de Coton inchangé. Le serveur répondait
toujours et les manches avaient continué à avancer.

Script : `server/scripts/recover-coton.py`, copié hors du code déployé dans
`/home/freebox/account-recovery/recover-coton.py`. Sans `--apply`, il simule.
L’application lit le mot de passe par JSON sur stdin ; le marqueur de transaction
empêche toute répétition. Deux tests SQLite couvrent l’union, la suppression,
l’absence de transfert de gobblars, l’idempotence et l’annulation sur erreur.

Sauvegarde privée (0600), à conserver sur la VM :
`/home/freebox/account-recovery/account-recovery-cotonbe-304-to-coton-280-20260928-1790595967219-30d5cb.json`.
Elle contient les anciennes lignes sensibles et les données supprimées ; les
champs binaires sont encodés dans des objets `{ "base64": "…" }`.
