import test from "node:test";
import assert from "node:assert/strict";
import { layoutFinaleBoard, frameFinaleBoard, fitFinaleBoard } from "./finaleBoardLayout.js";

const tiles = text => Array.from(text).map((character, index) => ({ index, kind: character === " " ? "space" : "letter", character: null }));
const longestWord = text => Math.max(...text.split(' ').map(word => word.length));
function assertWholeWords(source, rows) {
  const positions = new Map(rows.flatMap((row, i) => row.filter(tile => tile.kind !== 'padding').map(tile => [tile.index, i])));
  for (let i = 1; i < source.length; i++) if (source[i].kind !== 'space' && source[i - 1].kind !== 'space')
    assert.equal(positions.get(source[i].index), positions.get(source[i - 1].index), `word split at tile ${i}`);
}

test("the mobile layout preserves reading order, wraps whole words and fits long words", () => {
  const source = tiles("JE SUIS UNE EXTRAORDINAIRE ENIGME");
  const rows = layoutFinaleBoard(source, 8);
  assert.ok(rows.every(row => row.length <= 14 && row[0].kind !== "space"));
  assert.deepEqual(rows.flat().filter(tile => tile.kind === "letter"), source.filter(tile => tile.kind === "letter"));
  assertWholeWords(source, rows);
});

test('middle rows use both outer columns while the stepped corners stay empty', () => {
  const source = tiles('ABC ABCDEFGHIJ ABCDEFGHIJ ABC');
  const rows = frameFinaleBoard(source, 10);
  assert.equal(rows.length, 4);
  assert.equal(rows[1][0].kind, 'letter'); assert.equal(rows[1].at(-1).kind, 'letter');
  assert.equal(rows[2][0].kind, 'letter'); assert.equal(rows[2].at(-1).kind, 'letter');
  for (const edge of [rows[0], rows.at(-1)]) { assert.equal(edge[0].kind, 'padding'); assert.equal(edge.at(-1).kind, 'padding'); }
  assertWholeWords(source, rows);
});

test("every clue fits the available width and height, with the same wrapping before and after reveal", async () => {
  const { readFileSync } = await import("node:fs");
  const bank = JSON.parse(readFileSync(new URL("../../../../data/infortune-finale-bank.json", import.meta.url), "utf8"));
  for (const puzzle of bank.puzzles) {
    const source = tiles(puzzle.clue);
    for (const viewport of [{ width: 270, height: 164, aspect: 1 }, { width: 230, height: 176, aspect: 1 }, { width: 900, height: 580 }]) {
      const fitted = fitFinaleBoard(source, viewport);
      assert.ok(fitted.width <= viewport.width + .01, puzzle.id);
      assert.ok(fitted.cell / (viewport.aspect || .79) * fitted.rows.length + (fitted.rows.length - 1) * 2 <= viewport.height + .01, puzzle.id);
      assert.deepEqual(fitted.rows.flat().filter(tile => tile.kind === "letter"), source.filter(tile => tile.kind === "letter"));
      assertWholeWords(source, fitted.rows);
      const revealed = fitFinaleBoard(source.map(tile => ({ ...tile, character: "A" })), viewport);
      assert.equal(revealed.columns, fitted.columns);
      assert.equal(revealed.rows.length, fitted.rows.length);
      assert.equal(revealed.cell, fitted.cell);
    }
  }
});

test("all bank clues fit a narrow board without losing letters", async () => {
  const { readFileSync } = await import("node:fs");
  const bank = JSON.parse(readFileSync(new URL("../../../../data/infortune-finale-bank.json", import.meta.url), "utf8"));
  for (const puzzle of bank.puzzles) {
    const source = tiles(puzzle.clue);
    const rows = layoutFinaleBoard(source, 8);
    assert.ok(rows.every(row => row.length <= Math.max(8, longestWord(puzzle.clue))));
    assert.deepEqual(rows.flat().filter(tile => tile.kind !== "space"), source.filter(tile => tile.kind !== "space"));
    for (const columns of [10, 22]) {
      const framed = frameFinaleBoard(source, columns);
      assert.ok(framed.length >= 4 && framed.every(row => row.length === Math.max(columns, longestWord(puzzle.clue))));
      assert.deepEqual(framed.flat().filter(tile => tile.kind === "letter"), source.filter(tile => tile.kind === "letter"));
      for (const edge of [framed[0], framed.at(-1)]) {
        assert.equal(edge[0].kind, "padding");
        assert.equal(edge.at(-1).kind, "padding");
      }
    }
  }
});
