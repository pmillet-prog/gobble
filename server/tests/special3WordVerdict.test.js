import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLiveSpecial3Word } from "../compute/special3WordVerdict.js";
import { scoreWordOnGridWithPath } from "../../shared/gameLogic.js";

const grid = "CHATSOURILENEMOTS".split("").map(letter => ({ letter, bonus: null }));
grid[0].bonus = "M3";
const base = { word: "chat", path: [0, 1, 2, 3], grid, dictionary: new Set(["chat"]) };

test("live final verdict preserves the path score and placed bonuses", () => {
  const verdict = evaluateLiveSpecial3Word(base);
  assert.equal(verdict.valid, true);
  assert.equal(verdict.reason, null);
  assert.equal(verdict.points, scoreWordOnGridWithPath("chat", grid, base.path).pts);
  assert.ok(verdict.points > 0);
});

test("a traceable nonword scores zero only at the final dictionary check", () => {
  const input = { ...base, word: "chat", dictionary: new Set() };
  assert.ok(scoreWordOnGridWithPath(input.word, grid, input.path));
  assert.deepEqual(evaluateLiveSpecial3Word(input), { scored: null, valid: false, reason: "not_in_dictionary", points: 0 });
});

test("live verdicts retain the existing duplicate and path rejection order", () => {
  for (const [overrides, reason] of [
    [{ duplicateWord: true, duplicateStartTile: true }, "duplicate_word"],
    [{ duplicateStartTile: true }, "duplicate_start"],
    [{ path: [0, 1, 3, 2] }, "invalid_path"],
    [{ path: [] }, "invalid_path"],
    [{ word: "", path: [] }, "empty"],
  ]) {
    const verdict = evaluateLiveSpecial3Word({ ...base, ...overrides });
    assert.equal(verdict.valid, false);
    assert.equal(verdict.points, 0);
    assert.equal(verdict.reason, reason);
  }
});
