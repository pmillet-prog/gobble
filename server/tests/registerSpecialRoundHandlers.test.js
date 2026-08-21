import assert from "node:assert/strict";
import test from "node:test";

import { registerSpecialRoundHandlers } from "../realtime/registerSpecialRoundHandlers.js";

class FakeSocket {
  constructor() {
    this.id = "socket-1";
    this.roomId = "room-1";
    this.handlers = new Map();
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  receive(event, ...args) {
    return this.handlers.get(event)?.(...args);
  }
}

function createHarness(player = { nick: "Tigre" }) {
  const socket = new FakeSocket();
  const room = { id: "room-1", players: new Map() };
  if (player) room.players.set(socket.id, player);
  const calls = [];
  const handler = (kind) => (_room, payload) => {
    calls.push([kind, payload]);
    return { ok: true, kind };
  };
  registerSpecialRoundHandlers(socket, {
    clearOcidProposalForNick: handler("clear"),
    getRoom: () => room,
    isStandaloneTrainingPlayer: (entry) => entry?.standalone === true,
    markSocketPlayerActivity: (_room, _socket, kind) => calls.push(["activity", kind]),
    submitOcidProposalForNick: handler("propose"),
    submitOcidVoteForNick: handler("vote"),
    updateSpecial3WordsState: handler("special3"),
  });
  return { calls, socket };
}

test("route les événements de manches spéciales avec le pseudo authentifié", () => {
  const { calls, socket } = createHarness();
  const responses = [];
  const callback = (value) => responses.push(value);

  socket.receive(
    "special3Words:update",
    { roundId: "r1", wordSlots: ["mot"], specialPlacements: [2] },
    callback
  );
  socket.receive(
    "ocid:propose",
    { roundId: "r1", word: "idée", path: [1, 2] },
    callback
  );
  socket.receive("ocid:clearProposal", { roundId: "r1" }, callback);
  socket.receive("ocid:vote", { roundId: "r1", optionId: "option-2" }, callback);

  assert.deepEqual(calls, [
    ["activity", "special3"],
    [
      "special3",
      { roundId: "r1", nick: "Tigre", wordSlots: ["mot"], specialPlacements: [2] },
    ],
    ["activity", "ocid_propose"],
    ["propose", { roundId: "r1", nick: "Tigre", word: "idée", path: [1, 2] }],
    ["activity", "ocid_clear"],
    ["clear", { roundId: "r1", nick: "Tigre" }],
    ["activity", "ocid_vote"],
    ["vote", { roundId: "r1", nick: "Tigre", optionId: "option-2" }],
  ]);
  assert.deepEqual(responses, [
    { ok: true, kind: "special3" },
    { ok: true, kind: "propose" },
    { ok: true, kind: "clear" },
    { ok: true, kind: "vote" },
  ]);
});

test("refuse les événements spéciaux sans joueur connecté", () => {
  const { calls, socket } = createHarness(null);
  let response;
  socket.receive("ocid:vote", { roundId: "r1" }, (value) => {
    response = value;
  });
  assert.deepEqual(response, { ok: false, error: "not_logged_in" });
  assert.deepEqual(calls, []);
});

test("préserve l'interdiction en entraînement autonome", () => {
  const { calls, socket } = createHarness({ nick: "Test", standalone: true });
  let response;
  socket.receive("special3Words:update", { roundId: "r1" }, (value) => {
    response = value;
  });
  assert.deepEqual(response, { ok: false, error: "standalone_training" });
  assert.deepEqual(calls, []);
});
