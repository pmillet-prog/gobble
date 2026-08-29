import assert from "node:assert/strict";
import test from "node:test";

import { createWordSubmissionEngine } from "../../src/game/createWordSubmissionEngine.js";

function createSubmissionHarness({ inputMode, mobile }) {
  let accepted = [];
  let lastWords = [];
  let score = 0;
  const errors = [];
  const registered = [];
  const statuses = [];
  const selections = [];
  const noop = () => {};
  const highlightPathRef = {
    current: inputMode === "keyboard" ? [] : [0, 1],
  };
  const runtime = {
    acceptedBestPtsRef: { current: new Map() },
    acceptedRef: { current: [] },
    acceptedScoresRef: { current: new Map() },
    acceptedWordMetaRef: { current: new Map() },
    acceptedWordSetRef: { current: new Set() },
    activeTraceStartedAtRef: { current: 100 },
    allWordsMap: new Map(),
    appViewRef: { current: "live" },
    areStringArraysEqual: (left, right) =>
      JSON.stringify(left) === JSON.stringify(right),
    attemptSilentReconnectRef: { current: null },
    batchSeqRef: { current: 0 },
    batchTimerRef: { current: null },
    batchUnsupportedRef: { current: false },
    bestGridMaxLenRef: { current: 0 },
    bestGridMaxRef: { current: 0 },
    board: [
      { bonus: null, letter: "A" },
      { bonus: null, letter: "B" },
      { bonus: null, letter: "X" },
      { bonus: null, letter: "Y" },
    ],
    clearSelection: () => selections.push("cleared"),
    currentTilesRef: { current: ["A", "B"] },
    dailyAcceptedPathsRef: { current: new Map() },
    dailyActiveSlot: 0,
    dailySpecialPlacements: {},
    dailyWordSlots: [],
    dictionary: new Set(["ab"]),
    draggingRef: { current: false },
    dragGridMetricsRef: { current: null },
    error: (message) => errors.push(message),
    finishStandaloneTraining: noop,
    foundTargetThisRound: false,
    getMassiveBoggleFeedbackPoints: (points) => points,
    getNextLiveFeedTs: () => 123,
    handleForeground: noop,
    highlightPathRef,
    inFlightBatchesRef: { current: new Map() },
    inputLockedRef: { current: false },
    isCurrentCultureThemeWord: () => false,
    isDailyPlayRef: { current: false },
    isLiveSpecial3WordsMode: false,
    isLoggedIn: false,
    isLoggedInRef: { current: false },
    isMobileLayoutRef: { current: mobile },
    isSpecial3WordsMode: false,
    isTouchDeviceRef: { current: mobile },
    keyboardRecallSubmittedWordRef: { current: false },
    lastInputModeRef: { current: inputMode },
    liveSessionReadyRef: { current: false },
    maybeAnnounceBestWord: noop,
    nickname: "Test",
    ocidLatestProposalRef: { current: null },
    pendingQueueRef: { current: [] },
    pendingWordsRef: { current: new Set() },
    playAlreadyPlayedSound: noop,
    playDoubleGobbleVoice: noop,
    playGobbleVoice: noop,
    playOneShotAudio: noop,
    playScoreSound: noop,
    pushWordHistory: noop,
    registerAcceptedWordRuntime: (word) => registered.push(word),
    resetDragMovePipeline: noop,
    roundId: null,
    roundIdRef: { current: null },
    roundStats: {},
    scheduleForegroundRetry: noop,
    serverSolutionsReadyRef: { current: false },
    setAccepted: (updater) => {
      accepted = updater(accepted);
    },
    setDailyActiveSlot: noop,
    setDailyInvalidPulseKey: noop,
    setDailyInvalidSlot: noop,
    setDailySpecialPlacements: noop,
    setDailyWordSlots: noop,
    setFoundTargetThisRound: noop,
    setFoundTargetWord: noop,
    setHighlightPath: (path) => {
      highlightPathRef.current = path;
    },
    setLastWords: (updater) => {
      lastWords = updater(lastWords);
    },
    setOcidProposal: noop,
    setOcidProposalPath: noop,
    setOcidProposalSubmitted: noop,
    setOcidStatusMessage: noop,
    setScore: (updater) => {
      score = updater(score);
    },
    setStatusMessageWithHold: (message) => statuses.push(message),
    showToast: noop,
    socket: { connected: false },
    solutionsRef: { current: new Map() },
    SPECIAL_TUTORIAL_SPEED_SCORE_FALLBACK: 1,
    specialRound: null,
    specialScoreConfig: null,
    standaloneTrainingSessionRef: { current: null },
    submissionStatusRef: { current: new Map() },
    touchSubmissionState: noop,
    triggerConfettiBurst: noop,
    triggerPraiseFlash: noop,
    triggerScoreFlight: noop,
    WORD_BATCH_ACK_TIMEOUT_MS: 100,
    WORD_BATCH_FLUSH_MS: 100,
    WORD_BATCH_MAX: 10,
  };

  return {
    controller: createWordSubmissionEngine(runtime),
    getState: () => ({
      accepted,
      errors,
      lastWords,
      path: highlightPathRef.current,
      registered,
      score,
      selections,
      statuses,
    }),
  };
}

test("word submission helpers are exposed through a named runtime contract", () => {
  const controller = createWordSubmissionEngine({
    dictionary: new Set(["ab"]),
    serverSolutionsReadyRef: { current: false },
    specialScoreConfig: {
      minWordLength: 4,
      type: "fake_twins",
    },
  });

  assert.equal(typeof controller.getPathPreviewScoreConfig, "function");
  assert.equal(typeof controller.isKnownSubmissionWord, "function");
  assert.equal(controller.getPathPreviewScoreConfig().minWordLength, 2);
  assert.equal(controller.isKnownSubmissionWord("ab"), true);
  assert.equal(controller.isKnownSubmissionWord("zz"), false);
  assert.equal(
    controller.getLivePreviewLabelForCell({
      altLetter: "B",
      letter: "A",
      specialType: "fake_twins",
    }),
    "A/B"
  );
});

for (const scenario of [
  { inputMode: "keyboard", label: "desktop keyboard", mobile: false },
  { inputMode: "touch", label: "mobile touch trace", mobile: true },
]) {
  test(`${scenario.label} validates and scores a traced word`, () => {
    const harness = createSubmissionHarness(scenario);

    harness.controller.submit();

    const state = harness.getState();
    assert.deepEqual(state.errors, []);
    assert.deepEqual(state.accepted, ["ab"]);
    assert.deepEqual(state.registered, ["ab"]);
    assert.deepEqual(state.path, [0, 1]);
    assert.equal(state.lastWords[0]?.display, "AB");
    assert.ok(state.score > 0);
    assert.deepEqual(state.selections, ["cleared"]);
    assert.match(state.statuses.at(-1), /^\+\d+ pts$/);
  });
}
