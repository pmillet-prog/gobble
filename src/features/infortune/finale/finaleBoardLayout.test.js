import test from "node:test";
import assert from "node:assert/strict";
import { layoutFinaleBoard } from "./finaleBoardLayout.js";

const tiles = text => Array.from(text).map((character, index) => ({ index, kind: character === " " ? "space" : "letter", character: null }));

test("the mobile layout preserves reading order, wraps whole words and fits long words", () => {
  const source = tiles("JE SUIS UNE EXTRAORDINAIRE ENIGME");
  const rows = layoutFinaleBoard(source, 8);
  assert.ok(rows.every(row => row.length <= 8 && row[0].kind !== "space"));
  assert.deepEqual(rows.flat().filter(tile => tile.kind === "letter"), source.filter(tile => tile.kind === "letter"));
  assert.deepEqual(rows[0].filter(tile => tile.kind === "letter").map(tile => tile.index), [0, 1, 3, 4, 5, 6]);
});

test("all bank clues fit a narrow board without losing letters", async () => {
  const { readFileSync } = await import("node:fs");
  const bank = JSON.parse(readFileSync(new URL("../../../../data/infortune-finale-bank.json", import.meta.url), "utf8"));
  for (const puzzle of bank.puzzles) {
    const source = tiles(puzzle.clue);
    const rows = layoutFinaleBoard(source, 8);
    assert.ok(rows.every(row => row.length <= 8));
    assert.deepEqual(rows.flat().filter(tile => tile.kind !== "space"), source.filter(tile => tile.kind !== "space"));
  }
});
