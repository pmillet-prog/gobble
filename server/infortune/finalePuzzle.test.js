import test from "node:test";
import assert from "node:assert/strict";
import { chooseTournamentFinalePuzzle } from "./finalePuzzle.js";

test("the major release can draw from the approved current bank in production without relabelling editorial status", () => {
  const puzzle = chooseTournamentFinalePuzzle();
  assert.ok(puzzle?.id);
  assert.ok(puzzle.clue);
  assert.ok(puzzle.answer);
  assert.equal(puzzle.status, "draft");
  assert.notEqual(chooseTournamentFinalePuzzle({ recentIds: [puzzle.id] }).id, puzzle.id);
});
