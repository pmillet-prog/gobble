import test from "node:test";
import assert from "node:assert/strict";
import { registerInfortuneHandlers } from "./registerInfortuneHandlers.js";
import { readPlayerBank } from "./readPlayerBank.js";

test("bank requests use the socket identity and never expose another candidate", () => {
  const handlers = {}, player = { userId: 1, connected: true };
  const room = { id: "room", players: new Map([["socket", player]]),
    tournament: { id: "t1", infortune: { banks: new Map([["user:1", 500], ["user:2", 9999]]) } } };
  registerInfortuneHandlers({ id: "socket", roomId: "room", on(event, fn) { handlers[event] = fn; } }, { getRoom: () => room });
  let reply;
  handlers["infortune:bank"]({ roomId: "room", userId: 2 }, value => { reply = value; });
  assert.deepEqual(reply, { ok: true, roomId: "room", tournamentId: "t1", bank: 500 });
  handlers["infortune:bank"]({ roomId: "other" }, value => { reply = value; });
  assert.equal(reply.ok, false);
  player.connected = false;
  handlers["infortune:bank"]({ roomId: "room" }, value => { reply = value; });
  assert.equal(reply.ok, false);
});
test("the final bank includes purchased letters, even after tournament scoring resets the ledger", () => {
  const room = { id: "room", tournament: { id: "next" }, infortuneFinale: { snapshot(key) {
    assert.equal(key, "user:1"); return { finale: { tournamentId: "previous" }, snapshot: { bank: 350 } };
  } } };
  assert.equal(readPlayerBank(room, { userId: 1 }).bank, 350);
  assert.equal(readPlayerBank(room, { userId: 1 }).tournamentId, "previous");
  room.infortuneFinale = null; assert.equal(readPlayerBank(room, { userId: 1 }).bank, 0);
});
