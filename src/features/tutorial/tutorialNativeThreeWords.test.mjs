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

test("three-word maximum-length submissions stay provisional in live, daily and training", () => {
  const chapter = getTutorialChapter("three-words");
  const prepared = prepareTutorialRound(chapter, 1);
  const nonWord = getTutorialTarget(chapter, chapter.steps.find(step => step.word === "ribre"));
  const longestWord = prepared.solutions.find(entry => entry.word.length === prepared.quality.maxLen);
  const ref = current => ({ current });

  for (const mode of ["live", "daily", "training"]) {
    for (const inputMode of ["mouse", "touch", "keyboard"]) {
      for (const target of [longestWord, nonWord]) {
        for (const maximumSource of ["round-stats", "grid-fallback"]) {
          let slots = createDailyWordSlots();
          const feedback = [], network = [];
          const label = `${mode}, ${inputMode}, ${target.word}, ${maximumSource}`;
          const engine = createWordSubmissionEngine({
            inputLockedRef: ref(false), appViewRef: ref(mode), isDailyPlayRef: ref(mode === "daily"),
            standaloneTrainingSessionRef: ref(mode === "training" ? prepared : null),
            isSpecial3WordsMode: true, isLiveSpecial3WordsMode: mode !== "daily",
            board: prepared.grid, specialScoreConfig: prepared.plan, dailyWordSlots: slots, dailyActiveSlot: 0,
            dailySpecialPlacements: {}, dictionary: new Set(prepared.solutions.map(entry => entry.word)),
            currentTilesRef: ref([target.word.toUpperCase()]), highlightPathRef: ref(target.path),
            keyboardRecallSubmittedWordRef: ref(false), isMobileLayoutRef: ref(inputMode === "touch"),
            lastInputModeRef: ref(inputMode), isTouchDeviceRef: ref(inputMode === "touch"),
            roundStats: maximumSource === "round-stats" ? { maxLen: target.word.length } : {},
            bestGridMaxLenRef: ref(target.word.length),
            socket: { connected: true, emit: (...args) => network.push(args) }, roundIdRef: ref("three-words-round"),
            setDailyWordSlots: next => { slots = next; }, setDailyActiveSlot: () => {}, setDailyInvalidSlot: () => {},
            setDailyInvalidPulseKey: () => {}, setHighlightPath: () => {}, clearSelection: () => {},
            playScoreSound: points => feedback.push(["score", points]),
            setStatusMessageWithHold: text => feedback.push(["status", text]),
            playGobbleVoice: () => feedback.push(["gobble"]),
            playDoubleGobbleVoice: () => feedback.push(["doubleGobble"]),
            triggerPraiseFlash: (...args) => feedback.push(["praise", ...args]),
            triggerConfettiBurst: (...args) => feedback.push(["confetti", ...args]),
            playOneShotAudio: () => assert.fail(`Unexpected invalid sound: ${label}`),
            error: message => assert.fail(`${label}: ${message}`),
          });
          engine.submit();
          assert.equal(slots[0].word, target.word, label);
          assert.equal(feedback.length, 2, `Only ordinary scoring feedback: ${label}`);
          assert.equal(feedback[0][0], "score", label);
          assert.ok(feedback[0][1] > 0, label);
          assert.deepEqual(feedback[1], ["status", `+${feedback[0][1]} pts`], label);
          assert.equal(network.length, mode === "live" ? 1 : 0, label);
          if (mode === "live") {
            assert.equal(network[0][0], "special3Words:update", label);
            assert.equal(network[0][1].wordSlots[0].word, target.word, label);
          }
        }
      }
    }
  }
});
