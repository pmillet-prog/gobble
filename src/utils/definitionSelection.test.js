import test from "node:test";
import assert from "node:assert/strict";
import { resolveDefinitionSelection } from "./definitionSelection.js";

test("the exact question meaning is selected among multiple definitions", () => {
  const definitions = ["Un banc pour s’asseoir.", "Un groupe de poissons.", "Un amas de sable."];
  assert.deepEqual(resolveDefinitionSelection({
    definitions,
    highlightedDefinition: definitions[1],
  }), { items: definitions, highlightedIndex: 1 });
});

test("question matching tolerates only formatting changes, not a partial meaning", () => {
  assert.deepEqual(resolveDefinitionSelection({
    definitions: ["Animal vivant dans l’eau.", "État   de ce qui est \n calme."],
    highlightedDefinition: "E\u0301tat de ce qui est calme.",
  }), {
    items: ["Animal vivant dans l’eau.", "État   de ce qui est \n calme."],
    highlightedIndex: 1,
  });
  assert.deepEqual(resolveDefinitionSelection({
    definitions: ["Un groupe de poissons.", "Un groupe de personnes."],
    highlightedDefinition: "Un groupe.",
  }), {
    items: ["Un groupe de poissons.", "Un groupe de personnes.", "Un groupe."],
    highlightedIndex: 2,
  });
});

test("a single meaning and ordinary definition opens have no question highlighting", () => {
  assert.deepEqual(resolveDefinitionSelection({
    definition: "Un félin.",
    highlightedDefinition: "Un félin.",
  }), { items: ["Un félin."], highlightedIndex: -1 });
  assert.deepEqual(resolveDefinitionSelection({
    definitions: ["Premier sens.", "Second sens."],
  }), { items: ["Premier sens.", "Second sens."], highlightedIndex: -1 });
});

test("the question remains readable when the dictionary response is unavailable", () => {
  assert.deepEqual(resolveDefinitionSelection({
    definitions: ["…", ""],
    highlightedDefinition: "Un groupe de poissons.",
  }), { items: ["Un groupe de poissons."], highlightedIndex: -1 });
});

test("resolving a question does not mutate the dictionary meanings", () => {
  const definitions = Object.freeze(["Premier sens."]);
  resolveDefinitionSelection({ definitions, highlightedDefinition: "Autre sens." });
  assert.deepEqual(definitions, ["Premier sens."]);
});
