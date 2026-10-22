# Assets du prototype Motus

Génération avec l'outil intégré `image_gen`, à partir des références fournies dans `.tmp/motus`. Les fichiers PNG gardent les sorties originales ; les WebP sont destinés au prototype. Aucun asset public existant n'est remplacé.

- `thierry-baccardo.webp` : planche transparente de 7 cases horizontales, 2170 × 530 px, soit 310 × 530 px par case. Les fichiers `thierry-baccardo-0.webp` à `thierry-baccardo-6.webp` contiennent les mêmes cases séparées.
- Ordre, indices à partir de zéro : bouche O, petite ouverture, grande ouverture A, bouche pincée, ouverture moyenne, clin d'œil, sourire neutre. La case 6 sert au repos, la 5 au clin d'œil ; les cases 0 à 4 à la parole. Ordre compatible avec l'animation du présentateur Lepers.
- `studio.webp` : décor 1672 × 941 px. Cadre bleu vide de x ≈ 20,9 % à 78,1 % et de y ≈ 49,4 % au bas de l'image. Le présentateur peut se placer au centre au-dessus, derrière la grille interactive. Le décor est volontairement sans texte, sans candidats et sans cases imprimées.

Les prompts exacts figurent dans `prompts.json` (présentateur), `presenter-cleanup.prompt.txt` (nettoyage des bordures par ImageGen) et `studio.prompt.txt` (décor). La source sélectionnée pour le présentateur est `thierry-baccardo-cleaned.png`. Références du présentateur : `bec.jpg`, `bec2.jpg`, `bec3.jpg` ; style : `public/bots/lepers-sprite.webp`. Référence du décor : `.tmp/motus/environnement jeu.jpg`.

`python dev/motus/assets/prepare-assets.py` régénère les WebP et `manifest.json` avec Pillow. Comme pour Bafouille, la découpe suit les sept silhouettes connectées dans le canal alpha : les positions du dessin source ne correspondent pas à sept bandes de largeur égale. Chaque silhouette est isolée avec son contour anticrénelé, puis centrée dans sa case ; les fragments des voisins et les poussières détachées sont exclus. Une échelle commune et un alignement vertical commun évitent les sauts entre expressions. La source PNG reste inchangée.

L’export vérifie une marge entièrement transparente d’au moins huit pixels sur les quatre côtés de chacune des sept cases, y compris après encodage WebP. Une planche de contrôle sur fonds clair et bleu, à la taille d’affichage du prototype, est écrite dans `.tmp/motus/sprite-review/contact.png`. Les limites des silhouettes sources et des pixels exportés sont conservées dans le manifeste.

## Sons fournis par Paul

Les cinq fichiers de `audio/` sont des copies des MP3 de `.tmp/sons motus/`, conservées sans transformation : `motus-lettre-bonne-reverb.mp3`, `motus-lettre-mal-placee-reverb.mp3`, `motus-lettre-non-valide-reverb.mp3`, `motus-mot-trouve.mp3` et `motus-perdu.mp3`.

Les fenêtres des quatre arpèges de victoire ont été mesurées dans le MP3 décodé : 0,048–0,516 s, 0,516–0,995 s, 0,995–1,474 s et 1,474–1,953 s, relativement au début de lecture. Chaque fenêtre est répartie sur les six lettres ; `feedback.mjs` utilise l’horloge audio pour suivre leur progression. Le bruit de pièce commence vers 1,81 s et chevauche donc le dernier arpège ; la lecture se poursuit jusqu’à la fin du fichier, vers 2,61 s.
