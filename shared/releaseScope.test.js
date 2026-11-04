import test from "node:test";
import assert from "node:assert/strict";
import { RELEASE_SCOPE, avatarAssetMigrationEnabled, infortuneTournamentEnabled } from "./releaseScope.js";
import { infortuneRoundPolicy, infortuneBreakDuration } from "./infortuneIntermission.js";

test("a stale server flag cannot add a wheel, exchange or longer break to this release", () => {
  for (const value of [undefined, "0", "1"]) for (const round of [1, 4, 6]) {
    const policy = infortuneRoundPolicy({ enabled: infortuneTournamentEnabled({ GOBBLE_INFORTUNE_ENABLED: value }), round, totalRounds: 6 });
    assert.equal(policy, null);
    assert.equal(infortuneBreakDuration(15000, policy, 1000, 1000), 15000);
  }
});

test("unfinished avatar storage and presentation changes stay out of the release", () => {
  assert.ok(Object.isFrozen(RELEASE_SCOPE));
  assert.ok(Object.values(RELEASE_SCOPE).every(value => value === false));
  assert.equal(avatarAssetMigrationEnabled("2026-11-03-avatar-render-assets.sql"), false);
  assert.equal(avatarAssetMigrationEnabled("2026-10-01-avatars.sql"), true);
});
