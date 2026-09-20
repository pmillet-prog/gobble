# Accessoires d’avatar — 20 septembre 2026

Six accessoires ajoutés à la catégorie Accessoires de l’éditeur du jeu local.
Les prix sont définis dans `shared/avatarCosmetics.js` et appliqués côté serveur.

| Accessoire | Gobblars | PNG source dans le jeu | Calage Femme / Homme |
|---|---:|---|---|
| Bandeau pirate (cache-œil) | 1 000 | [PNG](../../public/avatars/v1/candidates/accessories/lot_013/2026-09-20-cosmetics/pirate_eyepatch_v01.png) | [Aperçu](review/pirate_eyepatch.png) |
| Taches de rousseur | 500 | [PNG](../../public/avatars/v1/candidates/accessories/lot_013/2026-09-20-cosmetics/freckles_v02.png) | [Aperçu](review/freckles.png) |
| Piercing de nez | 500 | [PNG](../../public/avatars/v1/candidates/accessories/lot_013/2026-09-20-cosmetics/nose_piercing_v01.png) | [Aperçu](review/nose_piercing.png) |
| Piercing d’oreille | 500 | [PNG](../../public/avatars/v1/candidates/accessories/lot_013/2026-09-20-cosmetics/ear_piercing_v01.png) | [Aperçu](review/ear_piercing.png) |
| Balafre repositionnable | 500 | [PNG](../../public/avatars/v1/candidates/accessories/lot_013/2026-09-20-cosmetics/scar_v01.png) | [Aperçu](review/scar.png) |
| Collier de diamants | 2 000 | [PNG](../../public/avatars/v1/candidates/accessories/lot_013/2026-09-20-cosmetics/diamond_necklace_v01.png) | [Aperçu](review/diamond_necklace.png) |

Sélectionner la balafre affiche Horizontal, Vertical et Inclinaison, avec remise à
zéro. Les réglages sont sauvegardés dans l’avatar du compte et repris dans le chat.
Le modèle de sélection existant conserve un accessoire équipé à la fois.

## Génération et conservation

Images produites avec l’outil intégré **image_gen**, un accessoire par génération.
[Prompts exacts, correction comprise](prompts.json) et [sources originales](sources.json).
La première proposition de taches de rousseur avait un voile couleur peau : une
édition imagegen a fourni la v02 utilisée. Les fichiers originaux restent dans
le dossier de sortie du générateur ; aucun détourage local ni modification de
pixels des PNG retenus. Les six sources RGBA ont un alpha allant de 0 à 255.

Copies identiques conservées dans le lot candidat de l’atelier :
`.Tmp/avatar/avatar/assets/candidates/accessories/lot_013/2026-09-20-cosmetics/`.
Le manifeste y consigne dimensions, source et SHA-256. Les assets sont essayables
dans le jeu conformément à la demande de Paul, sans promotion aux approuvés ni
modification de ses décisions de revue.

## Calage et validation effectués

Les six aperçus ci-dessus ont été rendus avec le compositeur réel du jeu et
examinés sur Femme et Homme. Le bandeau couvre l’œil gauche de l’image, sa sangle
remonte au-dessus de l’autre œil ; le piercing suit les réglages du nez. Taches et
balafre sont limitées à l’alpha de la tête. Le collier passe sur le vêtement et
sous le menton ; les accessoires du visage passent sous les cheveux avant,
lunettes et chapeaux. L’anneau d’oreille et le collier ont un calage propre à
chaque base.

[Trois combinaisons examinées](review/combinations.png) : bandeau avec coiffure et
Gavroche, collier avec cheveux longs, balafre déplacée et inclinée avec carré.
Cette vérification de l’agent ne remplace pas une décision graphique de Paul.

56 tests ciblés réussis : catalogue/fichiers, achats aux prix serveur, refus
d’équipement sans achat, sauvegarde et limites de la balafre, compatibilité avec
les anciennes configurations, rendu et miniatures du chat. Compilation client
réussie. Rendus Canvas natifs ; les clics dans l’interface n’ont pas été vérifiés
dans un navigateur, aucune surface CUA n’étant disponible. Aucun déploiement.

## Reproduire le lot

Depuis la racine du projet :

```text
python scripts/prepare-avatar-cosmetics.py
node scripts/render-avatar-accessories.mjs
```

Le préparateur copie les sources indiquées dans `sources.json`, vérifie l’alpha
et produit `shared/avatarCosmeticImages.js` (dimensions, limites visibles et
cadrage des vignettes). Il refuse d’écraser une version différente. Les limites
visibles pilotent uniquement l’échelle et l’ancrage ; le canvas source reste
entier. Le moteur conserve une seule surface d’accessoire par avatar pour éviter
de recalculer le calage à chaque image et préserver les bijoux dans les petites
miniatures. Pour ne refaire qu’un aperçu, passer son identifiant au script de
rendu, par exemple `node scripts/render-avatar-accessories.mjs scar`.
