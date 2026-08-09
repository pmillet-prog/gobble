import test from "node:test";
import assert from "node:assert/strict";

import {
  INTER_TOURNAMENT_MIN_COOLDOWN_MS,
  getTournamentLobbyCooldownStatus,
} from "../tournamentLobbyCooldownPolicy.js";

test("the inter-tournament cooldown lasts at least twenty seconds", () => {
  assert.equal(INTER_TOURNAMENT_MIN_COOLDOWN_MS, 20_000);
  assert.deepEqual(
    getTournamentLobbyCooldownStatus({
      cooldownEndsAt: 120_000,
      humanCount: 2,
      now: 100_000,
      readyCount: 2,
      readyThreshold: 2,
    }),
    {
      active: true,
      endsAt: 120_000,
      readyThresholdMet: true,
      remainingMs: 20_000,
    }
  );
});

test("readiness and cooldown expiry are evaluated independently", () => {
  assert.equal(
    getTournamentLobbyCooldownStatus({
      cooldownEndsAt: 120_000,
      humanCount: 2,
      now: 105_000,
      readyCount: 1,
      readyThreshold: 2,
    }).readyThresholdMet,
    false
  );
  assert.equal(
    getTournamentLobbyCooldownStatus({
      cooldownEndsAt: 120_000,
      humanCount: 2,
      now: 120_000,
      readyCount: 2,
      readyThreshold: 2,
    }).active,
    false
  );
});

test("a solo player never has to wait for the inter-tournament cooldown", () => {
  assert.deepEqual(
    getTournamentLobbyCooldownStatus({
      cooldownEndsAt: 120_000,
      humanCount: 1,
      now: 100_000,
      readyCount: 1,
      readyThreshold: 1,
    }),
    {
      active: false,
      endsAt: null,
      readyThresholdMet: true,
      remainingMs: 0,
    }
  );
});
