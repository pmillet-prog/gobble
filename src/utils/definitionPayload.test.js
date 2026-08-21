import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDefinitionFallbacks,
  pickDefinitionList,
  pickDefinitionText,
  sanitizeDefinitionText,
} from "./definitionPayload.js";

test("definition payload ignores placeholders and deduplicates meanings", () => {
  assert.equal(sanitizeDefinitionText(" … "), "");
  assert.equal(pickDefinitionText({ definition: "...", extract: "Un félin." }), "Un félin.");
  assert.deepEqual(
    pickDefinitionList({ definitions: ["Premier sens", "premier sens", "-", "Second sens"] }),
    ["Premier sens", "Second sens"]
  );
});

test("definition fallbacks preserve their original order", () => {
  const tried = new Set(["mot"]);
  assert.deepEqual(
    buildDefinitionFallbacks("Mots", { lemma: "lemme", title: "Titre", matchedTitle: "titre" }, tried),
    ["lemme", "Titre", "mots"]
  );
});
