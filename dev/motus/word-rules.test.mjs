import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWord, classifyFrenchPage, targetEligibility } from "./word-rules.mjs";

const page = (title, content) => classifyFrenchPage({ title, text: `== {{langue|fr}} ==\n${content}` });
test("conjugations are excluded, infinitives and past participles are allowed", () => {
  assert.equal(targetEligibility(page("jouais", "=== {{S|verbe|fr|flexion}} ===\n# ''Première personne du singulier de l’imparfait de'' [[jouer]].")), "conjugated-only");
  assert.equal(targetEligibility(page("manger", "=== {{S|verbe|fr}} ===\n# Avaler un aliment.")), "allowed");
  assert.equal(targetEligibility(page("mangés", "=== {{S|verbe|fr|flexion}} ===\n{{fr-verbe-flexion|manger|ppmp=oui}}\n# ''Participe passé masculin pluriel de'' [[manger]].")), "allowed");
  assert.equal(targetEligibility(page("fuyant", "=== {{S|verbe|fr|flexion}} ===\n# ''Participe présent de'' [[fuir]].")), "conjugated-only");
});
test("non-verbal homographs are kept, including plurals", () => {
  assert.equal(targetEligibility(page("portes", "=== {{S|verbe|fr|flexion}} ===\n# Deuxième personne du présent de porter.\n=== {{S|nom|fr|flexion}} ===\n# Pluriel de porte.")), "allowed");
  assert.equal(normalizeWord("mangés"), normalizeWord("manges"));
  const combined = [...page("manges", "=== {{S|verbe|fr|flexion}} ===\n# Deuxième personne du présent de manger."), ...page("mangés", "=== {{S|verbe|fr|flexion}} ===\n# Participe passé masculin pluriel de manger.")];
  assert.equal(targetEligibility(combined), "allowed");
});
test("foreign sections, examples, proper names and unknown words do not supply target evidence", () => {
  assert.equal(targetEligibility(page("jouais", "=== {{S|verbe|fr|flexion}} ===\n# Deuxième personne de l’imparfait.\n#* Exemple avec un participe passé.\n== {{langue|en}} ==\n=== {{S|nom|en}} ===\n# A noun.")), "conjugated-only");
  assert.deepEqual(page("Berlin", "=== {{S|nom propre|fr}} ===\n# Ville."), []);
  assert.equal(targetEligibility([]), "unclassified");
});
