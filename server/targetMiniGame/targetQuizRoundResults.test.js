import test from "node:test";
import assert from "node:assert/strict";
import { createTargetQuizService } from "./targetQuizService.js";
import { getTargetQuizResult, recordTargetQuizResult } from "./targetQuizRoundResults.js";

test("signed results survive session closure, are tied to trusted identity and never modify target ranking", async () => {
  const round = { id: 42, targetFoundAt: new Map([["Paul", 1000]]) };
  const context = { room: { currentRound: round }, publicRoundId: 42, playerKey: "user:7", roundId: "live#42", endsAt: 10000 };
  let releaseSave;
  const service = createTargetQuizService({ now: () => 2000, timers: null,
    loadCatalog: async () => ({ version: "test", routeCount: 5, questionCount: 2,
      getQuestion: () => ({ id: "q", choices: ["a", "b", "c", "d"], answerIndex: 1 }),
      advance: () => ({ routeIndex: 0, questionIndex: 1 }) }),
    loadProgress: async () => null,
    saveProgress: () => new Promise(resolve => { releaseSave = resolve; }),
  });
  const state = await service.start({ ...context, onSummary: summary => recordTargetQuizResult(context, summary) });
  assert.equal(getTargetQuizResult(round, { userId: 7 }), null);
  await service.shown({ ...context, questionToken: state.question.questionToken });
  assert.equal(getTargetQuizResult(round, { userId: 7 }).score, 0);
  const answer = service.answer({ ...context, questionToken: state.question.questionToken, choiceIndex: 0 });
  await new Promise(resolve => setImmediate(resolve));
  const closure = service.closeRound(context.roundId);
  releaseSave();
  await Promise.all([answer, closure]);
  assert.deepEqual(getTargetQuizResult(round, { userId: 7, nick: "Renamed" }), { score: -75, correctCount: 0, wrongCount: 1, bestStreak: 0 });
  assert.equal(getTargetQuizResult(round, { userId: 8, nick: "Paul" }), null);
  assert.equal(round.targetFoundAt.get("Paul"), 1000);
  await service.dispose();
});

test("dev, training and stale-round summaries never become real results", () => {
  for (const override of [{ devPreview: true }, { publicRoundId: 43 }, { training: true }]) {
    const round = { id: 42, training: override.training };
    recordTargetQuizResult({ room: { currentRound: round }, playerKey: "user:7", publicRoundId: 42, ...override }, { score: 200 });
    assert.equal(round.targetQuizResults, undefined);
  }
});

test("public rankings do not disclose private wallet balances or reward receipts", () => {
  const round = { id: 42 };
  recordTargetQuizResult({ room: { currentRound: round }, playerKey: "user:7", publicRoundId: 42 },
    { score: 100, progression: { rewards: [{ balance: 12345, receipt: "private" }] } });
  assert.equal(getTargetQuizResult(round, { userId: 7 }).progression, undefined);
});
