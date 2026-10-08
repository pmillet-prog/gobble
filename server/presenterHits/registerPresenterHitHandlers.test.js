import test from "node:test";
import assert from "node:assert/strict";
import { registerPresenterHitHandlers } from "./registerPresenterHitHandlers.js";

function fixture() {
  let handler;
  const records = [];
  const player = { userId: 2, nick: "Paul", connected: true };
  const round = { id: 123, status: "running", special: { type: "target_long" }, targetFoundAt: new Map([["Paul", 10]]) };
  const room = { id: "room-4x4", currentRound: round, players: new Map([["socket-1", player]]) };
  const socket = { id: "socket-1", roomId: room.id, on: (_, callback) => { handler = callback; }, off() {} };
  registerPresenterHitHandlers(socket, { service: { recordHit: value => records.push(value) }, getRoom: () => room,
    getSocketPlayerIdentity: () => ({ userId: 2, installId: "abc" }) });
  const hit = (extra = {}) => handler({ presenterId: "pivot", roundId: 123, streamId: "client-session-123", sequence: 1, ...extra });
  return { hit, records, room, player, round };
}

test("only authenticated live human hits in the current round enter the service", () => {
  const f = fixture();
  f.hit();
  assert.equal(f.records.length, 1);
  assert.equal(f.records[0].playerKey, "user:2");
  for (const patch of [{ training: true }, { id: 124 }, { status: "hidden" }]) {
    f.room.currentRound = { ...f.round, ...patch };
    f.hit();
  }
  f.room.currentRound = f.round;
  f.hit({ devPreview: true });
  f.hit({ presenterId: "human" });
  f.player.standaloneTraining = { sessionId: "practice" };
  f.hit();
  f.player.standaloneTraining = null;
  f.player.isBot = true;
  f.hit();
  f.player.isBot = false;
  f.player.userId = 99;
  f.hit();
  assert.equal(f.records.length, 1);
});

test("FouKro requires target discovery and podium presenter hits can count after the round", () => {
  const f = fixture();
  f.hit({ presenterId: "foucault", surface: "quiz" });
  f.round.targetFoundAt.clear();
  f.hit({ presenterId: "foucault", surface: "quiz" });
  assert.equal(f.records.length, 1);
  f.round.status = "finished";
  f.room.breakState = { breakKind: "tournament_end", tournamentSummary: {
    presenterScopeId: "tournament:123:celebration", ranking: [{ nick: "Julien Lechéper", isBot: true, points: 40 }],
  } };
  f.hit({ presenterId: "lepers", surface: "podium" });
  assert.equal(f.records.length, 2);
  f.hit({ presenterId: "pivot", surface: "podium" });
  assert.equal(f.records.length, 2, "a presenter absent from the podium cannot be reported there");
  f.hit({ presenterId: "bafouille", roundId: "tournament:123:celebration" });
  assert.equal(f.records.length, 3, "tournament commentary uses the actual server celebration scope");
  f.hit({ presenterId: "bafouille", roundId: "tournament:122:celebration" });
  assert.equal(f.records.length, 3, "stale commentary scope is rejected");
});
