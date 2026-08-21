import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFakeDailyHistoryDays,
  getParisDateIdClient,
} from "./dailyHistoryModel.js";

test("Paris day ids follow the application timezone", () => {
  assert.equal(getParisDateIdClient(new Date("2026-01-01T00:30:00Z")), "2026-01-01");
});

test("daily fake history remains opt-in and structurally valid", () => {
  assert.deepEqual(buildFakeDailyHistoryDays("2026-08-21"), []);
  const days = buildFakeDailyHistoryDays("2026-08-21", { enabled: true });
  assert.equal(days.length, 3);
  assert.equal(days[0].entries.length, 12);
  assert.match(days[0].dateId, /^TEST-/);
});
