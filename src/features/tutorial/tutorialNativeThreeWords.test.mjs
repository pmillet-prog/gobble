import test from "node:test";
import assert from "node:assert/strict";
import { createWordSubmissionEngine } from "../../game/createWordSubmissionEngine.js";
import { createDailyWordSlots } from "../../components/daily/dailySpecialModel.js";
import { prepareTutorialRound, buildTutorialResults } from "./tutorialPreparedRounds.js";
import { getTutorialChapter, getTutorialTarget } from "./tutorialScenarios.js";

test("native three-word submission accepts the teaching non-word with mouse, touch and keyboard, locally", () => {
  const chapter = getTutorialChapter("three-words");
  const prepared = prepareTutorialRound(chapter, 1);
  const target = getTutorialTarget(chapter, chapter.steps.find(step => step.word === "ribre"));
  const ref = current => ({ current });
  for (const inputMode of ["mouse", "touch", "keyboard"]) {
    let slots = createDailyWordSlots();
    const sounds = [], messages = [], network = [];
    const engine = createWordSubmissionEngine({
      inputLockedRef: ref(false), appViewRef: ref("training"), isDailyPlayRef: ref(false),
      standaloneTrainingSessionRef: ref(prepared), isSpecial3WordsMode: true, isLiveSpecial3WordsMode: true,
      board: prepared.grid, specialScoreConfig: prepared.plan, dailyWordSlots: slots, dailyActiveSlot: 0,
      dailySpecialPlacements: { M3: 7 }, dictionary: new Set(prepared.solutions.map(entry => entry.word)),
      currentTilesRef: ref(["R", "I", "B", "R", "E"]), highlightPathRef: ref(target.path),
      keyboardRecallSubmittedWordRef: ref(false), isMobileLayoutRef: ref(inputMode === "touch"),
      lastInputModeRef: ref(inputMode), isTouchDeviceRef: ref(inputMode === "touch"),
      roundStats: prepared.quality, bestGridMaxLenRef: ref(prepared.quality.maxLen),
      socket: { connected: true, emit: (...args) => network.push(args) }, roundIdRef: ref(prepared.sessionId),
      setDailyWordSlots: next => { slots = next; }, setDailyActiveSlot: () => {}, setDailyInvalidSlot: () => {},
      setDailyInvalidPulseKey: () => {}, setHighlightPath: () => {}, clearSelection: () => {},
      playScoreSound: points => sounds.push(points), playOneShotAudio: () => {},
      setStatusMessageWithHold: text => messages.push(text), error: message => assert.fail(message),
    });
    engine.submit();
    assert.equal(slots[0].word, "ribre", inputMode);
    assert.equal(sounds.length, 1, "the real scoring sound runs");
    assert.ok(sounds[0] > 0);
    assert.match(messages[0], /^\+\d+ pts$/);
    assert.deepEqual(network, [], "neither tutorial slots nor placements may reach the live round");
    engine.syncLiveSpecial3WordsState(slots, { M3: 7 });
    assert.deepEqual(network, []);
    const result = buildTutorialResults(prepared, { wordSlots: slots, specialPlacements: { M3: 7 } });
    assert.equal(result.threeWordReview.wordReview[0].reason, "not_in_dictionary");
    assert.equal(result.players.find(entry => !entry.isBot).score, 0);
  }
});
