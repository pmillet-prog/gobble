import test from "node:test";
import assert from "node:assert/strict";
import { createTargetQuizService } from "./targetQuizService.js";

function fixture(options = {}) {
  let at = 1000;
  let token = 0;
  const stored = new Map();
  const writes = [];
  const catalog = {
    version: "fixture-v1", questionCount: 3, routeCount: 5,
    getQuestion({ routeIndex, questionIndex }) {
      return {
        id: `q${routeIndex}-${questionIndex}`,
        definition: "Une définition", mode: questionIndex % 2 ? "spellings" : "words",
        choices: ["un", "deux", "trois", "quatre"], answerIndex: 2,
      };
    },
    advance({ routeIndex, questionIndex }) {
      return questionIndex === 2
        ? { routeIndex: (routeIndex + 1) % 5, questionIndex: 0 }
        : { routeIndex, questionIndex: questionIndex + 1 };
    },
  };
  const service = createTargetQuizService({
    loadCatalog: async () => catalog,
    loadProgress: async key => stored.get(key) || null,
    saveProgress: async (key, progress) => {
      stored.set(key, { ...progress });
      writes.push([key, { ...progress }]);
    },
    now: () => at,
    createId: () => `token-${++token}`,
    timers: null,
    ...options,
  });
  const context = { playerKey: "user:1", roundId: "round-1", endsAt: 100000 };
  const start = overrides => service.start({ ...context, ...overrides });
  const shown = state => service.shown({ ...context, roundId: state.roundId, questionToken: state.question.questionToken });
  const answer = (state, choiceIndex = 2) => service.answer({
    ...context, roundId: state.roundId, questionToken: state.question.questionToken, choiceIndex,
  });
  const stop = state => service.stop({ ...context, roundId: state.roundId, questionToken: state.question?.questionToken });
  return { service, context, catalog, stored, writes, start, shown, answer, stop, setTime: value => { at = value; } };
}

test("start is idempotent, keeps the solution private, and requires the display acknowledgement", async () => {
  const f = fixture();
  const first = await f.start();
  assert.equal(first.question.choices.length, 4);
  assert.equal(first.question.answerIndex, undefined);
  assert.equal(first.feedback, null);
  assert.equal(first.score, 0);
  assert.deepEqual(await f.start(), first);
  await assert.rejects(f.answer(first), /not_shown/);
  await f.shown(first);
  await assert.rejects(f.answer(first, 1.5), /choice_invalid/);
  await assert.rejects(f.answer(first, 4), /choice_invalid/);
  assert.equal(f.writes.length, 0);
});

for (const [duration, expectedId] of [[4999, "q0-0"], [5000, "q0-1"]]) {
  test(`an unanswered question displayed ${duration} ms ${duration < 5000 ? "replays" : "advances"}`, async () => {
    const f = fixture();
    const first = await f.start();
    await f.shown(first);
    f.setTime(1000 + duration);
    await f.stop(first);
    const resumed = await f.start();
    assert.equal(resumed.question.id, expectedId);
    assert.notEqual(resumed.question.questionToken, first.question.questionToken);
    assert.equal(resumed.score, 0);
    await assert.rejects(f.answer(first), /stale/);
    assert.equal(f.writes.length, duration < 5000 ? 0 : 1);
  });
}

test("only actual display time counts, duplicate shown does not reset it, and each resumed display starts anew", async () => {
  const f = fixture();
  let state = await f.start();
  f.setTime(20000);
  await f.stop(state);
  assert.equal(f.writes.length, 0);
  state = await f.start();
  await f.shown(state);
  f.setTime(24000);
  await f.stop(state);
  state = await f.start();
  await f.shown(state);
  f.setTime(28000);
  await f.shown(state);
  await f.stop(state);
  assert.equal(f.writes.length, 0);
  state = await f.start();
  await f.shown(state);
  f.setTime(33000);
  await f.shown(state);
  await f.stop(state);
  assert.equal(f.writes.length, 1);
});

test("late closure is capped at round end, rejects late answers and resets score next round", async () => {
  const f = fixture();
  f.setTime(97000);
  const state = await f.start();
  await f.shown(state);
  f.setTime(120000);
  await assert.rejects(f.answer(state), /round_finished/);
  assert.equal(f.writes.length, 0);
  const next = await f.start({ roundId: "round-2", endsAt: 200000 });
  assert.equal(next.question.id, state.question.id);
  assert.equal(next.score, 0);
});

test("server validates scores, preserves feedback delays and score on stop, and caps the streak multiplier", async () => {
  const f = fixture();
  let at = 1000;
  for (const expected of [100, 125, 150, 175, 200, 200]) {
    const question = await f.start();
    await f.shown(question);
    const result = await f.answer(question);
    assert.equal(result.feedback.delta, expected);
    assert.equal(result.feedback.answerIndex, 2);
    assert.equal(result.feedback.availableAt, at + 1000);
    assert.equal(result.feedback.nextQuestionAt, at + 500);
    await f.stop(result);
    const resumed = await f.start();
    assert.deepEqual(resumed.feedback, result.feedback);
    assert.equal(resumed.nextQuestion.id, result.nextQuestion.id);
    assert.notEqual(resumed.nextQuestion.questionToken, result.nextQuestion.questionToken);
    assert.ok(resumed.question);
    f.setTime(at + 999);
    assert.equal((await f.start()).phase, "feedback");
    at += 1000;
    f.setTime(at);
  }
  const next = await f.start();
  assert.equal(next.score, 950);
  await f.shown(next);
  const wrong = await f.answer(next, 0);
  assert.equal(wrong.score, 875);
  assert.equal(wrong.streak, 0);
  assert.equal(wrong.bestStreak, 6);
  assert.equal(wrong.correctCount, 6);
  assert.equal(wrong.wrongCount, 1);
  assert.equal(wrong.feedback.availableAt, at + 1000);
  f.setTime(at + 1000);
  const nextRound = await f.start({ roundId: "round-2" });
  assert.equal(nextRound.score, 0);
  await f.shown(nextRound);
  assert.equal((await f.answer(nextRound, 0)).score, -75);
});

test("a duplicate concurrent answer awards and persists exactly once", async () => {
  const writes = [];
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const f = fixture({ saveProgress: async (...args) => { await barrier; writes.push(args); } });
  const first = await f.start();
  await f.shown(first);
  const responses = [f.answer(first), f.answer(first)];
  release();
  const results = await Promise.allSettled(responses);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[0].value.score, 100);
  assert.equal(results[1].status, "rejected");
  assert.match(results[1].reason.message, /stale/);
  assert.equal(writes.length, 1);
});

test("a failed save leaves the answer retryable without awarding or advancing", async () => {
  let fail = true;
  const writes = [];
  const f = fixture({ saveProgress: async (...args) => {
    if (fail) throw new Error("storage_failed");
    writes.push(args);
  } });
  const first = await f.start();
  await f.shown(first);
  await assert.rejects(f.answer(first), /storage_failed/);
  assert.equal((await f.start()).score, 0);
  fail = false;
  assert.equal((await f.answer(first)).score, 100);
  assert.equal(writes.length, 1);
  f.setTime(2000);
  assert.equal((await f.start()).question.id, "q0-1");
});

test("a failed interruption save is retried before issuing another question", async () => {
  let fail = true;
  const writes = [];
  const f = fixture({ saveProgress: async (...args) => {
    if (fail) throw new Error("storage_failed");
    writes.push(args);
  } });
  const first = await f.start();
  await f.shown(first);
  f.setTime(6000);
  await assert.rejects(f.stop(first), /storage_failed/);
  fail = false;
  assert.equal((await f.start()).question.id, "q0-1");
  assert.equal(writes.length, 1);
  await assert.rejects(f.answer(first), /stale/);
});

test("load failures do not replace stored progress; accounts, guests and dev cursors stay independent", async () => {
  const f = fixture();
  f.stored.set("user:1", { version: "fixture-v1", routeIndex: 4, questionIndex: 2 });
  const first = await f.start();
  assert.equal(first.question.id, "q4-2");
  await f.shown(first);
  await f.answer(first);
  assert.deepEqual(f.stored.get("user:1"), { version: "fixture-v1", routeIndex: 0, questionIndex: 0 });
  for (const playerKey of ["user:2", "install:guest", "dev:user:1"]) {
    assert.equal((await f.start({ playerKey })).question.id, "q0-0");
    assert.equal(f.stored.has(playerKey), false);
  }
  const failing = fixture({ loadProgress: async () => { throw new Error("read_failed"); } });
  await assert.rejects(failing.start(), /read_failed/);
  assert.equal(failing.writes.length, 0);
});

test("an outdated catalogue cursor restarts with the current version", async () => {
  const f = fixture();
  f.stored.set("user:1", { version: "old", routeIndex: 4, questionIndex: 2 });
  const state = await f.start();
  assert.equal(state.question.id, "q0-0");
  await f.shown(state);
  await f.answer(state);
  assert.equal(f.stored.get("user:1").version, "fixture-v1");
});

test("stale stops cannot remove the next question and restarting cannot extend a session", async () => {
  const f = fixture();
  const first = await f.start({ endsAt: 20000 });
  await f.shown(first);
  await f.answer(first);
  f.setTime(2000);
  const second = await f.start({ endsAt: 40000 });
  assert.equal(second.endsAt, 20000);
  await f.shown(second);
  await f.stop(first);
  assert.deepEqual(await f.start({ endsAt: 40000 }), second);
});

test("expiring a dev session cannot restart it in the same live round", async () => {
  const f = fixture();
  const state = await f.start({ endsAt: 5000, roundEndsAt: 100000 });
  await f.shown(state);
  f.setTime(5000);
  await f.service.closeExpired();
  await assert.rejects(f.start({ endsAt: 9000, roundEndsAt: 100000 }), /round_finished/);
  assert.equal((await f.start({ roundId: "round-2", endsAt: 9000 })).phase, "question");
});

test("closing a round waits for in-flight starts, blocks late starts, and persists once", async () => {
  const f = fixture();
  const state = await f.start();
  await f.shown(state);
  f.setTime(6000);
  await f.service.closeRound("round-1");
  await f.service.closeRound("round-1");
  assert.equal(f.writes.length, 1);
  await assert.rejects(f.start(), /round_finished/);
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const blocked = fixture({ loadProgress: async () => { await barrier; return null; } });
  const pending = blocked.start();
  const closing = blocked.service.closeRound("round-1");
  release();
  await assert.rejects(pending, /round_finished/);
  await closing;
  await blocked.service.dispose();
  await assert.rejects(blocked.start({ roundId: "round-2" }), /round_finished/);
});

test("one shared expiry timer is replaced and is cleared on disposal", async () => {
  const scheduled = new Map();
  let id = 0;
  const f = fixture({ timers: {
    setTimeout(callback, delay) { const key = ++id; scheduled.set(key, { callback, delay }); return key; },
    clearTimeout(key) { scheduled.delete(key); },
  } });
  await f.start();
  await f.start({ playerKey: "user:2" });
  assert.equal(scheduled.size, 1);
  await f.service.dispose();
  assert.equal(scheduled.size, 0);
});

test("the following question is preloaded privately, shown at 500 ms, and answerable once at 1000 ms", async () => {
  const f = fixture();
  const first = await f.start();
  await f.shown(first);
  const feedback = await f.answer(first);
  const next = { ...feedback, question: feedback.nextQuestion };
  assert.equal(feedback.question.id, first.question.id);
  assert.equal(feedback.nextQuestion.id, "q0-1");
  assert.equal(feedback.nextQuestion.answerIndex, undefined);
  await assert.rejects(f.shown(next), /stale/);
  f.setTime(1500);
  await f.shown(next);
  await assert.rejects(f.answer(next), /stale/);
  f.setTime(2000);
  const result = await f.answer(next);
  assert.equal(result.score, 225);
  assert.equal(result.nextQuestion.id, "q0-2");
  await assert.rejects(f.answer(next), /stale/);
  assert.equal(f.writes.length, 2);
});

for (const interruptedAt of [1100, 1600]) {
  test(`interrupting the ${interruptedAt === 1100 ? "outgoing" : "incoming"} fade replays the prepared question with a fresh token`, async () => {
    const f = fixture();
    const first = await f.start();
    await f.shown(first);
    const feedback = await f.answer(first);
    const displayed = interruptedAt === 1100 ? feedback : { ...feedback, question: feedback.nextQuestion };
    f.setTime(interruptedAt);
    if (interruptedAt === 1600) await f.shown(displayed);
    await f.stop(displayed);
    const resumed = await f.start();
    assert.equal(resumed.score, 100);
    assert.equal(resumed.nextQuestion.id, feedback.nextQuestion.id);
    assert.notEqual(resumed.nextQuestion.questionToken, feedback.nextQuestion.questionToken);
    f.setTime(2000);
    const next = await f.start();
    assert.equal(next.question.id, feedback.nextQuestion.id);
    await assert.rejects(f.answer(next), /not_shown/);
    assert.equal(f.writes.length, 1);
  });
}

test("exposure of the prepared question counts from its display even without a later start request", async () => {
  const f = fixture();
  const first = await f.start();
  await f.shown(first);
  const feedback = await f.answer(first);
  f.setTime(1500);
  await f.shown({ ...feedback, question: feedback.nextQuestion });
  f.setTime(6500);
  await f.service.closeRound("round-1");
  assert.equal(f.stored.get("user:1").questionIndex, 2);
  assert.equal(f.writes.length, 2);
});

test("a delayed outgoing fade can stop after the server cooldown, but its token becomes stale once the next card is shown", async () => {
  const f = fixture();
  const first = await f.start();
  await f.shown(first);
  const feedback = await f.answer(first);
  f.setTime(2800);
  assert.equal((await f.stop(feedback)).phase, "stopped");
  const next = await f.start();
  assert.equal(next.question.id, feedback.nextQuestion.id);
  assert.notEqual(next.question.questionToken, feedback.nextQuestion.questionToken);
  await f.shown(next);
  await f.stop(feedback);
  assert.equal((await f.start()).question.questionToken, next.question.questionToken);
  assert.equal(f.writes.length, 1);
});
