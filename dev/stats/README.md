# Aperçu des statistiques

Lancer `node --preserve-symlinks --preserve-symlinks-main dev/stats/serve.mjs`, puis ouvrir <http://127.0.0.1:8774/dev/stats/>.

Les données sont fictives et les composants sont ceux du jeu. Aucun backend de jeu n'est lancé. `dev/stats/verify.mjs` contrôle les parcours et l'alignement des scores sur ordinateur et téléphone, avec les API du jeu bloquées.

## Habillage du classeur

Le classeur est fixe. Les onglets, les textes et les chiffres restent des éléments HTML. La valeur principale de chaque joueur occupe une colonne réservée à droite. L'image sert uniquement aux matières et aux bords de la feuille ; son découpage CSS conserve les proportions des bordures.

- Asset intégré : `public/stats/binder-paper-blue-v2.webp` (classeur bleu marine, palette bleu / bordeaux / or du jeu).
- Création : outil intégré `image_gen`, sans CLI de génération.
- Conversion technique : PNG vers WebP, qualité 86, sans modification du dessin ni de la résolution.
- Source originale conservée : `C:/Users/Paul/.codex/generated_images/01a1129d-e150-7562-9688-268a241f6d3d/exec-4431bbe0-48cc-46dd-ba9f-bf80a3bfec2c.png`.

Les classements et les types de manche se choisissent dans des menus déroulants. Sur téléphone, un balayage horizontal de la feuille passe au classement voisin, puis à la catégorie suivante ou précédente lorsqu'on arrive au bout d'une catégorie ; la période reste inchangée. Les gestes commencés sur un menu ou un lien conservent leur fonction normale. La feuille entière défile verticalement, sans second défilement dans la liste. La période et les catégories restent au-dessus de la feuille.

Special Elite est utilisée aussi bien pour l'habillage que pour les entrées des classements. Les titres des onglets ont chacun une légère inclinaison fixe. Une petite proportion de caractères reçoit une usure ou une seconde empreinte discrète ; ces irrégularités restent stables entre les rendus et conservent le vrai texte pour la sélection et l'accessibilité.

### Consigne de recoloration de la version intégrée

Modification avec l'outil intégré `image_gen` du fichier `public/stats/binder-paper-v1.webp`. Résultat original conservé dans `C:/Users/Paul/.codex/generated_images/01a1129d-e150-7562-9688-268a241f6d3d/exec-163affbb-4105-4805-9533-43c9cb54c641.png`, puis conversion technique en WebP qualité 86.

> Use case: precise-object-edit. Edit target: the supplied blank stationery binder asset. Change ONLY the color of all olive/green cloth on the outer cover and left spine to a rich deep navy blue, matching a classic dark blue and antique gold game interface (navy around #102b5b, with natural light/shadow variation). Remove every green or olive tint from the cloth, including worn edges: those can be navy and warm brass/beige. Keep the original composition, crop, square size, overhead orthographic view, exact paper placement, blank clean cream paper, paper fibers, shadows, folds, layered page edges, and the two aged golden brass rivets. Preserve all physical texture; this is a material recolor, not a new illustration. Do not add lettering, labels, text, buttons, tabs, objects or decoration. The large central blank cream writing area must remain unchanged.

### Consigne finale de génération

> Use case: product-mockup. Asset type: a blank realistic stationery material background for an interactive game statistics binder, not a finished UI. Generate a square high-resolution image photographed perfectly overhead, absolutely orthographic, edges parallel to image edges. One open vintage dark moss-olive cloth-covered document folder. The folder fills the whole image; no surrounding desk. A large neat stack of blank warm ivory slightly fibrous ledger paper occupies the inner 88 percent of the image, approximately from x=7% to 95%, y=5% to 95%. A narrow visible cloth spine on the left, worn cloth corners, subtle physical layered paper edges on the bottom/right, delicate natural shadows between paper and cloth. Two very small aged brass rivets only on the leftmost spine. A slight crease in the cream paper near the binding. Large central 80 percent stays clean blank pale cream, consistent gentle illumination so dark live text will be legible; paper grain visible but very subtle. Authentically photographed physical materials, quietly handmade French study-room stationery, warm restrained natural lighting. No text, no lettering, no numbers, no drawings, no grid, no lines, no tabs, no UI buttons, no labels, no perspective angle, no pen, no clip across the writing area, no torn burnt paper, no grunge in the center. This asset will be cut into a nine-slice frame by CSS; keep all structural details confined to the outermost 8 percent and the center plain and stretchable.
