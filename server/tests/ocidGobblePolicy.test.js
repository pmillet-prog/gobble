import assert from "node:assert/strict";
import test from "node:test";

import { computeOcidGobbleAwards } from "../compute/ocidGobblePolicy.js";

test("awards one Gobble to every player who traced the OCID target", () => {
  const result = computeOcidGobbleAwards([
    { nick: "Alice", ocid: { exactTarget: true } },
    { nick: "Bob", ocid: { exactTarget: true } },
    { nick: "Chloe", ocid: { exactTarget: false, correctVote: true } },
  ]);

  assert.deepEqual(Object.fromEntries(result.gobbles), { Alice: 1, Bob: 1 });
  assert.deepEqual(result.gobbleFlags.get("Alice"), {
    score: false,
    len: false,
    ocidTarget: true,
  });
  assert.equal(result.gobbles.has("Chloe"), false);
});

test("ignores malformed results and never awards more than one OCID Gobble per player", () => {
  const result = computeOcidGobbleAwards([
    null,
    { nick: "" },
    { nick: "Alice", ocid: { exactTarget: true } },
    { nick: "Alice", ocid: { exactTarget: true } },
  ]);

  assert.equal(result.gobbles.size, 1);
  assert.equal(result.gobbles.get("Alice"), 1);
});
