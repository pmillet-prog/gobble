# Réparer les étymologies à partir du dump Wiktionnaire

Le script travaille sur une copie cohérente et récente de la base de définitions.
Il relit le dump XML sur le PC et crée un nouveau fichier SQLite. La source reste
inchangée ; un fichier de sortie existant n’est jamais écrasé.

```powershell
node server/scripts/repair-definition-etymologies.mjs `
  --db .tmp/definitions-source.sqlite `
  --dump data/frwiktionary-latest-pages-articles.xml `
  --output .tmp/definitions-corrigees.sqlite
```

Seule la colonne `definitions.etymology` est modifiée. Les entrées sont associées
au titre exact de leur page source, et seuls les enregistrements `wiktionary` sont
concernés. Une étymologie vide dans l’extraction ne remplace jamais un texte existant.
Les textes contenant des guillemets ou parenthèses mal formés sont signalés dans
le rapport et conservent leur ancienne valeur. Les coupures des textes longs
se font en dehors des parenthèses et des sens entre guillemets.
Les définitions, compléments locaux, thèmes, enrichissements linguistiques,
métadonnées et autres tables sont conservés. Le script compare leur empreinte
avant et après réparation et vérifie l’intégrité SQLite.

La transcription et le sens sont conservés lorsqu’ils figurent dans les modèles
du dump (`étyl`, `lien`, `polytonique`). Le script n’invente pas une transcription
absente. Les paramètres positionnels, nommés et les liens imbriqués sont pris en
charge. La limite habituelle de 420 caractères par étymologie reste appliquée.

Les modèles `siècle` et `siècle2` sont distingués : le premier inclut le mot
« siècle », le second fournit seulement le numéro ordinal. Les dates inconnues
sont rendues par « Date à préciser » ou « Siècle à préciser », sans inventer de
datation. Les fourchettes, `circa`, exposants, chiffres arabes, liens et suffixes
sont conservés. Les modèles de composition et les dérivations `dénominal`,
`déverbal`, `apocope` et `aphérèse` conservent leurs termes d’origine.

Deux fichiers accompagnent la copie :

- `.report.json` : bilan, empreintes SHA-256 des bases, conservation des données ;
- `.changes.jsonl` : mot et texte avant/après pour chaque modification.

Le rapport contient aussi `quality.remainingTextIssues`, y compris pour les
textes conservés sans modification, et `quality.unsupportedTemplates`, avec
fréquences et exemples. Ces listes servent à la relecture : un modèle non rendu
peut être un marqueur bibliographique, mais aussi du contenu manquant.
`ok: true` certifie le déroulement de la copie et ses contrôles d’intégrité ;
ce n’est pas une certification de complétude linguistique. Ne pas annoncer une
base entièrement corrigée sur la seule foi de ce champ.

Avant une copie depuis la VM, vérifier que le journal `-wal` est vide, puis comparer
l’empreinte du fichier transféré à celle de la source. Si le journal contient des
données, utiliser une sauvegarde SQLite cohérente au lieu d’une copie du seul fichier.

Transférer le résultat validé dans un dossier de préparation sur la VM, puis vérifier
son empreinte. Le transfert ne l’active pas : le backend conserve une connexion et
des caches sur l’ancienne base. La mise en service doit conserver une sauvegarde
et nécessite l’accord explicite de Paul avant tout arrêt ou redémarrage, conformément
à `AGENTS.md`.
