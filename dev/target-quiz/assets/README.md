# Logo Qui veut gagner des Gobblars

Créé le 1er novembre 2026 avec l’outil intégré **image_gen**, en modification du
logo de référence `public/bots/foucault/millions-logo.png` déjà présent dans le projet.

- Source générée : `gobblars-logo-generated.png`.
- Consigne exacte : `gobblars-logo.prompt.txt`.
- Export web : `public/bots/foucault/gobblars-logo-v1.webp`, 512 px de côté,
  fond transparent conservé ; redimensionnement et compression WebP qualité 88
  avec ImageMagick. Aucun redessin ni remplacement du texte après génération.

Le logo est utilisé dans l’annonce des manches cibles dont le bonus est le quiz,
les badges de résultats, le récapitulatif du quiz et la progression du profil.
La référence originale est conservée pour la provenance ; le jeu utilise l’export
Gobblars via `src/features/targetQuiz/targetQuizAssets.js`.
