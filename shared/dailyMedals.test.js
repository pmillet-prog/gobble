import test from "node:test";
import assert from "node:assert/strict";
import { getMedalPins, getMedalDateId, getMedalResetAt, summarizeDailyMedals } from "./dailyMedals.js";

test("up to three medals remain individual, including three golds", () => {
  assert.deepEqual(getMedalPins(null), []);
  assert.deepEqual(getMedalPins({ gold: 3 }), Array(3).fill({ color: "gold", count: 1 }));
  assert.deepEqual(getMedalPins({ gold: 1, silver: 2 }), [
    { color: "gold", count: 1 }, { color: "silver", count: 1 }, { color: "silver", count: 1 },
  ]);
  assert.deepEqual(getMedalPins({ bronze: 1 }), [{ color: "bronze", count: 1 }]);
});

test("four or more medals group by colour rather than by placement", () => {
  assert.deepEqual(getMedalPins({ gold: 4 }), [{ color: "gold", count: 4 }]);
  assert.deepEqual(getMedalPins({ gold: 2, silver: 1, bronze: 1 }), [
    { color: "gold", count: 2 }, { color: "silver", count: 1 }, { color: "bronze", count: 1 },
  ]);
  assert.deepEqual(getMedalPins({ gold: 9999, silver: -3, bronze: NaN }), [{ color: "gold", count: 9999 }]);
});

test("daily medals aggregate the authenticated identity across rooms and ignore expired or nickname entries", () => {
  const now = Date.parse("2026-09-19T18:00:00Z"), midnight = Date.parse("2026-09-19T22:00:00Z");
  const state = { lastResetDateId: "2026-09-19", rooms: {
    classic: { medals: { "install:42": { gold: 2 }, "nick:Tigre": { gold: 99 }, "install:43": { silver: 9 } }, expiry: { "install:42": midnight } },
    expert: { medals: { "install:42": { silver: 1, bronze: 2 } }, expiry: { "install:42": midnight } },
    expired: { medals: { "install:42": { gold: 50 } }, expiry: { "install:42": now - 1 } },
  } };
  assert.deepEqual(summarizeDailyMedals(state, 42, now), { gold: 2, silver: 1, bronze: 2, dateId: "2026-09-19", expiresAt: midnight });
  assert.equal(summarizeDailyMedals(state, 42, midnight).gold, 0);
  assert.equal(summarizeDailyMedals(state, null, now).gold, 0);
});

test("midnight follows Paris across summer and winter time, including DST transitions", () => {
  for (const [now, dateId, reset] of [
    ["2026-09-19T21:59:59Z", "2026-09-19", "2026-09-19T22:00:00Z"],
    ["2026-09-19T22:00:00Z", "2026-09-20", "2026-09-20T22:00:00Z"],
    ["2026-03-28T23:00:00Z", "2026-03-29", "2026-03-29T22:00:00Z"],
    ["2026-10-24T22:00:00Z", "2026-10-25", "2026-10-25T23:00:00Z"],
  ]) {
    assert.equal(getMedalDateId(Date.parse(now)), dateId);
    assert.equal(new Date(getMedalResetAt(Date.parse(now))).toISOString(), new Date(reset).toISOString());
  }
});
