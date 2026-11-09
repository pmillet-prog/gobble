import test from "node:test";
import assert from "node:assert/strict";
import { createInfortuneLedger, createInfortuneRoundEconomy, creditInfortuneGobbles } from "./roundEconomy.js";
import { createTournamentWheelFinale } from "./tournamentFinale.js";
import { infortuneRoundPolicy } from "../../shared/infortuneIntermission.js";
import { WHEEL_SECTORS, EXCHANGE_SECTOR_INDICES } from "../../shared/infortuneWheel.js";
import { selectTournamentPodium } from "../../shared/tournamentPodium.js";
import { advanceWheelBreak } from './advanceWheelBreak.js';

test("four inter-round wheels carry their exchanged banks into the 120-second finale and its final podium", () => {
  let now = 1000, finalRanking = null;
  const ledger = createInfortuneLedger();
  const players = [1, 2, 3].map(userId => ({ id: `user:${userId}`, userId, installId: String(userId), nick: `Joueur ${userId}` }));
  const group = { id: "g", members: players };
  const amount500 = WHEEL_SECTORS.findIndex(s => s.amount === 500);
  for (let round = 1; round <= 4; round++) {
    creditInfortuneGobbles(ledger, `r${round}`, players, new Map([[players[0].nick, 1]]));
    const policy = { ...infortuneRoundPolicy({ enabled: true, round, totalRounds: 5 }), openedAt: now, groups: [group] };
    const economy = createInfortuneRoundEconomy({ ledger, groups: [group],
      policy,
      now: () => now, random: () => .5, timers: { setTimeout() { return 1; }, clearTimeout() {} } });
    for (const player of players) {
      economy.submit(player.id, { type: "spin", index: round === 4 ? EXCHANGE_SECTOR_INDICES[0] : amount500 });
      economy.submit(player.id, { type: "presented" });
    }
    if (round === 4) for (let i = 0; i < players.length; i++) economy.submit(players[i].id, { type: "exchange", target: players[(i + 1) % players.length].id });
    assert.deepEqual(economy.snapshot().resolvedGroups, ["g"]);
    assert.equal([...ledger.banks.values()].reduce((a, b) => a + b), Math.min(round, 3) * 1500 + round * 100);
    const closing = advanceWheelBreak({ id: 'room', breakState: { roundId: `r${round}`, infortune: policy } }, `r${round}`, economy.snapshot(), now);
    if (round === 4) {
      assert.equal(closing.wheelClosing, null, 'the fourth wheel ends after exchanges, without another leader walk');
      assert.ok(closing.nextStartAt > now);
    } else {
      assert.deepEqual(closing.wheelClosing.leaders.map(player => player.id), ['user:1']);
      assert.deepEqual(Object.keys(closing.wheelClosing.leaders[0]).sort(), ['id', 'nick', 'userId']);
    }
    economy.dispose(); now += 100_000;
  }
  const before = ledger.banks.get("user:3");
  const finale = createTournamentWheelFinale({ freeLetters: [], roomId: "room", tournamentId: "t", startsAt: now, now: () => now,
    puzzle: { id: "p", category: "Orientation", kind: "riddle", clue: "Mon aiguille indique le nord.", answer: "boussole" }, ledger,
    ranking: players.map((player, i) => ({ ...player, points: 30 - i * 3, basePoints: 30 - i * 3, gobbles: 0, roundScoreSum: 100 - i, pos: i + 1 })),
    onFinish: value => { finalRanking = value.ranking; }, timers: { setTimeout() { return 1; }, clearTimeout() {} } });
  assert.equal(finale.snapshot("user:3").snapshot.bank, before);
  assert.equal(finale.submit("user:3", { type: "buy", letter: "E" }).snapshot.bank, before - 150);
  finale.submit("user:3", { type: "answer", answer: "boussole" });
  assert.equal(finale.publicSnapshot().ranking[0].nick, "Joueur 3");
  assert.equal(finalRanking, null);
  now += 120_000; finale.snapshot("user:1");
  assert.equal(selectTournamentPodium(finalRanking)[0].nick, "Joueur 3");
  assert.equal(finalRanking[0].points, 34, "24 base points plus the 10-point finale victory"); finale.dispose();
});
