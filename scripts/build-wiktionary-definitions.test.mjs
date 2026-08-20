import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanDefinitionText,
  cleanEtymologyText,
} from "./build-wiktionary-definitions.mjs";

test("conserve le texte visible des liens Wikipédia", () => {
  assert.equal(
    cleanDefinitionText(
      "Voir {{w|Denis Diderot}}, {{W|Jean le Rond d’Alembert}} et {{WP|Encyclopédie|titre=l’Encyclopédie}}."
    ),
    "Voir Denis Diderot, Jean le Rond d’Alembert et l’Encyclopédie."
  );
});

test("préfère le libellé visible d’un lien Wikipédia", () => {
  assert.equal(
    cleanDefinitionText("{{w|Lord Kelvin|baron Kelvin|lang=fr}}"),
    "baron Kelvin"
  );
});

test("conserve les dates et siècles utiles au texte", () => {
  assert.equal(
    cleanDefinitionText("{{date|lang=fr|1753}} puis {{siècle|XX}}"),
    "1753 puis XXe siècle"
  );
});

test("répare l’étymologie de champlever issue du dump", () => {
  const raw =
    ": {{date|1753}}{{RÉF|1}} Première attestation dans l’{{w|Encyclopédie ou Dictionnaire raisonné des sciences, des arts et des métiers|Encyclopédie}} de {{w|Denis Diderot}} et {{w|Jean le Rond d’Alembert}}. Mot construit à partir du mot [[champ]], « fond d’une gravure », avec le verbe [[lever]].";

  assert.equal(
    cleanEtymologyText(raw),
    "1753 Première attestation dans l’Encyclopédie de Denis Diderot et Jean le Rond d’Alembert. Mot construit à partir du mot champ, « fond d’une gravure », avec le verbe lever."
  );
});
