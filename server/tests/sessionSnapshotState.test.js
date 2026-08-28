import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSessionPlayerCapabilities,
  deriveSessionSnapshotPhase,
  isSessionRoundDisplayable,
} from "../realtime/sessionSnapshotState.js";

test("session snapshots distinguish preparation from results", () => {
  assert.equal(
    deriveSessionSnapshotPhase({ roundStartPending: true }),
    "preparing"
  );
  assert.equal(
    deriveSessionSnapshotPhase({ breakState: { nextStartAt: 1000 } }),
    "results"
  );
});

test("resume capabilities follow each special round sub-phase", () => {
  assert.deepEqual(
    buildSessionPlayerCapabilities({
      hasSessionRound: true,
      roundStatus: "running",
      specialType: "normal",
    }),
    {
      canSubmit: true,
      canSyncSpecial3Words: false,
      canPropose: false,
      canVote: false,
    }
  );
  assert.equal(
    buildSessionPlayerCapabilities({
      hasSessionRound: true,
      roundStatus: "running",
      specialType: "target_long",
      targetFound: true,
    }).canSubmit,
    false
  );
  assert.equal(
    buildSessionPlayerCapabilities({
      hasSessionRound: true,
      roundStatus: "running",
      specialType: "self_specials_3_words",
    }).canSyncSpecial3Words,
    true
  );
  assert.deepEqual(
    buildSessionPlayerCapabilities({
      hasSessionRound: true,
      roundStatus: "ocid_vote",
      specialType: "ocid",
    }),
    {
      canSubmit: false,
      canSyncSpecial3Words: false,
      canPropose: false,
      canVote: true,
    }
  );
});

test("an active round remains authoritative over transitional flags", () => {
  assert.equal(
    deriveSessionSnapshotPhase({
      currentRound: { id: "r1" },
      hasActiveRound: true,
      roundStartPending: true,
    }),
    "playing"
  );
  assert.equal(deriveSessionSnapshotPhase(), "lobby");
});

test("the OCID vote remains a displayable live round after proposals close", () => {
  assert.equal(
    isSessionRoundDisplayable(
      { special: { type: "ocid" }, status: "ocid_vote" },
      false
    ),
    true
  );
  assert.equal(
    isSessionRoundDisplayable(
      { special: { type: "target_long" }, status: "finished" },
      false
    ),
    false
  );
});
