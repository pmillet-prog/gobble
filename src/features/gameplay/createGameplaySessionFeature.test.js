import test from "node:test";
import assert from "node:assert/strict";

import { createApplicationKernel } from "../../app/core/createApplicationKernel.js";
import { createGameplaySessionFeature } from "./createGameplaySessionFeature.js";

function createHarness(view = "live") {
  const kernel = createApplicationKernel();
  kernel.features.define("gameplaySession", (context) =>
    createGameplaySessionFeature(context)
  );
  const lease = kernel.features.acquire("gameplaySession");
  kernel.commands.navigation.go(view);
  return {
    feature: lease.feature,
    kernel,
    release: () => {
      lease.release();
      kernel.dispose();
    },
  };
}

test("a navigation outside the active origin cancels its resources synchronously", () => {
  const harness = createHarness("live");
  let disposed = 0;
  let cancelled = null;
  harness.feature.configure({
    onCancel: ({ reason }) => {
      cancelled = reason;
    },
  });
  const opened = harness.feature.startRound({ roomId: "room-4x4", roundId: "r1" });
  harness.feature.registerResource(() => {
    disposed += 1;
  }, opened.state.sessionId);

  harness.kernel.commands.navigation.go("daily");

  assert.equal(disposed, 1);
  assert.equal(cancelled, "navigation:daily");
  assert.equal(harness.feature.store.getState().phase, "idle");
  harness.release();
});

test("events from another room or an obsolete round are rejected", () => {
  const harness = createHarness("live");
  harness.feature.startRound({ roomId: "room-4x4", roundId: "r1" });

  assert.equal(
    harness.feature.acceptsEvent({ origin: "live", roomId: "room-4x4", roundId: "r1" }),
    true
  );
  assert.equal(
    harness.feature.acceptsEvent({ origin: "live", roomId: "room-5x5", roundId: "r1" }),
    false
  );
  assert.equal(
    harness.feature.acceptsEvent({ origin: "live", roomId: "room-4x4", roundId: "r0" }),
    false
  );
  assert.equal(
    harness.feature.acceptsEvent({ origin: "daily", roomId: "room-4x4", roundId: "r1" }),
    false
  );
  harness.release();
});

test("a duplicate round start cannot reset an active round", () => {
  const harness = createHarness("live");
  const first = harness.feature.startRound({ roomId: "room-4x4", roundId: "r1" });
  const duplicate = harness.feature.startRound({ roomId: "room-4x4", roundId: "r1" });

  assert.equal(first.accepted, true);
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.state.sessionId, first.state.sessionId);
  harness.release();
});

test("an authoritative snapshot replaces the previous local generation", () => {
  const harness = createHarness("live");
  const first = harness.feature.startRound({ roomId: "room-4x4", roundId: "r1" });
  const hydrated = harness.feature.hydrateSnapshot(
    {
      roomId: "room-4x4",
      phase: "playing",
      currentRound: {
        roundId: "r1",
        startsAt: 100,
        endsAt: 1000,
        status: "running",
      },
      player: { capabilities: { canSubmit: true, canVote: false } },
    },
    { entryKind: "resume" }
  );

  assert.equal(hydrated.accepted, true);
  assert.notEqual(hydrated.state.sessionId, first.state.sessionId);
  assert.equal(hydrated.state.entryKind, "resume");
  assert.equal(hydrated.state.phase, "playing");
  assert.equal(hydrated.state.roundId, "r1");
  assert.equal(hydrated.state.capabilities.canSubmit, true);
  harness.release();
});

test("opening a new round disposes resources owned by the previous generation", () => {
  const harness = createHarness("live");
  let disposed = 0;
  const first = harness.feature.startRound({ roomId: "room-4x4", roundId: "r1" });
  harness.feature.registerResource(() => {
    disposed += 1;
  }, first.state.sessionId);

  harness.feature.startRound({ roomId: "room-4x4", roundId: "r2" });

  assert.equal(disposed, 1);
  assert.equal(harness.feature.store.getState().roundId, "r2");
  harness.release();
});

test("a preparation snapshot is not mislabeled as results", () => {
  const harness = createHarness("live");

  const hydrated = harness.feature.hydrateSnapshot({
    roomId: "room-4x4",
    phase: "preparing",
    roundPreparing: { roundNumber: 4 },
  });

  assert.equal(hydrated.accepted, true);
  assert.equal(hydrated.state.phase, "preparing");
  assert.equal(hydrated.state.roundId, null);
  assert.equal(
    harness.feature.acceptsEvent({
      origin: "live",
      roomId: "room-4x4",
      roundId: "obsolete-round",
    }),
    false
  );
  harness.release();
});

test("capabilities can only change inside their owning live session", () => {
  const harness = createHarness("live");
  harness.feature.startRound({ roomId: "room-4x4", roundId: "r1" });

  assert.equal(
    harness.feature.updateCapabilities(
      { canPropose: false, canVote: true },
      { origin: "live", roomId: "room-4x4", roundId: "r1" }
    ).accepted,
    true
  );
  assert.equal(harness.feature.store.getState().capabilities.canVote, true);
  assert.equal(
    harness.feature.updateCapabilities(
      { canVote: false },
      { origin: "live", roomId: "room-4x4", roundId: "obsolete" }
    ).accepted,
    false
  );
  assert.equal(harness.feature.store.getState().capabilities.canVote, true);
  harness.release();
});
