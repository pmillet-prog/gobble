import test from "node:test";
import assert from "node:assert/strict";
import { RELEASE_SCOPE, avatarAssetMigrationEnabled, infortuneTournamentEnabled } from "./releaseScope.js";
import { infortuneRoundPolicy, infortuneBreakDuration } from "./infortuneIntermission.js";

test("the production wheel requires the server opt-in and keeps the exchange on spin four", () => {
  for (const value of [undefined, "0"]) for (const round of [1, 4, 6]) {
    const policy = infortuneRoundPolicy({ enabled: infortuneTournamentEnabled({ GOBBLE_INFORTUNE_ENABLED: value }), round, totalRounds: 6 });
    assert.equal(policy, null);
    assert.equal(infortuneBreakDuration(15000, policy, 1000, 1000), 15000);
  }
  const enabled = infortuneTournamentEnabled({ NODE_ENV: "production", GOBBLE_INFORTUNE_ENABLED: "1" });
  assert.equal(enabled, true);
  assert.equal(infortuneRoundPolicy({ enabled, round: 1, totalRounds: 5 }).exchangeEnabled, false);
  assert.equal(infortuneRoundPolicy({ enabled, round: 4, totalRounds: 5 }).exchangeEnabled, true);
  assert.equal(infortuneRoundPolicy({ enabled, round: 5, totalRounds: 5 }), null);
});

test("the major release enables avatar storage while keeping unrelated release flags unchanged", () => {
  assert.ok(Object.isFrozen(RELEASE_SCOPE));
  assert.equal(RELEASE_SCOPE.avatarRenderAssets, true);
  for (const key of ["roundResultsReadiness", "roundBonusAnnouncements", "targetQuizBranding"]) assert.equal(RELEASE_SCOPE[key], false);
  assert.equal(avatarAssetMigrationEnabled("2026-11-03-avatar-render-assets.sql"), true);
  assert.equal(avatarAssetMigrationEnabled("2026-10-01-avatars.sql"), true);
});

test("only an explicit local opt-in enables the real wheel integration outside production", () => {
  assert.equal(infortuneTournamentEnabled({ NODE_ENV: "development", GOBBLE_LOCAL_INFORTUNE_ENABLED: "1" }), true);
  assert.equal(infortuneTournamentEnabled({ GOBBLE_LOCAL_INFORTUNE_ENABLED: "1" }), true);
  for (const NODE_ENV of ["test", "production"]) {
    assert.equal(infortuneTournamentEnabled({ NODE_ENV, GOBBLE_LOCAL_INFORTUNE_ENABLED: "1" }), false);
  }
  assert.equal(infortuneTournamentEnabled({ NODE_ENV: "development", GOBBLE_INFORTUNE_ENABLED: "1" }), true);
  assert.equal(infortuneTournamentEnabled({ NODE_ENV: "development", GOBBLE_LOCAL_INFORTUNE_ENABLED: "0" }), false);
});
