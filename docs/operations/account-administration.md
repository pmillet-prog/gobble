# Administration des comptes et des contenus

Les outils apparaissent pour les comptes autorisés par `GOBBLE_ADMIN_USER_IDS`
ou `GOBBLE_ADMIN_ACCOUNTS` (listes séparées par des virgules). Les propriétés
`adminUserIds` et `adminAccounts` de `dev-access.json` sont aussi reconnues.
Sans liste admin explicite, les comptes dev autorisés par le serveur sont les
administrateurs. Les comptes de modération seuls ne reçoivent pas ces droits.
Chaque requête vérifie la session et l’autorisation serveur ; le menu dev n’a
pas besoin d’être déverrouillé.

Dans un profil, « Administration » permet de réinitialiser le mot de passe au
mot de passe temporaire demandé, avec renouvellement à la connexion. La fusion
conserve le profil ouvert, propose une recherche du compte secondaire et un
aperçu avant confirmation. Elle réunit le vocabulaire, additionne les compteurs
de carrière, conserve les meilleurs records (y compris ceux des historiques
hebdomadaires et les temps cibles) et supprime le compte secondaire. Les gobblars,
achats d’avatar, récompenses et autres biens du secondaire ne sont pas transférés.
Les classements hebdomadaires historiques ne sont pas réécrits.

Les comptes doivent être déconnectés, sans manche encore en cours de clôture,
et sans activité de session dans la dernière minute. Les comptes admin et le
compte de l’opérateur sont protégés. Une progression ancienne non migrée
nécessite une vérification manuelle : aucun appareil partagé n’est utilisé pour
deviner la propriété de données. Les actions sont transactionnelles, répétables
sans double application grâce à leur identifiant, et sauvegardées dans la table
privée `admin_account_operations` avec opérateur, date, résultat et lignes avant
modification.

La croix d’un contenu retire son mot des prochaines sélections de la liste
concernée : OCID, Pinot, Bafouille ou Lechéper. Pour une définition liée à un
lemme, les formes qui utilisent cette définition sont également écartées.
Les énigmes Lechéper portent une référence opaque pour ne pas exposer leur
réponse pendant la manche. Les exclusions sont enregistrées avec l’opérateur et
la date dans `GOBBLE_DATA_DIR/content-exclusions.json`, conservé hors du dépôt sur
la VM. Les workers relisent les exclusions lors de leurs sélections ; les grilles
OCID et questions déjà préparées sont revérifiées avant utilisation.

La récupération ponctuelle de Coton est déjà appliquée. Les nouveaux outils
nécessitent le prochain déploiement du backend ; aucun déploiement ni redémarrage
n’a été effectué pour les activer pendant les parties en cours.
