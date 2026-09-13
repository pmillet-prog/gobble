# Polices du Grand Tableau

Déposer ici les polices à utiliser : `.otf`, `.ttf`, `.woff` ou `.woff2`.
Les sous-dossiers, archives ZIP et autres fichiers sont ignorés.

Le serveur découvre les fichiers automatiquement. Chaque nouveau texte reçoit
une police au hasard parmi celles que le navigateur a pu charger. Ce choix reste
attaché au texte après placement, publication et réouverture du tableau.

Pour ajouter une police en local : copier son fichier ici, puis rouvrir le tableau.
Pour la mettre en ligne : ajouter aussi le fichier dans `public/chalkfont` sur le
serveur et dans le dossier `chalkfont` servi par le site (`dist/chalkfont` pour une
publication compilée). Un build classique copie ce dossier automatiquement.
Il n'y a pas de liste à modifier dans le code ni de redémarrage à prévoir pour un
simple ajout de police, une fois cette version installée.

Conserver les noms des fichiers utilisés : ils identifient la police enregistrée
avec chaque texte. Éviter aussi de retirer une police pendant qu'elle est utilisée
sur le tableau de la semaine.

Utiliser des noms distincts, par exemple `craie-ronde.ttf`. Si plusieurs formats
portent le même nom, un seul est retenu (WOFF2, puis WOFF, OTF, TTF).

`chalk.otf` et `white-chalk.ttf` conservent les identifiants des deux polices déjà
utilisées. Les informations fournies avec chaque police peuvent rester à côté
des fichiers pour préparer les futurs crédits.
