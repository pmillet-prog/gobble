import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createResultsFeature } from "./createResultsFeature.js";

test("results satellite owns preparation and mobile fade timers with exact delays", () => {
  const timers = new Map();
  let nextTimerId = 1;
  const scope = createResourceScope("test:results-timing");
  const feature = createResultsFeature(
    { scope },
    {
      clearTimeoutFn: (id) => timers.delete(id),
      setTimeoutFn: (callback, delayMs) => {
        const id = nextTimerId++;
        timers.set(id, {
          callback: () => {
            timers.delete(id);
            callback();
          },
          delayMs,
        });
        return id;
      },
      wallNow: () => 77,
    }
  );
  feature.start();
  feature.configureTiming({
    breakKind: "round_end",
    fadeDurationMs: 300,
    isMobileLayout: true,
    nextStartAt: 2000,
    nowServerMs: () => 1000,
    phase: "results",
    preparationGraceMs: 150,
  });

  const scheduled = [...timers.values()].sort((left, right) => left.delayMs - right.delayMs);
  assert.deepEqual(
    scheduled.map((timer) => timer.delayMs),
    [700, 1160]
  );
  assert.equal(feature.store.getState().mobileOutroFadeActive, false);
  scheduled[0].callback();
  assert.equal(feature.store.getState().mobileOutroFadeActive, true);
  scheduled[1].callback();
  assert.equal(feature.store.getState().roundStartDelayTick, 77);

  feature.configureTiming({
    breakKind: null,
    fadeDurationMs: 300,
    isMobileLayout: true,
    nextStartAt: null,
    nowServerMs: () => 1000,
    phase: "lobby",
    preparationGraceMs: 150,
  });
  assert.equal(feature.store.getState().mobileOutroFadeActive, false);
  assert.equal(timers.size, 0);
  scope.dispose();
});
