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

  kernel.commands.game.setScore(42);
  assert.equal(feature.store.getState().score, 42);

  pendingStatusRef.current.set("pending", { status: "pending" });
  kernel.commands.game.setSubmissionTick(1);
  assert.equal(feature.store.getState().foundWordsCount, 1);

  acceptedWordMetaRef.current.set("alpha", { usedFakeTwins: true });
  kernel.commands.game.setAccepted(["alpha"]);
  assert.equal(feature.store.getState().acceptedCount, 1);
  assert.equal(feature.store.getState().foundWordsCount, 2);
  assert.match(feature.store.getState().bannerText, /1 mots avec A\/B/);
  assert.equal(solverRequests, 1);
  assert.equal(fakeTwinsCompletions, 0);

  acceptedWordMetaRef.current.set("beta", { usedFakeTwins: true });
  kernel.commands.game.setAccepted(["alpha", "beta"]);
  assert.equal(fakeTwinsCompletions, 1);
  kernel.commands.game.setSubmissionTick(2);
  assert.equal(fakeTwinsCompletions, 1);

  feature.showStatus("+12 pts", 5);
  assert.equal(feature.store.getState().statusText, "+12 pts");
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(feature.store.getState().statusText, "");

  scope.dispose();
  assert.deepEqual(feature.store.getState(), {
    acceptedCount: 0,
    bannerText: "",
    foundWordsCount: 0,
    score: 0,
    statusText: "",
    submissionTick: 0,
  });
  kernel.commands.game.setScore(99);
  assert.equal(feature.store.getState().score, 0);
});
