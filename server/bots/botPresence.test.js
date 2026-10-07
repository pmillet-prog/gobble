import test from "node:test";
import assert from "node:assert/strict";
import { createBotManager, BOT_ANIMATOR_ROSTER } from "./botManager.js";
import { countLiveHumans, selectPresentAnimators } from "./botPresencePolicy.js";

const strongestFirst = ["Bernard Pinot", "Maître Gobbello", "Julien Lechéper", "Laurent Bafouille", "Laurent Rhum&Co", "Jean-Bière FouKro"];
const humans = count => Array.from({ length: count }, (_, i) => [`human-${i}`, { nick: `Human ${i}`, connected: true }]);
const presentBots = room => Array.from(room.players.values()).filter(p => p.token?.startsWith("bot-")).map(p => p.nick).sort();

function setup(t, count = 1) {
  const room = { id: "room-4x4", config: { gridSize: 4 }, players: new Map(humans(count)),
    submissions: new Map(), medals: new Map(), medalExpiry: new Map(), currentRound: null };
  let manager;
  let playerEmits = 0;
  const roundAdds = [];
  manager = createBotManager({ rooms: new Map([[room.id, room]]), botsEnabled: false,
    animatorBotsEnabled: true, ensurePlayerInRound: (_room, nick) => roundAdds.push(nick),
    emitPlayers: () => { playerEmits++; manager?.refreshAnimatorPresenceForRoom(room, { notifyPlayers: false }); },
    emitMedals: () => {}, broadcastProvisionalRanking: () => {},
  });
  t.after(() => {
    clearInterval(manager.presenceInterval);
    manager.clearTimers(room.id);
    for (const timer of manager.presenceTimers.values()) clearTimeout(timer);
  });
  const setHumans = count => {
    for (const [key, player] of room.players) if (!player.token?.startsWith("bot-")) room.players.delete(key);
    for (const [key, player] of humans(count)) room.players.set(key, player);
  };
  return { room, manager, setHumans, roundAdds, emits: () => playerEmits };
}

test("one human keeps all six animators; each extra human replaces the weakest remaining bot", () => {
  for (let count = 0; count <= 8; count++) {
    const selected = selectPresentAnimators({ humanCount: count, roster: BOT_ANIMATOR_ROSTER });
    assert.deepEqual(selected.map(bot => bot.nick), strongestFirst.slice(0, Math.max(0, 7 - count)));
  }
});

test("only connected live humans count, not bots or standalone trainees", () => {
  const players = new Map([
    ["live", { connected: true }], ["afk", { connected: true, afk: true }],
    ["offline", { connected: false }], ["bot", { token: "bot-Bernard Pinot" }],
    ["training", { connected: true, standaloneTraining: { sessionId: "solo" } }],
    ["training-presence", { connected: true, trainingPresenceOnly: true }],
  ]);
  assert.equal(countLiveHumans(players), 2);
});

test("lobby arrivals and departures reconcile immediately without enabling classic bots", t => {
  const { room, manager, setHumans, emits } = setup(t);
  assert.deepEqual(presentBots(room), [...strongestFirst].sort());
  for (const count of [3, 5, 6, 9, 4, 2, 1]) {
    setHumans(count);
    const before = emits();
    manager.refreshAnimatorPresenceForRoom(room);
    assert.deepEqual(presentBots(room), strongestFirst.slice(0, Math.max(0, 7 - count)).sort());
    assert.ok(emits() - before <= 1, "one player update per reconciliation, without recursive updates");
    assert.equal(manager.botsEnabled, false);
  }
  assert.equal(manager.presenceTimers.size, 0);
});

test("rounds, introductions, votes and results keep their participants until the next round", t => {
  const { room, manager, setHumans, roundAdds } = setup(t);
  setHumans(7);
  const oldScores = new Map(strongestFirst.map(nick => [nick, { score: 100 }]));
  room.submissions.set("old-round", oldScores);
  for (const status of ["intro", "running", "ocid_vote", "finished"]) {
    room.currentRound = { id: "old-round", status };
    manager.refreshPresenceForRoom(room);
    assert.equal(presentBots(room).length, 6, status);
  }
  manager.refreshPresenceForRoom(room, { beforeRound: true });
  assert.equal(presentBots(room).length, 0);
  assert.equal(oldScores.size, 6, "finished scores remain available");
  setHumans(6);
  manager.refreshPresenceForRoom(room, { beforeRound: true });
  assert.deepEqual(presentBots(room), ["Bernard Pinot"]);
  assert.deepEqual(roundAdds, [], "returning bots are not entered into the previous round");
});

test("re-enabling animators obeys the quota and disabling stays effective", t => {
  const { room, manager, setHumans } = setup(t, 6);
  manager.setAnimatorBotsEnabled(false);
  assert.deepEqual(presentBots(room), []);
  manager.refreshAnimatorPresenceForRoom(room);
  assert.deepEqual(presentBots(room), []);
  manager.setAnimatorBotsEnabled(true);
  assert.deepEqual(presentBots(room), ["Bernard Pinot"]);
  setHumans(7);
  manager.setAnimatorBotsEnabled(true);
  assert.deepEqual(presentBots(room), []);
});
