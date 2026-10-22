import test from "node:test";
import assert from "node:assert/strict";
import { resolveTournamentFinaleGate } from "./tournamentFinaleGate.js";

test("returning to a tab uses the original server deadline, including an already visible finale", () => {
  const initial = resolveTournamentFinaleGate(null, { key: "t:1", summaryAt: 20000, now: 1000, delayMs: 20000 });
  const resumed = resolveTournamentFinaleGate(initial, { key: "t:1", summaryAt: 20000, now: 25000, delayMs: 20000 });
  assert.equal(resumed.at, 20000);
  assert.ok(resumed.at < 25000);
});
test("legacy snapshots retain their initial delay while the next tournament gets a new one", () => {
  const initial = resolveTournamentFinaleGate(null, { key: "t:1", now: 1000, delayMs: 20000 });
  assert.equal(resolveTournamentFinaleGate(initial, { key: "t:1", now: 25000, delayMs: 20000 }), initial);
  assert.equal(resolveTournamentFinaleGate(initial, { key: "t:2", now: 40000, delayMs: 20000 }).at, 60000);
});
