import test from "node:test";
import assert from "node:assert/strict";
import { createTournamentWheelFinale } from "./tournamentFinale.js";
import { createInfortuneLedger } from "./roundEconomy.js";
import { registerInfortuneHandlers } from "./registerInfortuneHandlers.js";

const puzzle = { id: "p1", category: "Orientation", kind: "riddle", clue: "Mon aiguille ne coud rien, elle indique le nord.", answer: "boussole" };
const ranking = [
  { userId: 1, installId: "1", nick: "Alice", points: 30, basePoints: 30, gobbles: 0, roundScoreSum: 100, pos: 1 },
  { userId: 2, installId: "2", nick: "Bob", points: 20, basePoints: 19, gobbles: 1, roundScoreSum: 90, pos: 2 },
  { userId: 3, installId: "3", nick: "Chloé", points: 10, basePoints: 10, gobbles: 0, roundScoreSum: 80, pos: 3 },
];
function harness() {
  let clock = 1000, id = 0;
  const tasks = new Map(), updates = [], wins = [], finished = [];
  const timers = { setTimeout(fn, ms) { const key = ++id; tasks.set(key, { fn, at: clock + ms }); return key; }, clearTimeout(key) { tasks.delete(key); } };
  const ledger = createInfortuneLedger(); for (const entry of ranking) ledger.banks.set(`user:${entry.userId}`, 1200);
  const game = createTournamentWheelFinale({ roomId: "room", tournamentId: "t1", startsAt: 41_000, puzzle, ranking, ledger,
    timers, now: () => clock, onChange: update => updates.push(update), onWin: (...value) => wins.push(value), onFinish: value => finished.push(value) });
  const at = value => {
    clock = value;
    for (const [key, task] of [...tasks]) if (task.at <= clock) { tasks.delete(key); task.fn(); }
  };
  return { game, at, tasks, updates, wins, finished, ledger };
}

test("finale starts after round results, lasts 120 seconds and hides the answer and purchases of other players", () => {
  const h = harness(), before = h.game.snapshot("user:1");
  assert.equal(before.finale.deadlineAt - before.finale.startsAt, 120_000);
  assert.equal(h.game.submit("user:1", { type: "buy", letter: "E" }).error, "not_started");
  assert.equal(before.snapshot.tiles.filter(t => t.kind === "letter").every(t => t.character === null), true);
  assert.ok(!JSON.stringify(before).includes("boussole"));
  assert.ok(!JSON.stringify(before).includes(puzzle.clue));
  h.at(41_000);
  const bought = h.game.submit("user:1", { type: "buy", letter: "E" });
  assert.equal(bought.snapshot.bank, 1050); assert.ok(bought.indices.length > 0);
  assert.equal(h.game.submit("user:1", { type: "buy", letter: "E" }).snapshot.bank, 1050);
  assert.equal(h.game.snapshot("user:2").snapshot.bank, 1200);
  assert.equal(h.game.snapshot("guest:unknown").snapshot, null);
  assert.ok(!JSON.stringify(h.game.publicSnapshot()).includes("tiles"));
  assert.deepEqual(h.game.snapshot("user:1").snapshot.purchased, ["E"], "refresh preserves the private session");
  h.game.dispose(); assert.equal(h.tasks.size, 0);
});

test("each success adds exactly 10 points and later successes reorder the provisional standings", () => {
  const h = harness(); h.at(41_000);
  const bob = h.game.submit("user:2", { type: "answer", answer: "boussole" });
  assert.equal(bob.snapshot.outcome.points, 10); assert.equal(bob.snapshot.outcome.gobblars, 120);
  assert.equal(bob.snapshot.outcome.clue, puzzle.clue);
  assert.equal(h.game.snapshot("user:2").snapshot.outcome.clue, puzzle.clue, "reconnecting keeps the completed question");
  assert.ok(!JSON.stringify(bob.finale).includes(puzzle.clue), "other players cannot read the question before closing");
  assert.deepEqual(bob.finale.ranking.map(p => [p.nick, p.points]), [["Bob", 30], ["Alice", 30], ["Chloé", 10]]);
  h.game.submit("user:2", { type: "answer", answer: "boussole" });
  assert.equal(h.wins.length, 1);
  assert.equal(h.finished.length, 0, "no medals or podium before the deadline");
  h.at(100_000);
  h.game.submit("user:1", { type: "answer", answer: "boussole" });
  assert.equal(h.updates.at(-1).ranking[0].nick, "Alice");
  assert.equal(h.updates.at(-1).ranking[0].points, 40);
  assert.equal(h.updates.at(-1).closed, false);
  h.at(161_000); assert.equal(h.finished.length, 1);
  assert.equal(h.game.submit("user:2", { type: "answer", answer: "boussole" }).snapshot.outcome.correct, true,
    "a lost success acknowledgement can be recovered after the deadline");
  assert.equal(h.finished[0].closed, true); assert.equal(h.finished[0].podiumAt, 176_000);
  assert.equal(h.game.snapshot("user:3").snapshot.outcome.expired, true);
  assert.equal(h.game.snapshot("user:3").snapshot.outcome.clue, puzzle.clue);
  assert.equal(h.game.snapshot("guest:unknown").finale.clue, puzzle.clue, "spectators can review the question after closing");
  assert.equal(h.game.submit("user:3", { type: "answer", answer: "boussole" }).error, "expired");
  h.game.finish(); h.game.snapshot("user:1"); assert.equal(h.finished.length, 1); assert.equal(h.wins.length, 2);
});

test("a wrong answer uses the single attempt and an expired or forged request cannot change rewards", () => {
  const h = harness(); h.at(41_000);
  h.game.submit("user:1", { type: "answer", answer: "boussole soleil" });
  assert.equal(h.game.snapshot("user:1").snapshot.outcome, null);
  h.game.submit("user:1", { type: "answer", answer: "soleil" });
  assert.equal(h.game.snapshot("user:1").snapshot.outcome.clue, puzzle.clue, "wrong answers also retain the question");
  h.game.submit("user:1", { type: "answer", answer: "boussole" });
  assert.equal(h.wins.length, 0);
  assert.equal(h.game.submit("guest:unknown", { type: "answer", answer: "boussole" }).error, "spectator");
  h.at(161_000); assert.equal(h.game.submit("user:2", { type: "buy", letter: "E" }).error, "expired");
  h.game.dispose(); assert.equal(h.tasks.size, 0);
});

test("finale transport derives identity from the socket and refuses old tournaments, foreign rooms and bots", () => {
  const h = harness(); h.at(41_000);
  const events = {}, socket = { id: "s1", roomId: "room", on(name, fn) { events[name] = fn; } };
  const player = { userId: 1, connected: true };
  const room = { id: "room", players: new Map([["s1", player]]), infortuneFinale: h.game };
  registerInfortuneHandlers(socket, { getRoom: () => room });
  let reply;
  const send = value => events["infortune:finale"]({ roomId: "room", tournamentId: "t1", ...value }, result => { reply = result; });
  send({ type: "answer", userId: 2, answer: "boussole" });
  assert.equal(reply.ok, true); assert.equal(h.wins[0][0].nick, "Alice");
  send({ type: "snapshot", tournamentId: "old" }); assert.equal(reply.ok, false);
  send({ type: "snapshot", roomId: "elsewhere" }); assert.equal(reply.ok, false);
  player.isBot = true; send({ type: "snapshot" }); assert.equal(reply.ok, false);
  h.game.dispose();
});
