import assert from "node:assert/strict";
import test from "node:test";

import {
  getTargetWaitDevCatalog,
  validateTargetWaitPuzzle,
} from "../targetMiniGame/targetWaitCatalogService.js";

test("validateTargetWaitPuzzle accepte une grille générée cohérente", () => {
  assert.equal(
    validateTargetWaitPuzzle({
      id: "test",
      grid: "YRIOLSLU_ANGERAR",
      blankIndex: 8,
      choices: ["P", "G", "E", "M", "I"],
      answer: "I",
      word: "GRANULAIRE",
      path: [11, 15, 14, 10, 7, 6, 9, 8, 13, 12],
    }),
    true
  );
});

test("validateTargetWaitPuzzle refuse les réponses incohérentes", () => {
  assert.equal(
    validateTargetWaitPuzzle({
      grid: "YRIOLSLU_ANGERAR",
      blankIndex: 8,
      choices: ["P", "G", "E", "M", "I"],
      answer: "Z",
      word: "GRANULAIRE",
      path: [11, 15, 14, 10, 7, 6, 9, 8, 13, 12],
    }),
    false
  );
});

test("le catalogue Dev local charge les 500 grilles pré-calculées", () => {
  const catalog = getTargetWaitDevCatalog({ limit: 500 });
  assert.equal(catalog.puzzles.length, 500);
  assert.ok(catalog.puzzles.every(validateTargetWaitPuzzle));
});
