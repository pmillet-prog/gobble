# Étymologies : vérification du 12 septembre 2026

Le cas « répudiasse » révèle un défaut réel de l’import. Son renvoi vers
« répudier » fonctionne. Dans le dump, l’étymologie de « répudier » commence par
`{{siècle|lang=fr|?}}` : la source ne donne pas de siècle. L’import affichait
« ? siècle » au lieu de rendre cette incertitude lisiblement.
La [page du Wiktionnaire](https://fr.wiktionary.org/wiki/r%C3%A9pudier#%C3%89tymologie)
affiche également « Siècle à préciser » et donne le sens latin « repousser ».

## Périmètre vérifié

Comparaison du dump local de 8 234 213 636 octets avec la copie finale préparée
le 11 septembre : 7 666 789 pages lues, 396 830 titres Wiktionnaire retrouvés,
44 357 entrées contenant une étymologie avant cette correction.
Les 396 832 entrées de la base incluent deux compléments locaux préservés.

Le compte rendu local du 11 septembre indiquait que la précédente copie avait
été préparée et transférée, avec activation encore en attente. Cet audit n’a
pas vérifié ni modifié le serveur ; il ne prouve pas quelle version est
actuellement active en ligne.

## Défauts confirmés et correction

| Cas | Texte précédent | Résultat vérifié |
| --- | --- | --- |
| répudier | `? siècle Du latin repudiare (« repousser »).` | `(Siècle à préciser) Du latin repudiare (« repousser »).` |
| article | `fin -début` | `fin XIIe-début XIIIe` |
| semaine | `aux et siècles` | `aux XVIe et XVIIe siècles` |
| oiseau | Date approximative absente | `vers 1100` conservé |
| mardi | `Du latin signifiant le jour de Mars.` | `Martis dies` rétabli |
| collaboration | `XIXe siècle collaborer.` | Dérivation de `collaborer` avec le suffixe `-ation` |
| accueil | Étymologie vide | `XIIe siècle Déverbal d’accueillir.` |
| filtrer | Étymologie vide | `XVIe siècle Dénominal de filtre.` |

Avant correction, 4 908 textes contenaient « ? siècle ». Les autres modèles de
siècles (`siècle2`, notamment avec `12`, `15`, `16`), les dates approximatives
(`circa`), certains exposants et modèles de mise en forme étaient supprimés.
Le modèle `composé de` ne conservait que son premier terme. Certains modèles
de dérivation étaient entièrement supprimés, rendant parfois le texte trop
court pour être enregistré. Des entités telles que `&nbsp;` restaient visibles.

Les contrôles précédents couvraient les transcriptions, les sens, les coupures
et la conservation des données, mais ne détectaient pas ces familles de pertes.

## Copie produite et validation

- Fichier local : `.tmp/etymology-audit-20260912/definitions-candidate.sqlite`.
- 31 026 étymologies modifiées par rapport à la copie du 11 septembre.
- Parmi elles, 15 538 passent d’un texte vide à un texte renseigné.
- Seule la colonne `definitions.etymology` a changé. Les définitions, renvois,
  thèmes, enrichissements, métadonnées et compléments locaux sont préservés.
- Intégrité SQLite vérifiée ; empreinte des données préservées identique.
- SHA-256 de la copie : `86b5ea798d3845cf5021578f500bb518d8e2c51db85cbd2272d8f3a0144f716e`.
- 23 tests ciblés réussis.
- Vérification par le vrai résolveur de définitions, accès web désactivé :
  `repudiasse → répudier`, ainsi que les exemples du tableau et `dico`.
- Les transcriptions déjà réparées d’école, photographie et philosophie ont
  également été vérifiées dans le résolveur de Pivot.

## Anomalies restant à traiter

La copie n’est pas une base intégralement nettoyée. 78 propositions présentant
des délimiteurs déséquilibrés ont été rejetées ; leur ancienne valeur est
conservée. 386 entrées sont signalées pour relecture, avec chevauchement possible
entre catégories :

- 260 avec des parenthèses ou guillemets vides ;
- 100 avec des délimiteurs déséquilibrés ;
- 32 avec des traces de balisage ;
- 3 avec une ancienne notation de date inconnue.

Des modèles restent non pris en charge, notamment `déverbal sans suffixe`
(213 entrées source), `mot-valise` (175), `calque` (111). Ces nombres ne sont
pas un décompte exhaustif des textes incorrects : certains passages sont coupés
par la limite de longueur, et certains modèles signalés sont bibliographiques.
Une comparaison à la source reste nécessaire pour les corriger sans inventer
ni retirer de contenu utile.

Le rapport `.sqlite.report.json` associé à la copie liste maintenant les
anomalies restantes **même quand le texte n’a pas changé**, ainsi que les
modèles non pris en charge avec exemples. Le fichier `.sqlite.changes.jsonl`
donne le texte avant et après pour chaque modification.

À l’issue de cet audit, la copie était locale et n’avait pas été activée en ligne.

**Mise à jour du 13 septembre 2026 :** la copie a depuis été activée sur la VM,
après autorisation de Paul, sauvegarde cohérente de la base active et comparaison
de toutes les colonnes. Les 396 832 entrées et toutes les données hors étymologie
sont préservées. Le backend a été redémarré et l’API publique a été vérifiée.
Voir le [compte rendu d’activation](../../docs/operations/2026-09-13-definitions.md)
pour les empreintes, sauvegardes et résultats.
