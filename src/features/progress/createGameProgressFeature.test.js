import test from "node:test";
import assert from "node:assert/strict";

import { createApplicationKernel } from "../../app/core/createApplicationKernel.js";
import { createResourceScope } from "../../app/core/createResourceScope.js";
import { FAKE_TWINS_TYPE } from "../../components/gameLogic.js";
import { createGameProgressFeature } from "./createGameProgressFeature.js";

test("game progress owns high-frequency score, word and status updates", async () => {
  const kernel = createApplicationKernel();
  const scope = createResourceScope("test:progress");
  const pendingStatusRef = { current: new Map() };
  const acceptedWordMetaRef = { current: new Map() };
  let solverRequests = 0;
  let fakeTwinsCompletions = 0;
  let kernelNotifications = 0;
  const unsubscribeKernel = kernel.subscribe(() => {
    kernelNotifications += 1;
  });
  const feature = createGameProgressFeature({
    getKernel: () => kernel,
    scope,
  });

  feature.start();
  feature.configure({
    acceptedWordMetaRef,
    allWords: [
      { word: "alpha", usedFakeTwins: true },
      { word: "beta", usedFakeTwins: true },
      { word: "gamma", usedFakeTwins: true },
      { word: "delta", usedFakeTwins: true },
      { word: "epsilon", usedFakeTwins: true },
    ],
    board: [{ letter: "A", altLetter: "B", specialType: FAKE_TWINS_TYPE }],
    isDailyPlay: false,
    pendingStatusRef,
    phase: "playing",
    roundId: "round-1",
    specialRound: { type: FAKE_TWINS_TYPE },
    onAcceptedWordsAvailable: () => {
      solverRequests += 1;
    },
    onFakeTwinsCompleted: () => {
      fakeTwinsCompletions += 1;
    },
  });

  feature.setScore(42);
  assert.equal(feature.store.getState().score, 42);

  pendingStatusRef.current.set("pending", { status: "pending" });
  feature.setSubmissionTick(1);
  assert.equal(feature.store.getState().foundWordsCount, 1);

  acceptedWordMetaRef.current.set("alpha", { usedFakeTwins: true });
  feature.setAccepted(["alpha"]);
  assert.equal(feature.store.getState().acceptedCount, 1);
  assert.equal(feature.store.getState().foundWordsCount, 2);
  assert.match(feature.store.getState().bannerText, /1 mots avec A\/B/);
  assert.equal(solverRequests, 1);
  assert.equal(fakeTwinsCompletions, 0);

  acceptedWordMetaRef.current.set("beta", { usedFakeTwins: true });
  feature.setAccepted(["alpha", "beta"]);
  assert.equal(fakeTwinsCompletions, 1);
  feature.setSubmissionTick(2);
  assert.equal(fakeTwinsCompletions, 1);
  assert.equal(kernelNotifications, 0);
  assert.equal(kernel.getState().game.accepted, undefined);
  assert.equal(kernel.getState().game.score, undefined);
  assert.equal(kernel.getState().game.submissionTick, undefined);

  feature.showStatus("+12 pts", 5);
  feature.triggerInputShake({ durationMs: 5 });
  assert.equal(feature.store.getState().statusText, "+12 pts");
  assert.equal(feature.store.getState().inputShake, true);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(feature.store.getState().statusText, "");
  assert.equal(feature.store.getState().inputShake, false);

  scope.dispose();
  assert.deepEqual(feature.store.getState(), {
    accepted: [],
    acceptedCount: 0,
    bannerText: "",
    foundWordsCount: 0,
    inputShake: false,
    score: 0,
    statusText: "",
    submissionTick: 0,
  });
  feature.setScore(99);
  assert.equal(feature.store.getState().score, 0);
  unsubscribeKernel();
});
