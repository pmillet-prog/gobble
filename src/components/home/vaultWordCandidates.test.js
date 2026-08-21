import test from "node:test";
import assert from "node:assert/strict";

import { pickVaultWordOfDayCandidates } from "./vaultWordCandidates.js";

test("vault candidates are normalized, unique and bounded", () => {
  const candidates = pickVaultWordOfDayCandidates(
    [
      { word: "Été" },
      { word: "ete" },
      { word: "Chat", wordKey: "chat" },
      { word: "" },
    ],
    2,
    () => 0.999
  );
  assert.deepEqual(candidates, [
    { word: "Été", wordKey: "ete" },
    { word: "Chat", wordKey: "chat" },
  ]);
});
