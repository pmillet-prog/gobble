import assert from "node:assert/strict";
import test from "node:test";

import { computeSpecial3GobbleAwards } from "../compute/special3GobblePolicy.js";

test("awards one Gobble to every player holding a longest possible word", () => {
  const result = computeSpecial3GobbleAwards(
    [
      { nick: "Alice", words: ["chat", "maison", "soleil"] },
      { nick: "Bob", words: ["chat", "maison", "soleil"] },
    ],
    6
  );

  assert.equal(result.maxPossibleLength, 6);
  assert.deepEqual(Object.fromEntries(result.gobbles), { Alice: 1, Bob: 1 });
});

test("never awards more than one Gobble when a player has several longest words", () => {
  const result = computeSpecial3GobbleAwards(
    [
      { nick: "Alice", words: ["maison", "soleil", "animal"] },
      { nick: "Bob", words: ["table", "route", "plage"] },
    ],
    6
  );

  assert.equal(result.gobbles.get("Alice"), 1);
  assert.equal(result.gobbles.has("Bob"), false);
  assert.deepEqual(result.gobbleFlags.get("Alice"), { score: false, len: true });
});

test("awards nothing when the longest possible grid length was not reached", () => {
  const result = computeSpecial3GobbleAwards(
    [
      { nick: "Alice", words: ["route", "soleil"] },
      { nick: "Bob", words: ["route", "soleil"] },
      { nick: "Chloe", words: [] },
    ],
    9
  );

  assert.equal(result.maxPossibleLength, 9);
  assert.equal(result.gobbles.size, 0);
});

test("awards no Gobble when the grid maximum is unavailable", () => {
  const result = computeSpecial3GobbleAwards(
    [
      { nick: "Alice", words: ["maison"] },
      { nick: "Bob", words: ["soleil"] },
    ],
    0
  );

  assert.equal(result.maxPossibleLength, 0);
  assert.equal(result.gobbles.size, 0);
});
