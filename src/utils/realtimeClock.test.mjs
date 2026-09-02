import assert from "node:assert/strict";
import test from "node:test";

import {
  createMonotonicDeadline,
  createResilientMonotonicClock,
  createServerClockState,
  getDeadlineRemainingSeconds,
  getDelayUntilDeadlineWindow,
  getNextDeadlineTickDelay,
  readServerClockMs,
  updateServerClockFromSample,
} from "./realtimeClock.js";

test("keeps advancing while the browser monotonic clock is suspended", () => {
  let monotonicNowMs = 1_000;
  let wallClockNowMs = 50_000;
  const readNowMs = createResilientMonotonicClock({
    readMonotonicMs: () => monotonicNowMs,
    readWallClockMs: () => wallClockNowMs,
  });

  assert.equal(readNowMs(), 1_000);
  monotonicNowMs = 1_500;
  wallClockNowMs = 50_500;
  assert.equal(readNowMs(), 1_500);

  wallClockNowMs = 55_500;
  assert.equal(readNowMs(), 6_500);

  wallClockNowMs = 54_000;
  assert.equal(readNowMs(), 6_500);
});

test("keeps server time on a monotonic local clock", () => {
  const clock = createServerClockState({
    monotonicNowMs: 2_000,
    serverNowMs: 100_000,
    synchronized: true,
  });

  assert.equal(readServerClockMs(clock, 2_750), 100_750);
});

test("smooths small clock corrections and snaps large ones", () => {
  const clock = createServerClockState({
    monotonicNowMs: 1_000,
    serverNowMs: 50_000,
    synchronized: true,
  });
  const smoothed = updateServerClockFromSample(clock, {
    monotonicNowMs: 2_000,
    sampledServerNowMs: 51_200,
  });
  assert.equal(readServerClockMs(smoothed, 2_000), 51_050);

  const snapped = updateServerClockFromSample(smoothed, {
    monotonicNowMs: 3_000,
    sampledServerNowMs: 60_000,
  });
  assert.equal(readServerClockMs(snapped, 3_000), 60_000);
});

test("derives countdown seconds from an immutable monotonic deadline", () => {
  const deadline = createMonotonicDeadline({
    deadlineServerMs: 105_000,
    monotonicNowMs: 10_000,
    serverNowMs: 100_000,
  });

  assert.equal(deadline, 15_000);
  assert.equal(
    getDeadlineRemainingSeconds({ deadlineMonotonicMs: deadline, monotonicNowMs: 11_001 }),
    4
  );
  assert.equal(
    getDeadlineRemainingSeconds({ deadlineMonotonicMs: deadline, monotonicNowMs: 13_200 }),
    2
  );
  assert.equal(
    getDeadlineRemainingSeconds({ deadlineMonotonicMs: deadline, monotonicNowMs: 15_000 }),
    0
  );

  const correctedClock = updateServerClockFromSample(
    createServerClockState({
      monotonicNowMs: 10_000,
      serverNowMs: 100_000,
      synchronized: true,
    }),
    {
      force: true,
      monotonicNowMs: 11_000,
      sampledServerNowMs: 103_000,
    }
  );
  assert.equal(readServerClockMs(correctedClock, 11_000), 103_000);
  assert.equal(
    getDeadlineRemainingSeconds({ deadlineMonotonicMs: deadline, monotonicNowMs: 11_000 }),
    4
  );
});

test("treats a missing deadline as inactive", () => {
  assert.equal(getDeadlineRemainingSeconds({ deadlineMonotonicMs: null }), 0);
  assert.equal(getNextDeadlineTickDelay({ deadlineMonotonicMs: null, displayedSeconds: 3 }), 0);
});

test("schedules the next update on the next visible second boundary", () => {
  assert.equal(
    getNextDeadlineTickDelay({
      deadlineMonotonicMs: 15_000,
      displayedSeconds: 4,
      monotonicNowMs: 11_800,
    }),
    212
  );
  assert.equal(
    getNextDeadlineTickDelay({
      deadlineMonotonicMs: 137_800,
      displayedSeconds: 120,
      monotonicNowMs: 10_000,
    }),
    8_812
  );
});

test("waits to reveal a capped countdown until its exact display window", () => {
  assert.equal(
    getDelayUntilDeadlineWindow({
      deadlineMonotonicMs: 15_000,
      monotonicNowMs: 11_200,
      windowMs: 3_000,
    }),
    812
  );
  assert.equal(
    getDelayUntilDeadlineWindow({
      deadlineMonotonicMs: 15_000,
      monotonicNowMs: 12_012,
      windowMs: 3_000,
    }),
    0
  );
});
