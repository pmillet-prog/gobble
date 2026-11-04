# Atelier de la finale de l’infortune

Avec le serveur frontend habituel (`npm run dev`), ouvrir **Menu dev → Ateliers →
La finale de l’infortune**, ou `/dev/infortune-finale/`. Cet atelier ne se connecte
pas au backend : les essais sont possibles même quand celui-ci est arrêté.

La rubrique **Relire le pool** affiche les énoncés, réponses et variantes en
clair, par pages de 25. Une recherche par texte, réponse ou identifiant et des
filtres de type, thème et difficulté facilitent la relecture. Chaque fiche donne
accès à sa référence lorsqu’elle est disponible et permet d’essayer le texte sur
le tableau. Les filtres et la page sont conservés lors du retour à la relecture.

Le tableau masque **l’énoncé**, pas le mot à trouver. Le joueur achète des lettres
puis propose une unique réponse en un mot. La validation explicite évite de
consommer cette tentative sur une touche Entrée accidentelle.

## Contenu distinct des autres manches

`data/infortune-finale-bank.json` contient un pool de 4 200 textes : 2 100 énigmes
et 2 100 questions de culture générale rédigées pour cette finale. Aucun texte n’est
importé depuis la base de définitions existante. Cela ne garantit pas que les
mots-réponses soient absents du vocabulaire des autres jeux.

Chaque entrée porte un identifiant stable, un type (`riddle`, `quiz` ou
`definition`), un thème visible dès le départ, une difficulté indicative (1–3),
l’énoncé, le mot-réponse et sa provenance. Les références des questions servent à
vérifier les faits ; leurs textes ne sont pas des citations des sources.

Les thèmes sont explicites et peuvent être nombreux. Leur liste dans le manifeste
reste extensible ; l’assemblage détecte les intitulés non déclarés. Les thèmes
vagues ont été répartis selon le sujet de chaque texte, et les variantes autour
du monde vivant sont réunies sous « Nature ».

Tous les textes sont des **brouillons** (`status: "draft"`). Le sélecteur destiné
au live n’accepte que `reviewed` ; l’atelier demande explicitement les brouillons.
Avant publication, relire l’énoncé, vérifier qu’il mène à une réponse assez
univoque et calibrer la difficulté en tenant compte du thème déjà visible.

Le catalogue est assemblé à partir des lots éditables de `data/infortune-finale/`.
Les douze premiers identifiants restent dans `seed.json`. Ne pas modifier
directement le catalogue assemblé : une reconstruction remplacerait ces retouches.
Le guide [POOL.md](../../data/infortune-finale/POOL.md) décrit les ajouts,
les références et le rapport de contrôle. Après une correction :

```powershell
npm run infortune:pool
npm run infortune:pool:check
```

Pour enrichir la base : ajouter une entrée à un lot, avec un énoncé de 20 à 160 caractères
et une réponse en un seul mot alphabétique. `acceptedAnswers` accepte des synonymes
ou variantes explicites. `excludedAnswers` empêche la tolérance de valider des
mots proches mais incorrects. Les accents et ligatures sont normalisés ; à partir
de six lettres, une seule insertion, suppression, substitution ou inversion
adjacente est tolérée. Cette règle est volontairement limitée et pourra être
resserrée après les essais. Le validateur refuse les doublons d’énoncés et les
réponses directement écrites dans leur propre énoncé.

Le tirage exclut les identifiants récemment utilisés et reprend le plus ancien
si toute la base est épuisée. Lors du raccordement au tournoi, le serveur devra
tirer **une énigme commune**, puis créer une session par joueur avec sa cagnotte.
L’historique de tirage devra être conservé par ce même propriétaire de session.

## Barème provisoire et présentation

- Cagnotte de test : 2 000 ; consonne : 50 ; voyelle : 150 (Y compris).
- Un achat paie toutes les occurrences d’une lettre, même si celle-ci est absente.
- E révèle également É, È, Ê et Ë ; les accents restent visibles sur le tableau.
- Les occurrences pivotent en ordre de lecture, sans chevauchement : 480 ms de
  pivot puis 60 ms avant la suivante. Les achats sont verrouillés durant cette
  séquence. Masquer l’onglet ou demander moins d’animations achève la révélation
  déjà payée sans bloquer les contrôles.
- Réussite : 1 000 points et 1 gobblar par tranche entière de 10 restant dans la
  cagnotte. Échec : aucun gain de finale. Tous ces montants sont des réglages
  d’essai, appliqués seulement en recommençant.
- Il n’y a pas encore de limite de temps dans l’atelier. Aucune cagnotte ni aucun
  portefeuille réel n’est modifié, et le tableau n’est pas encore déclenché à la
  fin du tournoi.

## Responsabilités

Le domaine partagé (`shared/createInfortuneFinaleSession.js`) possède les achats,
la réponse unique et le résultat. Son snapshot public n’expose ni la solution ni
les lettres non achetées avant la réponse finale. Seul l’atelier importe la base
complète côté navigateur ; le futur live devra héberger ce domaine côté serveur.

Le contrôleur `src/features/infortune/finale/createFinaleController.js` possède
les timers de révélation et leur nettoyage. Les composants consomment son état.
Les cases ont un pivot CSS en perspective, sans boucle de rendu permanente.
L’entrée Vite séparée ne charge aucun de ces fichiers dans l’accueil du jeu.

Vérification ciblée :

```powershell
node --preserve-symlinks --preserve-symlinks-main --test src/features/infortune/finale/*.test.js
```
