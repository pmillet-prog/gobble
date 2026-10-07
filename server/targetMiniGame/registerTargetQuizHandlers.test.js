import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createTargetQuizSocketHandlers, resolveTargetQuizContext } from "./registerTargetQuizHandlers.js";

function fixture(overrides = {}) {
  let now = 10_000;
  const socket = new EventEmitter();
  Object.assign(socket, { id: "socket-1", roomId: "live", connected: true });
  const player = { userId: 7, nick: "Paul", connected: true };
  const round = { id: 42, endsAt: 150_000, status: "running", special: { type: "target_long" }, targetFoundAt: new Map([["Paul", 100]]) };
  const room = { id: "live", currentRound: round, players: new Map([[socket.id, player]]) };
  const calls = [];
  let token = "token-a";
  const dependencies = {
    getRoom: id => id === room.id ? room : null,
    getSocketPlayerIdentity: () => ({ userId: 7, installId: "account-7" }),
    areDevToolsAllowedForSocket: () => false,
    now: () => now,
    ...overrides,
  };
  const service = {
    async start(args) { calls.push(["start", args]); return { ok: true, roundId: args.roundId, question: { questionToken: token } }; },
    async shown(args) { calls.push(["shown", args]); return { ok: true }; },
    async answer(args) { calls.push(["answer", args]); return { ok: true }; },
    async stop(args) { calls.push(["stop", args]); return { ok: true }; },
    async closeRound(id) { calls.push(["close", id]); },
  };
  const handlers = createTargetQuizSocketHandlers({ service, ...dependencies });
  handlers.register(socket);
  const request = (event, payload = { roundId: 42 }) => new Promise(resolve => socket.emit(event, payload, resolve));
  return { socket, player, round, room, calls, dependencies, service, handlers, request,
    setNow: value => { now = value; }, setToken: value => { token = value; } };
}

test("only a solved live target enables normal quiz; identity and deadline are server-derived", async () => {
  const f = fixture();
  const response = await f.request("targetQuiz:start", { roundId: 42, playerKey: "user:99", endsAt: 999999 });
  assert.equal(response.roundId, 42);
  assert.equal(f.calls[0][1].playerKey, "user:7");
  assert.equal(f.calls[0][1].roundId, "live#42");
  assert.equal(f.calls[0][1].endsAt, f.round.endsAt);
  await f.request("targetQuiz:answer", { roundId: 42, questionToken: "token-a", choiceIndex: 2 });
  assert.equal(f.calls.at(-1)[1].choiceIndex, 2);
});

test("training is excluded before ordinary and dev entry, even with a solved target", async () => {
  for (const standalone of [false, true]) for (const devPreview of [false, true]) {
    const f = fixture({ areDevToolsAllowedForSocket: () => true });
    if (standalone) f.player.standaloneTraining = { sessionId: "training" };
    else f.round.training = true;
    const result = await f.request("targetQuiz:start", { roundId: 42, devPreview });
    assert.equal(result.error, "training_disabled");
    assert.equal(f.calls.length, 0);
  }
});

test("five-second entry limit uses the target discovery time and allows an existing game to finish", async () => {
  for (const type of ["target_long", "target_score"]) {
    for (const remaining of [0, 4999, 5000, 5001]) {
      const f = fixture();
      f.round.special.type = type;
      f.round.targetFoundAt.set("Paul", f.round.endsAt - remaining);
      f.setNow(f.round.endsAt - 1);
      const result = await f.request("targetQuiz:start");
      assert.equal(result.ok, remaining > 5000);
      if (remaining <= 5000) assert.equal(result.error, "target_found_too_late");
      else assert.equal((await f.request("targetQuiz:answer", { roundId: 42, questionToken: "token-a", choiceIndex: 2 })).ok, true);
    }
  }
});

test("unsolved, wrong round kind, old round, expired and unauthenticated requests cannot start", async () => {
  const cases = [
    [f => f.round.targetFoundAt.clear(), "target_not_found"],
    [f => { f.round.special.type = "normal"; }, "not_target_round"],
    [f => { f.round.id = 43; }, "stale_round"],
    [f => { f.round.status = "finished"; }, "round_finished"],
    [f => f.setNow(f.round.endsAt), "round_finished"],
    [f => { f.player.userId = 8; }, "not_logged_in"],
  ];
  for (const [change, error] of cases) {
    const f = fixture(); change(f);
    assert.equal((await f.request("targetQuiz:start")).error, error);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture({ getSocketPlayerIdentity: () => null });
  assert.equal((await f.request("targetQuiz:start")).error, "auth_required");
});

test("dev entry requires server account authorization and uses separate progress and bounded duration", async () => {
  const denied = fixture();
  assert.equal((await denied.request("targetQuiz:start", { roundId: 42, devPreview: true })).error, "account_not_allowed");
  const f = fixture({ areDevToolsAllowedForSocket: () => true });
  f.round.special.type = "normal";
  f.round.targetFoundAt.clear();
  await f.request("targetQuiz:start", { roundId: 42, devPreview: true });
  assert.equal(f.calls[0][1].playerKey, "dev:user:7");
  assert.equal(f.calls[0][1].endsAt, 100_000);
  assert.equal(f.calls[0][1].roundEndsAt, 150_000);
});

test("eligibility is checked again after asynchronous question loading", async () => {
  const f = fixture();
  let resolveStart;
  f.service.start = () => new Promise(resolve => { resolveStart = resolve; });
  const result = f.request("targetQuiz:start");
  await new Promise(resolve => setImmediate(resolve));
  f.player.standaloneTraining = { sessionId: "solo" };
  resolveStart({ ok: true, question: { questionToken: "token-a" } });
  assert.equal((await result).error, "training_disabled");
  assert.equal(f.calls.at(-1)[0], "stop");
});

test("training switch blocks answers, while stopping still releases the pending live question", async () => {
  const f = fixture();
  await f.request("targetQuiz:start");
  f.player.standaloneTraining = { sessionId: "solo" };
  assert.equal((await f.request("targetQuiz:answer", { roundId: 42, questionToken: "token-a", choiceIndex: 0 })).error, "training_disabled");
  assert.equal((await f.request("targetQuiz:stop", { roundId: 42, questionToken: "token-a" })).ok, true);
  assert.equal(f.calls.at(-1)[0], "stop");
  assert.equal(f.calls.filter(([method]) => method === "answer").length, 0);
});

test("old stop tokens cannot interrupt a successor; disconnect releases only owned session", async () => {
  const f = fixture();
  await f.request("targetQuiz:start");
  f.setToken("token-b");
  await f.request("targetQuiz:start");
  await f.request("targetQuiz:stop", { roundId: 42, questionToken: "token-a" });
  assert.equal(f.calls.filter(([method]) => method === "stop").length, 0);
  f.socket.emit("disconnect");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.at(-1)[0], "stop");
});

test("round close is scoped to its room even with identical numeric round IDs", async () => {
  const f = fixture();
  await f.handlers.closeRoomRound("live", 42);
  assert.deepEqual(f.calls.at(-1), ["close", "live#42"]);
  assert.equal(resolveTargetQuizContext(f.socket, { roundId: 42 }, f.dependencies).playerKey, "user:7");
});

for (const nextShown of [false, true]) {
  test(`a delayed feedback stop ${nextShown ? "is stale after" : "remains valid before"} the following question is shown`, async () => {
    const f = fixture();
    await f.request("targetQuiz:start");
    f.service.answer = async () => ({
      ok: true,
      question: { questionToken: "token-a" },
      nextQuestion: { questionToken: "token-b" },
      feedback: { questionToken: "token-a", nextQuestionAt: 10_500, availableAt: 11_000 },
    });
    await f.request("targetQuiz:answer", { roundId: 42, questionToken: "token-a", choiceIndex: 2 });
    f.setNow(12_000);
    if (nextShown) await f.request("targetQuiz:shown", { roundId: 42, questionToken: "token-b" });
    await f.request("targetQuiz:stop", { roundId: 42, questionToken: "token-a" });
    assert.equal(f.calls.filter(([method]) => method === "stop").length, nextShown ? 0 : 1);
    if (nextShown) {
      await f.request("targetQuiz:stop", { roundId: 42, questionToken: "token-b" });
      assert.equal(f.calls.filter(([method]) => method === "stop").length, 1);
    }
  });
}
