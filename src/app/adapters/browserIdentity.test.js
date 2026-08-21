import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeInstallId,
  normalizeStoredPlayerIdentityKey,
} from "./browserIdentity.js";

test("normalizeInstallId preserves valid ids and rejects unsafe values", () => {
  assert.equal(normalizeInstallId("  player-42  "), "player-42");
  assert.equal(normalizeInstallId(null), "");
  assert.equal(normalizeInstallId("x".repeat(161)), "");
});

test("normalizeStoredPlayerIdentityKey unwraps stored user keys", () => {
  assert.equal(normalizeStoredPlayerIdentityKey(" user:42 "), "42");
  assert.equal(normalizeStoredPlayerIdentityKey("install-42"), "install-42");
});
