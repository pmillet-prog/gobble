import test from "node:test";
import assert from "node:assert/strict";
import { INITIAL_MOBILE_ROUND_BACKDROP, resolveMobileRoundBackdrop } from "./mobileRoundBackdrop.js";

function scenario() {
  let state = INITIAL_MOBILE_ROUND_BACKDROP;
  let input = {
    enabled: true,
    phase: "results",
    roundId: "round-1",
    introStage: "idle",
    hideTiles: false,
    outroActive: false,
    preparationPending: false,
  };
  return (patch = {}) => {
    input = { ...input, ...patch };
    state = resolveMobileRoundBackdrop(state, input);
    return state;
  };
}

test("one continuous black backdrop bridges results, a pending playing scene and the intro", () => {
  const step = scenario();
  assert.equal(step().opacity, 0);
  const outgoing = step({ outroActive: true });
  assert.equal(outgoing.opacity, 1);
  assert.equal(outgoing.durationMs, 300);
  const handoff = step({ phase: "playing", roundId: "round-2", hideTiles: true });
  assert.equal(handoff.opacity, 1);
  assert.equal(step({ outroActive: false }).opacity, 1);
  const reveal = step({ introStage: "intro_fade_in" });
  assert.equal(reveal.opacity, 0);
  assert.equal(reveal.durationMs, 220);
  assert.equal(step({ introStage: "title" }).opacity, 0);
  assert.equal(step({ introStage: "countdown", hideTiles: false }).opacity, 0);
  assert.equal(step({ introStage: "idle" }).opacity, 0);
  assert.equal(step({ phase: "results", outroActive: false }).opacity, 0);
  assert.equal(step({ outroActive: true }).opacity, 1);
});

test("delayed preparation reveals results once and does not pulse black again at intro start", () => {
  const step = scenario();
  step({ outroActive: true });
  assert.equal(step({ preparationPending: true }).opacity, 0);
  assert.equal(step({ preparationPending: false }).opacity, 0);
  assert.equal(step({ outroActive: false }).opacity, 0);
  assert.equal(step({ outroActive: true }).opacity, 0);
  assert.equal(step({ phase: "playing", roundId: "round-2", hideTiles: true }).opacity, 0);
  assert.equal(step({ introStage: "intro_fade_in" }).opacity, 0);
});

test("joining an intro from the lobby starts covered but a running round stays visible", () => {
  const step = scenario();
  step({ phase: "lobby" });
  const incoming = step({ phase: "playing", hideTiles: true });
  assert.equal(incoming.opacity, 1);
  assert.equal(incoming.durationMs, 0);
  assert.equal(step({ introStage: "intro_fade_in" }).opacity, 0);
  assert.equal(step({ introStage: "idle", hideTiles: false }).opacity, 0);
});

test("desktop and leaving the game clear the backdrop without consuming the next mobile transition", () => {
  const step = scenario();
  step({ outroActive: true });
  assert.deepEqual(step({ enabled: false }), INITIAL_MOBILE_ROUND_BACKDROP);
  assert.equal(step({ enabled: true, roundId: "round-2" }).opacity, 1);
  assert.equal(step({ phase: "lobby" }).opacity, 0);
});
