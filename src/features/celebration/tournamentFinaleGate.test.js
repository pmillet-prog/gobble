import test from "node:test";
import assert from "node:assert/strict";
import { resolveTournamentFinaleGate } from "./tournamentFinaleGate.js";
import { getTournamentPodiumEntries } from "./tournamentPodiumModel.js";

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
test("the podium preserves server order, bot identity and the human's actual rank outside the podium", () => {
  const result = getTournamentPodiumEntries([
    { nick: "Bernard Pinot", isBot: true, points: 90 },
    { nick: "Lina", installId: "2", points: 80 },
    { nick: "Oscar", userId: 3, points: 70 },
    { nick: "Moi", points: 60 },
    { nick: "Absent", points: 0 },
  ], { userId: 4, nick: "Moi", knownPlayers: [{ userId: 4, nick: "Moi" }] });
  assert.deepEqual(result.players.map(entry => [entry.nick, entry.rank, entry.userId]), [["Bernard Pinot", 1, null], ["Lina", 2, 2], ["Oscar", 3, 3]]);
  assert.equal(result.self.rank, 4);
  assert.equal(result.self.totalPlayers, 4);
  assert.equal(result.self.userId, 4);
});
