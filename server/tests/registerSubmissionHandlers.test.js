import assert from "node:assert/strict";
import test from "node:test";

import { registerSubmissionHandlers } from "../realtime/registerSubmissionHandlers.js";

class FakeSocket {
  constructor({ id = "socket-1", roomId = "room-1" } = {}) {
    this.id = id;
    this.roomId = roomId;
    this.handlers = new Map();
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  receive(event, ...args) {
    return this.handlers.get(event)?.(...args);
  }
}

function createHarness({ player = { nick: "Tigre" }, submit } = {}) {
  const socket = new FakeSocket();
  const room = { id: "room-1", players: new Map() };
  if (player) room.players.set(socket.id, player);
  const calls = {
    activity: [],
    announcements: 0,
    broadcasts: 0,
    counters: [],
    submissions: [],
    warnings: [],
  };
  const times = [1000, 1200];
  registerSubmissionHandlers(socket, {
    broadcastProvisionalRanking: () => {
      calls.broadcasts += 1;
    },
    bumpRoomPerfCounter: (...args) => calls.counters.push(args),
    getRoom: (roomId) => (roomId === room.id ? room : null),
    isStandaloneTrainingPlayer: (entry) => entry?.standalone === true,
    logger: { warn: (message) => calls.warnings.push(message) },
    markSocketPlayerActivity: (...args) => calls.activity.push(args),
    maybeAnnounceCloseFight: () => {
      calls.announcements += 1;
    },
    normalizeWord: (word) => String(word || "").trim().toUpperCase(),
    now: () => times.shift() ?? 1200,
    perfSubmitBatchWarnMs: 140,
    submitWordForNick: (targetRoom, payload) => {
      calls.submissions.push([targetRoom, payload]);
      return submit?.(payload) ?? { ok: true, points: 3, totalScore: 12 };
    },
  });
  return { calls, room, socket };
}

test("refuse les soumissions hors session avec les réponses historiques", () => {
  const { socket } = createHarness({ player: null });
  let singleResponse;
  let batchResponse;
  socket.receive("submitWord", { roundId: "r1", word: "mot" }, (value) => {
    singleResponse = value;
  });
  socket.receive(
    "submitWordsBatch",
    { roundId: "r1", clientSeq: 7, items: [{ word: "mot" }] },
    (value) => {
      batchResponse = value;
    }
  );
  assert.deepEqual(singleResponse, { ok: false, error: "not_logged_in" });
  assert.deepEqual(batchResponse, {
    ok: false,
    error: "not_logged_in",
    clientSeq: 7,
    results: [],
  });
});

test("transmet une soumission simple sans modifier son contrat", () => {
  const { calls, room, socket } = createHarness();
  let response;
  socket.receive(
    "submitWord",
    { roundId: "r1", word: "été", path: [1, 2, 3], traceStartedAt: 42 },
    (value) => {
      response = value;
    }
  );
  assert.deepEqual(response, { ok: true, points: 3, totalScore: 12 });
  assert.deepEqual(calls.activity[0], [room, socket, "submit_word"]);
  assert.deepEqual(calls.submissions[0][1], {
    roundId: "r1",
    word: "été",
    path: [1, 2, 3],
    nick: "Tigre",
    traceStartedAt: 42,
  });
});

test("agrège un lot et ne diffuse le classement qu'une fois", () => {
  const { calls, room, socket } = createHarness({
    submit: ({ word }) =>
      word === "refus"
        ? { ok: false, error: "invalid_word" }
        : { ok: true, wordScore: 5, score: 17 },
  });
  let response;
  socket.receive(
    "submitWordsBatch",
    {
      roundId: "r2",
      clientSeq: 9,
      items: [{ word: " été ", path: [0] }, { word: "refus" }, { word: "" }],
    },
    (value) => {
      response = value;
    }
  );

  assert.equal(response.ok, true);
  assert.equal(response.clientSeq, 9);
  assert.deepEqual(response.results, [
    { word: "ÉTÉ", ok: true, wordScore: 5, score: 17, points: 5, totalScore: 17 },
    {
      word: "REFUS",
      ok: false,
      error: "invalid_word",
      points: undefined,
      totalScore: undefined,
    },
    { word: "", ok: false, error: "empty_word" },
  ]);
  assert.equal(calls.submissions.length, 2);
  assert.equal(calls.submissions[0][1].deferRankingBroadcast, true);
  assert.deepEqual(calls.counters, [[room, "batchWords", 1]]);
  assert.equal(calls.announcements, 1);
  assert.equal(calls.broadcasts, 1);
  assert.equal(calls.warnings.length, 1);
});

test("interdit toujours les lots d'entraînement autonome", () => {
  const { calls, socket } = createHarness({ player: { nick: "Test", standalone: true } });
  let response;
  socket.receive(
    "submitWordsBatch",
    { roundId: "r1", items: [{ word: "mot" }] },
    (value) => {
      response = value;
    }
  );
  assert.deepEqual(response, {
    ok: false,
    error: "standalone_training",
    clientSeq: null,
    results: [],
  });
  assert.equal(calls.submissions.length, 0);
});
