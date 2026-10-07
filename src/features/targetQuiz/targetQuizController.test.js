import assert from "node:assert/strict";
import test from "node:test";
import { createTargetQuizController, getTargetQuizRemainingSeconds } from "./targetQuizController.js";

function setup({ devPreview = false } = {}) {
  let now = 100_000;
  let sequence = 0;
  const timers = new Map();
  const events = [];
  const listeners = new Map();
  const addTimer = (fn, delay, repeat = false) => {
    const id = ++sequence;
    timers.set(id, { fn, at: now + delay, delay, repeat });
    return id;
  };
  const socket = {
    connected: true,
    emit(name, payload, ack) { events.push({ name, payload, ack }); },
    on(name, fn) { listeners.set(name, fn); },
    off(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  const controller = createTargetQuizController({
    socket,
    roundId: "round-1",
    devPreview,
    getNow: () => now,
    setTimeoutFn: (fn, delay) => addTimer(fn, delay),
    clearTimeoutFn: id => timers.delete(id),
    setIntervalFn: (fn, delay) => addTimer(fn, delay, true),
    clearIntervalFn: id => timers.delete(id),
  });
  const question = { id: "word-1", questionToken: "token-1", mode: "words", definition: "Définition.", choices: ["A", "B", "C", "D"] };
  const response = (patch = {}) => ({
    ok: true,
    roundId: "round-1",
    endsAt: 110_000,
    phase: "question",
    score: 0,
    streak: 0,
    bestStreak: 0,
    correctCount: 0,
    wrongCount: 0,
    question,
    ...patch,
  });
  const latest = name => events.findLast(event => event.name === name);
  const advance = (duration) => {
    const until = now + duration;
    while (true) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      now = timer.at;
      if (timer.repeat) timer.at += timer.delay;
      else timers.delete(id);
      timer.fn();
    }
    now = until;
  };
  const showQuestion = () => {
    controller.activate({ deadline: 110_000 });
    latest("targetQuiz:start").ack(response());
    controller.markShown("token-1");
    latest("targetQuiz:shown").ack(response());
  };
  return { controller, events, listeners, socket, timers, latest, response, question, advance, showQuestion };
}

test("knockout waits for confirmation, retries after disconnect and discards late answer acknowledgements", async () => {
  const h = setup();
  h.showQuestion();
  h.controller.answer(0);
  const answer = h.latest("targetQuiz:answer");
  const pending = h.controller.dismiss();
  assert.equal(h.controller.getSnapshot().canAnswer, false);
  h.socket.connected = false;
  h.listeners.get("disconnect")();
  assert.equal(await pending, false);
  h.socket.connected = true;
  const retry = h.controller.dismiss();
  h.latest("targetQuiz:dismiss").ack(h.response({ phase: "stopped", score: 0, cancelled: true, question: null }));
  assert.equal(await retry, true);
  answer.ack(h.response({ score: 100 }));
  assert.equal(h.controller.getSnapshot().score, 0);
  assert.equal(h.controller.getSnapshot().cancelled, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.listeners.size, 0);
});

test("answers require visible question acknowledgement and submit only once", () => {
  const h = setup();
  h.controller.activate({ deadline: 110_000 });
  h.latest("targetQuiz:start").ack(h.response());
  assert.equal(h.controller.answer(0), false);
  h.controller.markShown("previous-token");
  assert.equal(h.latest("targetQuiz:shown"), undefined);
  h.controller.markShown("token-1");
  h.controller.markShown("token-1");
  assert.equal(h.events.filter(event => event.name === "targetQuiz:shown").length, 1);
  h.latest("targetQuiz:shown").ack(h.response());
  assert.equal(h.controller.answer(4), false);
  assert.equal(h.controller.answer(2), true);
  assert.equal(h.controller.answer(1), false);
  assert.deepEqual(h.latest("targetQuiz:answer").payload, { roundId: "round-1", questionToken: "token-1", choiceIndex: 2 });
  h.controller.deactivate();
});

test("a server without preloading retains its card until the feedback deadline then requests the next question", () => {
  const h = setup();
  h.showQuestion();
  h.controller.answer(2);
  h.latest("targetQuiz:answer").ack(h.response({
    phase: "feedback", score: 125, streak: 2, bestStreak: 2, correctCount: 2,
    feedback: { questionToken: "token-1", selectedIndex: 2, answerIndex: 2, correct: true, delta: 125, availableAt: 101_000 },
  }));
  assert.equal(h.controller.getSnapshot().score, 125);
  assert.equal(h.controller.getSnapshot().phase, "feedback");
  assert.equal(h.controller.answer(2), false);
  h.advance(999);
  assert.equal(h.events.filter(event => event.name === "targetQuiz:start").length, 1);
  h.advance(1);
  assert.equal(h.events.filter(event => event.name === "targetQuiz:start").length, 2);
  h.latest("targetQuiz:start").ack(h.response({ question: { ...h.question, questionToken: "token-2" }, score: 125 }));
  assert.equal(h.controller.getSnapshot().feedback, null);
  assert.equal(h.controller.getSnapshot().canAnswer, false);
  h.controller.deactivate();
});

function preparedFeedback(h, { correct = true, endsAt = 110_000 } = {}) {
  return h.response({
    endsAt, phase: "feedback", score: correct ? 100 : 0, streak: correct ? 1 : 0,
    nextQuestion: { ...h.question, id: "word-2", questionToken: "token-2" },
    feedback: {
      questionToken: "token-1", selectedIndex: 2, answerIndex: correct ? 2 : 1,
      correct, delta: correct ? 100 : -75, nextQuestionAt: 100_500, availableAt: 101_000,
    },
  });
}

for (const correct of [true, false]) {
  test(`${correct ? "correct" : "wrong"} feedback fades out/in over 1000 ms and reveals the prepared question without another request`, () => {
    const h = setup();
    h.showQuestion();
    h.controller.answer(2);
    const response = preparedFeedback(h, { correct });
    h.latest("targetQuiz:answer").ack(response);
    assert.equal(h.controller.getSnapshot().transition, "out");
    assert.equal(h.controller.getSnapshot().question.questionToken, "token-1");
    h.advance(499);
    assert.equal(h.controller.getSnapshot().question.questionToken, "token-1");
    h.advance(1);
    assert.equal(h.controller.getSnapshot().phase, "feedback");
    assert.equal(h.controller.getSnapshot().transition, "in");
    assert.equal(h.controller.getSnapshot().question.questionToken, "token-2");
    assert.equal(h.controller.getSnapshot().feedback.questionToken, "token-1");
    h.controller.markShown("token-2");
    h.latest("targetQuiz:shown").ack(response);
    assert.equal(h.controller.getSnapshot().canAnswer, false);
    assert.equal(h.controller.answer(0), false);
    h.advance(499);
    assert.equal(h.controller.getSnapshot().phase, "feedback");
    h.advance(1);
    const state = h.controller.getSnapshot();
    assert.equal(state.phase, "running");
    assert.equal(state.transition, null);
    assert.equal(state.feedback, null);
    assert.equal(state.question.questionToken, "token-2");
    assert.equal(state.canAnswer, true);
    assert.equal(h.events.filter(event => event.name === "targetQuiz:start").length, 1);
    assert.equal(h.controller.answer(0), true);
    assert.equal(h.latest("targetQuiz:answer").payload.questionToken, "token-2");
    assert.equal(h.controller.answer(0), false);
    h.controller.deactivate();
    assert.equal(h.timers.size, 0);
  });
}

for (const [method, pauseAfter] of [["hide", 100], ["hide", 600], ["disconnect", 100], ["disconnect", 600]]) {
  test(`${method} during the ${pauseAfter < 500 ? "outgoing" : "incoming"} fade cancels both timers and recovers from fresh server state`, () => {
    const h = setup();
    h.showQuestion();
    h.controller.answer(2);
    h.latest("targetQuiz:answer").ack(preparedFeedback(h));
    h.advance(pauseAfter);
    if (method === "hide") {
      h.controller.setVisible(false);
      assert.equal(h.latest("targetQuiz:stop").payload.questionToken, pauseAfter < 500 ? "token-1" : "token-2");
    } else {
      h.socket.connected = false;
      h.listeners.get("disconnect")();
    }
    const paused = h.controller.getSnapshot();
    h.advance(1000);
    assert.equal(h.controller.getSnapshot().phase, paused.phase);
    assert.equal(h.controller.getSnapshot().question.questionToken, paused.question.questionToken);
    assert.equal(h.events.filter(event => event.name === "targetQuiz:start").length, 1);
    if (method === "hide") h.controller.setVisible(true);
    else {
      h.socket.connected = true;
      h.listeners.get("connect")();
    }
    h.latest("targetQuiz:start").ack(h.response({
      score: 100, question: { ...h.question, id: "word-2", questionToken: "reissued-token" },
    }));
    assert.equal(h.controller.getSnapshot().question.questionToken, "reissued-token");
    assert.equal(h.controller.getSnapshot().canAnswer, false);
    assert.equal(h.controller.getSnapshot().feedback, null);
    assert.equal(h.controller.getSnapshot().transition, null);
    h.controller.deactivate();
    assert.equal(h.timers.size, 0);
  });
}

test("round expiry during a fade stops both transitions and cannot reveal or answer a late question", () => {
  const h = setup();
  h.showQuestion();
  h.controller.answer(2);
  h.latest("targetQuiz:answer").ack(preparedFeedback(h, { endsAt: 100_200 }));
  h.advance(500);
  assert.equal(h.controller.getSnapshot().phase, "finished");
  assert.equal(h.controller.getSnapshot().transition, null);
  assert.equal(h.controller.getSnapshot().feedback, null);
  assert.equal(h.controller.getSnapshot().question.questionToken, "token-1");
  assert.equal(h.controller.answer(0), false);
  assert.equal(h.timers.size, 0);
  h.controller.deactivate();
});

test("a late answer acknowledgement still shows 1000 ms of reaction and display ACKs cannot shorten it", () => {
  const h = setup();
  h.showQuestion();
  h.controller.answer(2);
  h.advance(1300);
  h.latest("targetQuiz:answer").ack(preparedFeedback(h));
  assert.equal(h.controller.getSnapshot().transition, "out");
  assert.equal(h.controller.getSnapshot().feedback.availableAt, 102_300);
  h.advance(500);
  assert.equal(h.controller.getSnapshot().transition, "in");
  h.controller.markShown("token-2");
  // The server is already past its own cooldown, but the local fade is not.
  h.latest("targetQuiz:shown").ack(h.response({
    question: { ...h.question, id: "word-2", questionToken: "token-2" },
  }));
  assert.equal(h.controller.getSnapshot().phase, "feedback");
  assert.equal(h.controller.getSnapshot().canAnswer, false);
  h.advance(499);
  assert.equal(h.controller.getSnapshot().phase, "feedback");
  h.advance(1);
  assert.equal(h.controller.getSnapshot().phase, "running");
  assert.equal(h.controller.getSnapshot().feedback, null);
  assert.equal(h.controller.getSnapshot().canAnswer, true);
  h.controller.deactivate();
});

test("a rejected display acknowledgement cannot be overwritten by the remaining fade timer", () => {
  const h = setup();
  h.showQuestion();
  h.controller.answer(2);
  h.latest("targetQuiz:answer").ack(preparedFeedback(h));
  h.advance(500);
  h.controller.markShown("token-2");
  h.latest("targetQuiz:shown").ack({ ok: false, error: "training_disabled" });
  h.advance(500);
  assert.equal(h.controller.getSnapshot().phase, "error");
  assert.equal(h.controller.getSnapshot().feedback, null);
  assert.equal(h.controller.getSnapshot().transition, null);
  assert.equal(h.controller.getSnapshot().canAnswer, false);
  h.controller.deactivate();
  assert.equal(h.timers.size, 0);
});

test("the snapshot exposes the current effective deadline through activation, acknowledgement, updates and finish", () => {
  const h = setup({ devPreview: true });
  assert.equal(h.controller.getSnapshot().endsAt, 0);
  h.controller.activate({ deadline: 190_000 });
  assert.equal(h.controller.getSnapshot().endsAt, 190_000);
  h.latest("targetQuiz:start").ack(h.response({ endsAt: 110_000 }));
  assert.equal(h.controller.getSnapshot().endsAt, 110_000);
  // Exposing the deadline does not alter the existing extension behavior.
  h.controller.setDeadline(120_000);
  assert.equal(h.controller.getSnapshot().endsAt, 120_000);
  h.controller.setDeadline(120_001);
  assert.equal(h.controller.getSnapshot().endsAt, 120_001);
  h.controller.setDeadline(100_200);
  h.advance(200);
  assert.equal(h.controller.getSnapshot().phase, "finished");
  assert.equal(h.controller.getSnapshot().endsAt, 100_200);
  h.controller.deactivate();
});

test("hiding stops current exposure and resuming fetches fresh authoritative progress", () => {
  const h = setup();
  h.showQuestion();
  h.controller.setVisible(false);
  assert.deepEqual(h.latest("targetQuiz:stop").payload, { roundId: "round-1", questionToken: "token-1" });
  assert.equal(h.controller.getSnapshot().phase, "paused");
  assert.equal(h.controller.answer(0), false);
  h.controller.setVisible(true);
  h.latest("targetQuiz:start").ack(h.response({ question: { ...h.question, questionToken: "token-resumed" }, score: 200 }));
  assert.equal(h.controller.getSnapshot().score, 200);
  assert.equal(h.controller.getSnapshot().canAnswer, false);
  h.controller.markShown("token-resumed");
  assert.equal(h.latest("targetQuiz:shown").payload.questionToken, "token-resumed");
  h.controller.deactivate();
});

test("suspension and disconnection discard late replies and reconnect re-fetches", () => {
  const h = setup();
  h.controller.activate({ deadline: 110_000 });
  const pending = h.latest("targetQuiz:start");
  h.controller.setVisible(false);
  pending.ack(h.response());
  assert.equal(h.controller.getSnapshot().question, null);
  h.controller.setVisible(true);
  const beforeDisconnect = h.latest("targetQuiz:start");
  h.socket.connected = false;
  h.listeners.get("disconnect")();
  beforeDisconnect.ack(h.response());
  assert.equal(h.controller.getSnapshot().phase, "disconnected");
  h.socket.connected = true;
  h.listeners.get("connect")();
  h.latest("targetQuiz:start").ack(h.response({ score: 300 }));
  assert.equal(h.controller.getSnapshot().score, 300);
  h.controller.deactivate();
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
});

test("round deadline closes answering and stops any pending next-question timer", () => {
  const h = setup();
  h.showQuestion();
  h.advance(9500);
  h.controller.answer(0);
  h.latest("targetQuiz:answer").ack(h.response({
    phase: "feedback", score: 100,
    feedback: { questionToken: "token-1", selectedIndex: 0, answerIndex: 0, correct: true, delta: 100, availableAt: 110_450 },
  }));
  h.advance(500);
  assert.equal(h.controller.getSnapshot().phase, "finished");
  assert.equal(h.controller.answer(0), false);
  assert.equal(h.controller.getSnapshot().remainingSeconds, 0);
  assert.equal(h.timers.size, 0);
  h.advance(1000);
  assert.equal(h.events.filter(event => event.name === "targetQuiz:start").length, 1);
  h.controller.deactivate();
});

test("unmounted requests cannot mutate state and timeouts allow safe retry", () => {
  const h = setup();
  h.controller.activate({ deadline: 110_000 });
  const slow = h.latest("targetQuiz:start");
  h.advance(6000);
  assert.equal(h.controller.getSnapshot().phase, "error");
  slow.ack(h.response());
  assert.equal(h.controller.getSnapshot().phase, "error");
  h.controller.retry();
  const retry = h.latest("targetQuiz:start");
  h.controller.deactivate();
  retry.ack(h.response());
  assert.equal(h.controller.getSnapshot().question, null);
  assert.equal(h.timers.size, 0);
});

test("hidden activation does not request or expose a question", () => {
  const h = setup();
  h.controller.activate({ deadline: 110_000, isVisible: false });
  assert.equal(h.events.length, 0);
  h.controller.markShown("token-1");
  assert.equal(h.events.length, 0);
  h.controller.setVisible(true);
  assert.equal(h.latest("targetQuiz:start").payload.devPreview, undefined);
  h.controller.deactivate();
});

test("explicit dev preview is requested only on session start", () => {
  const h = setup({ devPreview: true });
  h.showQuestion();
  assert.equal(h.latest("targetQuiz:start").payload.devPreview, true);
  assert.equal(h.latest("targetQuiz:shown").payload.devPreview, undefined);
  h.controller.deactivate();
});

test("countdown uses supplied server time and clips at the deadline", () => {
  assert.equal(getTargetQuizRemainingSeconds(101_001, 100_000), 2);
  assert.equal(getTargetQuizRemainingSeconds(101_000, 100_000), 1);
  assert.equal(getTargetQuizRemainingSeconds(100_000, 100_000), 0);
  assert.equal(getTargetQuizRemainingSeconds(99_000, 100_000), 0);
});
