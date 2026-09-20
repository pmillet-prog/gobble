# Atelier avatars : chapeaux et coiffures

Depuis la racine du projet : `npm run avatar:dev`.

- Chapeaux : http://127.0.0.1:8766/?lot=007-couvre-chefs
- Coiffures : http://127.0.0.1:8766/?lot=005-coiffures

Choisir un modèle, puis **Repositionner / éditer les masques** sous sa liste.
L’atelier utilise un serveur local indépendant du backend du jeu. Ouvrir le HTML
directement ne permet pas d’enregistrer les recettes et les décisions.

Les deux outils proposent déplacement, taille, zoom à la molette, déplacement de
la vue, pinceau, gomme, annuler/rétablir et sauvegarde par modèle. Pour les coiffures,
le bleu passe les mèches derrière la tête, le rouge les efface. « Ramener devant »
permet également de corriger les calques arrière d’origine. Les PNG sources restent
intacts ; **Enregistrer ce modèle** conserve une recette avec son historique sans
changer le statut de revue. Un brouillon reste disponible au changement de modèle.

Après avoir enregistré dans l’atelier, exécuter `npm run avatar:sync`, puis recharger
le jeu : seuls les cheveux et chapeaux du catalogue local et leurs moteurs sont
mis à jour. Les autres familles restent intactes. Aucune publication en ligne.
Les refus sont exclus ; exception demandée par Paul : Gavroche (`newsboy`) reste
importée avec son dernier calage malgré son ancien statut de refus.

Les 20 coiffures du pack `coiffures_gobble_20_png/coiffures_gobble` portent les
suffixes H01–H10 et F01–F10. Elles s’ajoutent aux 22 coiffures existantes, avec les
calques fournis et une coloration Multiply adaptée aux dessins gris. Les noms H/F
repèrent la base d’origine ; l’atelier permet les essais sur les deux bases.
L’import reproductible est `npm run avatar:import-hair` (Python/Pillow requis).

Après la revue du 20 septembre : 41 coiffures dans le jeu (F01 refusée) et
30 chapeaux, Gavroche comprise. Les coiffures sont triées des plus courtes aux
plus longues, puis les cheveux longs attachés ; ordre défini à l’import dans
`scripts/avatar-hair-order.mjs`. Les nouveaux PNG neutres apparaissent en marron
dans les vignettes de sélection uniquement, sans changer leur recoloration.

Sources de l’atelier : `.Tmp/avatar/avatar/editor/`. Ce dossier est actuellement
ignoré par Git ; le conserver avec ses assets et son catalogue pour les retouches.
