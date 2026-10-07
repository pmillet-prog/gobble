import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { loadTargetQuizCatalog } from "./targetQuizCatalog.js";
import { createTargetQuizProgressRepository } from "./targetQuizProgressRepository.js";
import { createTargetQuizPointsRepository } from "./targetQuizPointsRepository.js";
import { createTargetQuizService } from "./targetQuizService.js";
import { createTargetQuizSocketHandlers } from "./registerTargetQuizHandlers.js";
import { createTargetQuizController } from "../../src/features/targetQuiz/targetQuizController.js";

// In-process transport: controller requests run through the actual registered
// socket handlers. No network listener, game backend or filesystem DB is started.
class TestSocket extends EventEmitter {
  constructor(id) {
    super();
    Object.assign(this, { id, roomId: "live", connected: true });
    this.pending = new Set();
    this.responses = [];
  }

  emit(event, ...args) {
    if (!event.startsWith("targetQuiz:") || event === "targetQuiz:progress") return super.emit(event, ...args);
    const [payload, callback] = args;
    let complete;
    const pending = new Promise(resolve => { complete = resolve; });
    this.pending.add(pending);
    return super.emit(event, payload, response => {
      this.responses.push({ event, response });
      callback?.(response);
      this.pending.delete(pending);
      complete();
    });
  }

  async flush() {
    while (this.pending.size) await Promise.all([...this.pending]);
  }
}

function waitForState(controller, predicate) {
  if (predicate(controller.getSnapshot())) return Promise.resolve(controller.getSnapshot());
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      unsubscribe();
      reject(new Error(`quiz_state_timeout: ${JSON.stringify(controller.getSnapshot())}`));
    }, 5000);
    const unsubscribe = controller.subscribe(() => {
      const state = controller.getSnapshot();
      if (!predicate(state)) return;
      clearTimeout(deadline);
      unsubscribe();
      resolve(state);
    });
  });
}

for (const cancelled of [false, true]) test(`real client, socket and SQLite retain reconnects then ${cancelled ? "cancel an in-flight answer and all session points on knockout" : "settle rewards at round end"}`, async t => {
  let now = 10_000;
  const catalog = await loadTargetQuizCatalog();
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  const repositoryOptions = { getDb: async () => db, now: () => now };
  const repository = createTargetQuizProgressRepository(repositoryOptions);
  await db.exec(`CREATE TABLE gobblar_profiles (installId TEXT PRIMARY KEY, balance INTEGER DEFAULT 0, updatedAt INTEGER);
    CREATE TABLE gobblar_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, installId TEXT, ts INTEGER, delta INTEGER, reason TEXT, meta TEXT);`);
  const points = createTargetQuizPointsRepository({ ...repositoryOptions, cursors: repository });
  await points.init();
  await db.run("INSERT INTO target_quiz_points (user_id, total, points, cycles, updated_at) VALUES (7, 9950, 9950, 0, 0)");
  const service = createTargetQuizService({
    loadCatalog: loadTargetQuizCatalog,
    loadProgress: key => repository.load(key),
    saveProgress: (key, progress) => repository.save(key, progress),
    loadPoints: key => points.load(key),
    saveAnswer: value => points.answer(value),
    finishPoints: value => points.finish(value),
    now: () => now,
    timers: null,
  });
  const round = {
    id: 42, endsAt: 150_000, status: "running", special: { type: "target_long" },
    targetFoundAt: new Map([["Paul", 9000]]),
  };
  const room = { id: "live", currentRound: round, players: new Map() };
  const internalRoundIds = [];
  const handlers = createTargetQuizSocketHandlers({
    service: {
      ...service,
      start(context) {
        internalRoundIds.push(context.roundId);
        return service.start(context);
      },
    },
    getRoom: roomId => roomId === room.id ? room : null,
    getSocketPlayerIdentity: () => ({ userId: 7, installId: "account-7" }),
    areDevToolsAllowedForSocket: () => false,
    now: () => now,
  });
  const clients = [];
  function createClient() {
    const socket = new TestSocket(`socket-${clients.length + 1}`);
    room.players.set(socket.id, { userId: 7, nick: "Paul", connected: true });
    handlers.register(socket);
    let timerId = 0;
    const timers = new Map();
    const addTimer = (callback, delay, repeat = false) => {
      const id = ++timerId;
      timers.set(id, { callback, delay, at: now + delay, repeat });
      return id;
    };
    const controller = createTargetQuizController({
      socket, roundId: 42, getNow: () => now,
      setTimeoutFn: addTimer, setIntervalFn: (callback, delay) => addTimer(callback, delay, true),
      clearTimeoutFn: id => timers.delete(id), clearIntervalFn: id => timers.delete(id),
    });
    const client = {
      socket, controller, timers,
      async advance(duration) {
        const until = now + duration;
        while (true) {
          const next = [...timers.entries()].filter(([, timer]) => timer.at <= until)
            .sort((a, b) => a[1].at - b[1].at)[0];
          if (!next) break;
          const [id, timer] = next;
          now = Math.max(now, timer.at);
          if (timer.repeat) timer.at = now + timer.delay;
          else timers.delete(id);
          timer.callback();
          await socket.flush();
        }
        now = until;
      },
    };
    clients.push(client);
    return client;
  }
  t.after(async () => {
    for (const client of clients) {
      client.controller.deactivate();
      await client.socket.flush();
    }
    await service.dispose();
    await db.close();
  });

  const first = createClient();
  first.controller.activate({ deadline: round.endsAt });
  const initial = await waitForState(first.controller, state => state.phase === "running");
  const firstCatalogQuestion = catalog.getQuestion({ routeIndex: 0, questionIndex: 0 });
  assert.equal(initial.question.id, firstCatalogQuestion.id);
  assert.equal(initial.question.choices.length, 4);
  assert.equal(initial.question.answerIndex, undefined);
  assert.equal(initial.feedback, null);
  assert.equal(initial.canAnswer, false);
  assert.equal(first.socket.responses[0].response.roundId, 42);
  assert.deepEqual(internalRoundIds, ["live#42"]);
  assert.equal(await repository.load("user:7"), null);

  first.controller.markShown(initial.question.questionToken);
  await waitForState(first.controller, state => state.canAnswer);
  assert.equal(first.controller.answer(firstCatalogQuestion.answerIndex), true);
  const feedback = await waitForState(first.controller, state => state.phase === "feedback");
  assert.equal(feedback.score, 100);
  assert.equal(feedback.feedback.correct, true);
  assert.equal(feedback.feedback.answerIndex, firstCatalogQuestion.answerIndex);
  assert.deepEqual(feedback.progression.after, { total: 10050, points: 50, cycles: 1 });
  assert.equal(feedback.progression.rewards.length, 0);
  const reopenedRepository = createTargetQuizProgressRepository(repositoryOptions);
  assert.deepEqual(await reopenedRepository.load("user:7"), {
    version: catalog.version, routeIndex: 0, questionIndex: 1,
  });

  first.controller.deactivate();
  await first.socket.flush();
  first.socket.connected = false;
  first.socket.emit("disconnect");
  room.players.delete(first.socket.id);
  assert.equal(first.timers.size, 0);
  now = feedback.feedback.availableAt;
  const reconnected = createClient();
  reconnected.controller.activate({ deadline: round.endsAt });
  const resumed = await waitForState(reconnected.controller, state => state.phase === "running");
  assert.equal(resumed.question.id, catalog.getQuestion({ routeIndex: 0, questionIndex: 1 }).id);
  assert.equal(resumed.score, 100);
  assert.equal(resumed.progression.rewards.length, 0);
  assert.equal(await db.get("SELECT balance FROM gobblar_profiles WHERE installId = '7'"), undefined);
  assert.notEqual(resumed.question.questionToken, initial.question.questionToken);

  reconnected.controller.markShown(resumed.question.questionToken);
  await waitForState(reconnected.controller, state => state.canAnswer);
  now += 5000;
  reconnected.controller.setVisible(false);
  await reconnected.socket.flush();
  assert.equal((await reopenedRepository.load("user:7")).questionIndex, 2);
  reconnected.controller.setVisible(true);
  const third = await waitForState(reconnected.controller, state => state.phase === "running");
  assert.equal(third.question.id, catalog.getQuestion({ routeIndex: 0, questionIndex: 2 }).id);

  reconnected.controller.markShown(third.question.questionToken);
  await waitForState(reconnected.controller, state => state.canAnswer);
  now += 4999;
  reconnected.controller.setVisible(false);
  await reconnected.socket.flush();
  reconnected.controller.setVisible(true);
  const replayed = await waitForState(reconnected.controller, state => state.phase === "running");
  assert.equal(replayed.question.id, third.question.id);
  assert.notEqual(replayed.question.questionToken, third.question.questionToken);
  assert.equal((await reopenedRepository.load("user:7")).questionIndex, 2);

  reconnected.controller.markShown(replayed.question.questionToken);
  await waitForState(reconnected.controller, state => state.canAnswer);
  reconnected.controller.answer(catalog.getQuestion({ routeIndex: 0, questionIndex: 2 }).answerIndex);
  const nextFeedback = await waitForState(reconnected.controller, state => state.phase === "feedback");
  const startCount = internalRoundIds.length;
  assert.equal(nextFeedback.transition, "out");
  await reconnected.advance(500);
  const fadingIn = reconnected.controller.getSnapshot();
  assert.equal(fadingIn.transition, "in");
  assert.equal(fadingIn.question.id, catalog.getQuestion({ routeIndex: 0, questionIndex: 3 }).id);
  reconnected.controller.markShown(fadingIn.question.questionToken);
  await reconnected.socket.flush();
  assert.equal(reconnected.controller.getSnapshot().canAnswer, false);
  await reconnected.advance(500);
  assert.equal(reconnected.controller.getSnapshot().phase, "running");
  assert.equal(reconnected.controller.getSnapshot().canAnswer, true);
  assert.equal(reconnected.controller.getSnapshot().feedback, null);
  assert.equal(internalRoundIds.length, startCount);
  // The handler must now own the preloaded token, despite there being no start RPC.
  reconnected.controller.setVisible(false);
  await reconnected.socket.flush();
  assert.equal((await reopenedRepository.load("user:7")).questionIndex, 3);
  reconnected.controller.setVisible(true);
  const afterFadePause = await waitForState(reconnected.controller, state => state.phase === "running");
  assert.equal(afterFadePause.question.id, fadingIn.question.id);
  assert.notEqual(afterFadePause.question.questionToken, fadingIn.question.questionToken);
  assert.ok(internalRoundIds.every(roundId => roundId === "live#42"));
  assert.ok(clients.every(client => client.socket.responses
    .filter(({ event }) => event !== "targetQuiz:stop")
    .every(({ response }) => response.ok && response.roundId === 42)));
  if (cancelled) {
    reconnected.controller.markShown(afterFadePause.question.questionToken);
    await waitForState(reconnected.controller, state => state.canAnswer);
    reconnected.controller.answer(catalog.getQuestion({ routeIndex: 0, questionIndex: 3 }).answerIndex);
    assert.equal(await reconnected.controller.dismiss(), true);
    await reconnected.socket.flush();
    assert.equal(reconnected.controller.getSnapshot().score, 0);
    assert.equal(reconnected.controller.getSnapshot().cancelled, true);
    assert.equal(reconnected.timers.size, 0);
    assert.deepEqual(await points.load("user:7"), { total: 9950, points: 9950, cycles: 0 });
    assert.equal((await db.get("SELECT count(*) AS n FROM gobblar_ledger")).n, 0);
    assert.equal(round.targetQuizResults.get("user:7").score, 0);
    assert.equal(round.targetQuizResults.get("user:7").cancelled, true);
    const repeat = await new Promise(resolve => reconnected.socket.emit("targetQuiz:dismiss", { roundId: 42 }, resolve));
    assert.equal(repeat.cancelled, true, "lost acknowledgement can be retried safely");
    const retry = createClient();
    retry.controller.activate({ deadline: round.endsAt });
    await retry.socket.flush();
    assert.equal(retry.socket.responses.at(-1).response.ok, false, "reconnect cannot restart the cancelled mini-game");
  } else {
    now = round.endsAt;
    await handlers.closeRoomRound("live", 42);
    assert.deepEqual(await points.load("user:7"), { total: 10175, points: 175, cycles: 1 });
    assert.equal((await db.get("SELECT balance FROM gobblar_profiles WHERE installId = '7'")).balance, 50);
    assert.equal(round.targetQuizResults.get("user:7").progression.rewards[0].amount, 50);
  }
});
