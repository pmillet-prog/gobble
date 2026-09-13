# Activation des définitions et étymologies — 13 septembre 2026

Paul a effectué le déploiement majeur puis autorisé explicitement le remplacement
de la base sur la VM, avec redémarrage du backend si nécessaire.

La base corrigée a été activée le **13 septembre 2026 à 11 h 34, heure de Paris**.
L’arrêt, la bascule, le redémarrage et le premier contrôle ont pris 8,62 secondes.
Le frontend n’a pas été redémarré par cette opération.

## Base active et conservation des données

- Chemin physique : `/home/freebox/gobble-runtime/data/definitions-fr.sqlite`.
- Les chemins `gobble_git/data/definitions-fr.sqlite` et
  `gobble_git/server/data/definitions-fr.sqlite` restent des liens vers cette base.
- Source : `.tmp/etymology-audit-20260912/definitions-candidate.sqlite`.
- SHA-256 transféré et activé :
  `86b5ea798d3845cf5021578f500bb518d8e2c51db85cbd2272d8f3a0144f716e`.
- Intégrité SQLite vérifiée : `ok`.
- 396 832 entrées conservées, aucune ajoutée ni supprimée.
- 41 476 étymologies différentes de la base effectivement active sur la VM.
  Le chiffre de 31 026 dans l’audit du 12 septembre comparait la correction à
  une copie intermédiaire du 11 septembre, plus récente que celle de la VM.
- Toutes les colonnes hors étymologie, ainsi que le schéma et les métadonnées,
  sont identiques : définitions, renvois, compléments locaux et enrichissements
  sont donc préservés.
- Empreinte des colonnes hors étymologie, identique avant et après :
  `ae89d7aeb8023a2f0017cc18eebd31672366eb6239b471ae1c88fe2f1a4aead4`.

## Sauvegarde et bascule

Dossier conservé sur la VM : `/home/freebox/definitions-release-20260913/`.

- `active-before.sqlite` : sauvegarde SQLite cohérente effectuée en service.
- `active-at-switch.sqlite` : seconde sauvegarde cohérente après l’arrêt du
  backend. Son empreinte identique confirme l’absence de modification pendant
  la préparation :
  `3d49851626bdcc31f90b7e26d5f08870fc863c042c7253911a234fa5d8d159f7`.
- `original-active.sqlite` et ses éventuels journaux : fichiers originaux
  conservés à part avant le remplacement.
- `definitions-candidate.sqlite` : copie transférée et validée.
- `probe.json`, `comparison.json`, `activation.json`, `public-verification.json` :
  rapports également rapatriés dans `.tmp/definitions-release-20260913/`.

Seul `gobble-back.service` a été arrêté puis démarré. Le backend conserve une
connexion SQLite et des caches : ce redémarrage lui permet de lire la nouvelle
base. Un retour automatique à la version précédente était prévu en cas d’échec ;
il n’a pas été nécessaire. Propriétaire, groupe et droits du fichier ont été
conservés. La base des joueurs n’a pas été remplacée.

## Vérification en ligne

Le contrôle de santé du backend répond avec `ok: true`, et le service est actif.
L’API publique de `https://gobble.fr` retourne les définitions et étymologies
corrigées pour les cinq cas vérifiés :

| Recherche | Résultat attendu et observé |
| --- | --- |
| repudiasse | Renvoi à répudier ; `(Siècle à préciser) Du latin repudiare (« repousser »).` |
| article | `fin XIIe-début XIIIe` |
| semaine | `aux XVIe et XVIIe siècles` |
| mardi | `Martis dies` |
| accueil | `XIIe siècle Déverbal d’accueillir.` |

Les limites linguistiques restantes décrites dans
[l’audit du 12 septembre](../../server/scripts/etymology-audit-20260912.md)
restent applicables : cette activation ne constitue pas un nettoyage exhaustif
du corpus.
