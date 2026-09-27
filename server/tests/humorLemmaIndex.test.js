import test from "node:test";
import assert from "node:assert/strict";
import { getHumorLemmaLink, buildHumorLemmaForms } from "../definitions/humorLemmaIndex.js";
import { RESULTS_WORD_INTROS, getResultsWordIntro } from "../bots/resultsWordText.js";

test("dictionary descriptions resolve conjugations, plurals and elisions without trusting malformed form_of", () => {
  for (const [definition, lemma] of [
    ["Troisième personne du pluriel de l’imparfait de l’indicatif de manger.", "manger"],
    ["Pluriel de chat (animal).", "chat"], ["Pluriel d’amour.", "amour"],
    ["Féminin singulier de doux.", "doux"],
    ["Féminin pluriel de frit.", "frit"], ["Participe passé de rire.", "rire"],
  ]) assert.equal(getHumorLemmaLink({ definition, form_of: "l'imparfait" })?.lemma, lemma);
  assert.equal(getHumorLemmaLink({ definition: "Forme de pluie cristalline se produisant quand il fait froid.", form_of: "pluie" }), null);
  assert.equal(getHumorLemmaLink({ definition: "Pluriel de chat.", definitions: ["Pluriel de chien."] }), null);
  assert.equal(getHumorLemmaLink({ definition: "Pluriel de chat.", definitions: ["Un autre sens autonome."] }), null);
});

test("offline forms keep their own frequencies, resolve chains, preserve direct entries and reject cycles or two letters", () => {
  const rows = [
    { key: "CHATS", definition: "Pluriel de chat." },
    { key: "FRITES", definition: "Féminin pluriel de frit." },
    { key: "FRIT", definition: "Participe passé de frire." },
    { key: "FRITURE", definition: "Pluriel de frire." },
    { key: "ABC", definition: "Pluriel de def." },
    { key: "DEF", definition: "Pluriel de abc." },
    { key: "AS", definition: "Pluriel de avoir." },
  ];
  const forms = buildHumorLemmaForms(rows, { entries: ["chat", "frire", "friture", "avoir"].map(word => ({ word })),
    dictionary: new Set(rows.map(row => row.key.toLowerCase())), hitsFor: word => ({ normal: word === "chats" ? 42 : 0 }) });
  assert.deepEqual(forms.map(form => [form.word, form.lemma]), [["frit", "frire"], ["frites", "frire"]]);
  assert.equal(forms[0].hits.normal, 0);
  assert.equal(forms[1].formLabel, "forme de");
});

test("the six shared introductions are stable for one round and vary across rounds", () => {
  const values = Array.from({ length: 30 }, (_, index) => getResultsWordIntro(`round-${index}`));
  assert.equal(new Set(values).size, 6);
  assert.ok(values.every(value => RESULTS_WORD_INTROS.includes(value)));
  assert.equal(getResultsWordIntro("round-1"), getResultsWordIntro("round-1"));
  assert.equal(getResultsWordIntro(), "On pouvait aussi trouver");
});
