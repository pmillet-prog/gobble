import assert from "node:assert/strict";
import test from "node:test";
import { buildLepersRoundResult, pickLepersDefinition } from "./lepersChallenge.js";

test("the recap preserves the selected sense, even when it is not the first definition", () => {
  const entry = {
    definition: "Désigner par connotation.",
    definitions: [
      "Désigner par connotation.",
      "Dépasser la signification conceptuelle d’un mot et lui ajouter un contenu dépendant du contexte.",
    ],
  };
  const selected = pickLepersDefinition(entry, "connoter");
  assert.equal(selected.definition, entry.definitions[1]);
  const result = buildLepersRoundResult({
    id: "round:lepers", word: "CONNOTER", definition: selected.definition, foundBy: new Set(),
  });
  assert.equal(result.word, "connoter");
  assert.equal(result.definition, entry.definitions[1]);
  assert.equal(result.id, "round:lepers:answer");
  assert.equal(result.kind, "answer");
  assert.deepEqual(result.highlights, ["CONNOTER"]);
  assert.equal(result.text, "« CONNOTER », bien sûr !");
  assert.equal(result.chatCopyText, "La réponse était « CONNOTER ».");
});

test("the result keeps the existing singular and plural finder acknowledgements", () => {
  for (const [finders, expected] of [
    [["Alice"], "Bravo à Alice, qui l’a trouvé !"],
    [["Alice", "Bob"], "Bravo à Alice et Bob, qui l’ont trouvé !"],
  ]) {
    const result = buildLepersRoundResult({
      id: "round:lepers", word: "ébahir", definition: "Surprendre très vivement quelqu’un.",
      foundBy: new Set(finders),
    });
    assert.equal(result.word, "ebahir");
    assert.equal(result.chatCopyText, `La réponse était « EBAHIR ». ${expected}`);
  }
});

test("rounds without a question do not produce a QPUC recap", () => {
  assert.equal(buildLepersRoundResult(null), null);
  assert.equal(buildLepersRoundResult({ id: "round:lepers" }), null);
});
