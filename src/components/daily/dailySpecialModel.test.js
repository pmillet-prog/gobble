import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDailySpecialPlacements,
  createDailySpecialPlacements,
  getDailySpecialWordBlockedReason,
  getEffectiveDailySpecialPlacements,
} from "./dailySpecialModel.js";

test("daily special placements stay unique while dragging", () => {
  const placements = { ...createDailySpecialPlacements(), L2: 1, M3: 2 };
  assert.deepEqual(
    getEffectiveDailySpecialPlacements(placements, { bonusKey: "L2", hoverIndex: 2 }, 16),
    { L2: 2, L3: null, M2: null, M3: null }
  );
});

test("daily special board projection and start-tile rule are deterministic", () => {
  const board = Array.from({ length: 4 }, (_, index) => ({ letter: String(index), bonus: "W2" }));
  const projected = applyDailySpecialPlacements(board, { L2: 0, L3: 0, M2: 3 });
  assert.deepEqual(projected.map((cell) => cell.bonus), ["L2", null, null, "M2"]);
  assert.equal(
    getDailySpecialWordBlockedReason("mot", [0, 1], [{ path: [0, 2] }, { path: [] }], 1),
    "Première tuile déjà utilisée"
  );
});
