import test from "node:test";
import assert from "node:assert/strict";
import { buildInfortunePlateaus, selectInfortunePlateau } from "../../shared/infortunePlateaus.js";
import { snapshotInfortunePlayers, finalizeInfortunePlateaus } from "./roundPlateaus.js";
import { PRESENTER_IDENTITIES } from "../../shared/presenterIdentities.js";

const players = count => Array.from({ length: count }, (_, i) => ({ userId: i + 1, installId: String(i + 1), nick: `Joueur ${i + 1}`, connected: true }));
const build = (people, ranking = people, roundId = "r1") => buildInfortunePlateaus({ roomId: "room", roundId, players: people, ranking, random: () => .37 });

test("zero to sixty humans get reciprocal trios, only the missing places become named presenters", () => {
  for (let count = 0; count <= 60; count++) {
    const people = players(count), groups = build(people), members = groups.flatMap(group => group.members);
    assert.equal(groups.length, Math.ceil(count / 3));
    assert.equal(new Set(members.filter(player => !player.isBot).map(player => player.id)).size, count);
    assert.equal(members.filter(player => player.isBot).length, groups.length * 3 - count);
    for (const group of groups) {
      assert.equal(group.members.length, 3);
      const bots = group.members.filter(player => player.isBot);
      assert.equal(new Set(bots.map(player => player.presenterKey)).size, bots.length);
      for (const bot of bots) assert.equal(bot.nick, PRESENTER_IDENTITIES[bot.presenterKey].nick);
      for (const self of group.members.filter(player => !player.isBot)) {
        const plate = selectInfortunePlateau(groups, self);
        assert.equal(plate.opponents.length, 2);
        assert.equal(plate.id, group.id);
        for (const other of plate.opponents.filter(player => !player.isBot)) {
          const peer = selectInfortunePlateau(groups, other);
          assert.equal(peer.id, plate.id);
          assert.ok(peer.opponents.some(player => player.id === self.id));
          assert.deepEqual(new Set(peer.members.map(p => p.id)), new Set(plate.members.map(p => p.id)));
        }
      }
    }
    if (count >= 2) assert.ok(groups.every(group => group.members.filter(player => !player.isBot).length >= 2));
  }
});

test("complete groups mix the top, middle and bottom of the current human ranking", () => {
  const people = players(12), ranking = [...people].reverse();
  for (const group of build(people, ranking)) {
    assert.deepEqual(group.members.map(player => Math.floor((player.rank - 1) / 4)).sort(), [0, 1, 2]);
  }
});

test("departed players, ordinary bots and duplicate connections are excluded; identity wins over nicknames", () => {
  const people = players(4);
  people[1].connected = false; people[2].isBot = true;
  const groups = build([...people, { ...people[0], nick: "Second onglet" }]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].members.filter(player => !player.isBot).map(player => player.userId).sort(), [1, 4]);
  assert.equal(selectInfortunePlateau(groups, { userId: 99, nick: "Joueur 1" }), null);
  assert.ok(selectInfortunePlateau(groups, { userId: 1, nick: "Nouveau pseudo" }));
  const guest = { installId: "guest-1", nick: "Invité" };
  assert.ok(selectInfortunePlateau(build([guest]), { nick: "Invité" }));
});

test("the cutoff and frozen round survive arrivals/departures, the next round uses fresh membership and ranks", () => {
  const people = players(3), room = { players: new Map(people.map(player => [player.userId, player])) };
  const snapshot = snapshotInfortunePlayers(room, { isBot: p => p.isBot, isConnected: p => p.connected !== false });
  people[0].nick = "Changed"; people[1].connected = false; room.players.set(4, players(4)[3]);
  const round = { id: "r1" }, policy = { enabled: true, plateauVersion: 1 };
  const first = finalizeInfortunePlateaus({ round, roomId: "room", infortune: policy, players: snapshot, ranking: snapshot, now: () => 9000, random: () => .37 });
  assert.equal(first.openedAt, 9000);
  assert.equal(first.groups.flatMap(group => group.members).find(p => p.userId === 1).nick, "Joueur 1");
  assert.ok(first.groups.flatMap(group => group.members).some(p => p.userId === 2));
  assert.equal(finalizeInfortunePlateaus({ round, infortune: {}, players: [], ranking: [] }), first);
  const next = snapshotInfortunePlayers(room, { isBot: p => p.isBot, isConnected: p => p.connected !== false });
  const second = build(next, [...next].reverse(), "r2");
  assert.equal(selectInfortunePlateau(second, { userId: 2 }), null);
  assert.ok(selectInfortunePlateau(second, { userId: 4 }));
  assert.ok(Object.isFrozen(first.groups[0].members[0]));
});
