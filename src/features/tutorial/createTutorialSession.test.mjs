import test from "node:test";
import assert from "node:assert/strict";
import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import { computeScore, scoreWordOnGridWithPath } from "../../components/gameLogic.js";
import { createTutorialSession, readTutorialProgress, tutorialStorageKey } from "./createTutorialSession.js";
import { buildTutorialResults, prepareTutorialRound } from "./tutorialPreparedRounds.js";
import { TUTORIAL_CHAPTERS, TUTORIAL_PACKS, getTutorialTarget } from "./tutorialScenarios.js";
import { buildTutorialPresenterEvents, TUTORIAL_PRESENTERS } from "./tutorialPresenters.js";
import { resolveTutorialThreeWords } from "./tutorialThreeWordsResults.js";
import { applyDailySpecialPlacements } from "../../components/daily/dailySpecialModel.js";
import { readFile } from "node:fs/promises";

function harness() {
  const store = createFeatureStore({ phase: "lobby", accepted: [], score: 0, mobile: false });
  const timers = new Map();
  const values = new Map();
  let id = 0, presenterListener, expired, locked = false, seedCount = 0, lastSeed, finished;
  const game = {
    store, read: () => ({ ...store.getState(), nick: "Toi", elapsedMs: 5000 }),
    start: () => { store.patch({ phase: "playing", accepted: [], score: 0 }); return true; },
    seedRanking: (result) => { seedCount++; lastSeed = result; },
    finish: (result) => { finished = result; store.patch({ phase: "results", threeWordReview: result.threeWordReview }); },
    vocabulary: () => store.set("vocabOpen", true),
    closeWordInfo: () => store.set("wordInfoWord", ""),
    onPresenter: (fn) => { presenterListener = fn; return () => { presenterListener = null; }; },
    lock: (value) => { locked = value; }, pause: () => {},
    play: (_, fn) => { expired = fn; return () => { expired = null; }; }, remaining: () => 11,
    sound: () => {}, present: () => {},
  };
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const session = createTutorialSession({ game, storage, setTimeoutFn: (fn) => { timers.set(++id, fn); return id; }, clearTimeoutFn: (key) => timers.delete(key) });
  session.activate();
  const flush = () => { let count = 0; while (timers.size) { if (++count > 50) throw new Error("Timer loop"); const [key, fn] = timers.entries().next().value; timers.delete(key); fn(); } };
  return { session, game, store, storage, timers, flush, presenter: () => presenterListener?.(), expire: () => expired?.(), locked: () => locked, seedCount: () => seedCount, lastSeed: () => lastSeed, finished: () => finished };
}

test("the introduction uses only three distinct words, including a twelve-letter double Gobble", () => {
  const chapter = TUTORIAL_CHAPTERS[0];
  const actions = chapter.steps.filter((step) => step.kind === "word");
  assert.deepEqual(actions.map((step) => step.word), ["arme", "quad", "quadrilatere"]);
  assert.ok(actions.every((step) => step.guidePath), "all three words have a path, including QUAD");
  assert.ok(!TUTORIAL_CHAPTERS.some((chapter) => chapter.id === "finale"));
  const target = getTutorialTarget(chapter, actions[2]);
  assert.equal(target.word.length, 12);
  assert.equal(target.pts, 300);
  assert.equal(Math.max(...TUTORIAL_PACKS.discovery.solutions.map((entry) => entry.word.length)), 12);
  assert.equal(TUTORIAL_PACKS.discovery.solutions[0].word, target.word);
});

test("all scripted targets and saved solutions are traceable with the real game rules", () => {
  for (const chapter of TUTORIAL_CHAPTERS) for (const step of chapter.steps) {
    const target = getTutorialTarget(chapter, step);
    if (!target) { assert.ok(!step.word, step.id); continue; }
    assert.ok(scoreWordOnGridWithPath(target.word, TUTORIAL_PACKS[chapter.board].grid, target.path, chapter.special), step.id);
  }
  for (const pack of Object.values(TUTORIAL_PACKS)) for (const entry of pack.solutions) {
    assert.equal(scoreWordOnGridWithPath(entry.word, pack.grid, entry.path, pack.special)?.pts, entry.pts, entry.word);
  }
});

test("prepared rounds contain complete solutions, training metadata and the variant score", () => {
  for (const chapter of TUTORIAL_CHAPTERS) {
    const prepared = prepareTutorialRound(chapter, 1);
    assert.equal(prepared.tutorial, true);
    for (const entry of prepared.solutions) {
      assert.equal(entry.pts, chapter.special?.fixedWordScore ?? computeScore(entry.word, entry.path, prepared.grid, prepared.plan));
    }
    if (chapter.id.startsWith("target-")) assert.ok(prepared.targetWord);
    if (chapter.id === "massive") assert.equal(buildTutorialResults(prepared, { accepted: [], score: 0 }).tournament.round, 3);
  }
});

test("Faux jumeaux teaches both readings on distinct paths, with the real word bonus and objective", () => {
  const chapter = TUTORIAL_CHAPTERS.find(chapter => chapter.id === "twins");
  const prepared = prepareTutorialRound(chapter, 1);
  const targets = chapter.steps.filter(step => step.kind === "word").map(step => getTutorialTarget(chapter, step));
  assert.deepEqual(targets.map(entry => entry.word), ["bras", "perle"]);
  assert.notDeepEqual(targets[0].path, targets[1].path);
  assert.deepEqual(targets.map(entry => entry.fakeTwinsResolvedLetter), ["B", "P"]);
  for (const target of targets) assert.equal(target.pts - computeScore(target.word, target.path, prepared.grid), 50);
  const total = prepared.solutions.filter(entry => entry.usedFakeTwins).length;
  assert.equal(prepared.quality.fakeTwinWords, total);
  assert.equal(prepared.quality.fakeTwinCompletionTarget, Math.ceil(total * 0.4));
});

test("3 mots keeps the false word provisional, then validates the final paths and placements", async () => {
  const chapter = TUTORIAL_CHAPTERS.find(chapter => chapter.id === "three-words");
  const prepared = prepareTutorialRound(chapter, 1);
  const dictionary = new Set((await readFile(new URL("../../../public/dico.txt", import.meta.url), "utf8")).toLowerCase().split(/\r?\n/).map(word => word.trim()));
  assert.equal(dictionary.has("ribre"), false, "the deliberate non-word must stay outside the real dictionary");
  const wordSlots = ["zebre", "tirer", "ribre"].map(word => {
    const step = chapter.steps.find(step => step.word === word);
    const target = getTutorialTarget(chapter, step);
    assert.equal(prepared.solutions.some(entry => entry.word === word), word !== "ribre");
    return { word, path: target.path };
  });
  const specialPlacements = { L3: 0, L2: 2, M2: 3, M3: 7 };
  const snapshot = { nick: "Paul", wordSlots, specialPlacements };
  const live = resolveTutorialThreeWords(prepared, snapshot);
  assert.equal(live.accepted.length, 3);
  assert.equal(live.wordReview, null, "no dictionary verdict during play");
  assert.ok(live.wordScores.get("ribre") > 0);
  const provisional = buildTutorialResults(prepared, snapshot, { final: false });
  assert.equal(provisional.threeWordReview, undefined);
  assert.equal(provisional.players.find(entry => !entry.isBot).words.includes("ribre"), true);
  const final = buildTutorialResults(prepared, snapshot);
  const learner = final.players.find(entry => !entry.isBot);
  assert.deepEqual(learner.words, ["zebre", "tirer"]);
  assert.equal(learner.score, live.score - live.wordScores.get("ribre"));
  assert.deepEqual(final.threeWordReview.wordReview[2], { word: "ribre", valid: false, reason: "not_in_dictionary", points: 0 });
  assert.deepEqual(learner.specialPlacements, specialPlacements);
  assert.deepEqual(learner.specialWordSlots.map(slot => slot.path), wordSlots.slice(0, 2).map(slot => slot.path));
  const grid = applyDailySpecialPlacements(prepared.grid, specialPlacements);
  assert.equal(learner.wordScores.tirer, computeScore("tirer", wordSlots[1].path, grid));
  assert.ok(learner.wordScores.tirer > computeScore("tire", chapter.steps[1].path, grid));
  assert.equal(learner.gobbles, 0, "a score bonus must not create a best-score Gobble in 3 mots");
});

test("the 3 mots workshop follows native slots, bonus dragging, replacement and the animated recap", () => {
  const h = harness();
  const chapter = TUTORIAL_CHAPTERS.find(chapter => chapter.id === "three-words");
  const prepared = prepareTutorialRound(chapter, 1);
  const slots = [];
  const submit = (word, index) => {
    const target = getTutorialTarget(chapter, chapter.steps.find(step => step.word === word));
    slots[index] = { word, path: target.path };
    const resolved = resolveTutorialThreeWords(prepared, { wordSlots: [...slots], specialPlacements: h.store.getState().specialPlacements });
    h.store.patch({ wordSlots: [...slots], accepted: resolved.accepted, score: resolved.score });
    h.flush();
  };
  h.session.startChapter(chapter.id); h.flush(); h.session.begin();
  h.store.set("accepted", ["zebre"]);
  assert.equal(h.session.store.getState().achieved, false, "wait for the actual native word slot");
  submit("zebre", 0);
  assert.equal(h.session.store.getState().stepIndex, 1);
  assert.equal(h.locked(), false, "the next trace starts without another confirmation");
  submit("tire", 1);
  h.store.set("specialPlacements", { M3: 1 }); h.flush();
  assert.equal(h.session.store.getState().stepIndex, 2, "a different E is not on both taught paths");
  h.store.set("specialPlacements", { M3: 7 }); h.flush();
  assert.equal(h.session.store.getState().stepIndex, 3);
  slots[1] = { word: "", path: [] };
  h.store.set("wordSlots", [...slots]); h.flush();
  assert.equal(h.session.store.getState().achieved, false, "deleting TIRE alone does not finish the replacement exercise");
  submit("tirer", 1);
  submit("ribre", 2);
  assert.equal(h.session.store.getState().stepIndex, 5);
  h.session.begin(); h.session.openHelp(); h.session.resume();
  assert.equal(h.locked(), false);
  h.session.advance(); h.flush();
  assert.equal(h.session.store.getState().stepIndex, 6);
  assert.equal(h.finished().threeWordReview.wordReview[2].points, 0);
  h.store.patch({ wordSlots: [], specialPlacements: {}, accepted: ["zebre", "tirer"], score: 81 });
  assert.equal(h.lastSeed(), h.finished(), "the final result survives the native reset of the playing slots");
  h.session.closeRecap();
  assert.equal(h.session.store.getState().stepIndex, 7);
  h.session.advance();
  assert.deepEqual(h.session.store.getState().completed, [chapter.id]);
  h.session.dispose();
  assert.equal(h.timers.size, 0);
});

test("the controller waits for words accepted by the real engine and does not award scores", () => {
  const h = harness();
  h.session.startChapter("basics"); h.flush();
  assert.equal(h.session.advance(), false);
  assert.equal(h.locked(), true);
  h.session.begin(); assert.equal(h.locked(), false);
  h.store.patch({ accepted: ["quad"], score: 21 });
  assert.equal(h.session.store.getState().achieved, false);
  h.store.patch({ accepted: ["quad", "arme"], score: 26 }); h.flush();
  assert.equal(h.session.store.getState().achieved, true);
  assert.equal(h.store.getState().score, 26);
  h.session.advance(); h.flush();
  assert.equal(h.session.store.getState().stepIndex, 1);
  assert.equal(h.session.store.getState().achieved, true, "a word already found does not need tracing again");
});

test("the complete base journey uses native vocabulary, ranking, word and definition actions", () => {
  const h = harness();
  const chapter = TUTORIAL_CHAPTERS[0];
  h.session.startChapter(chapter.id); h.flush();
  for (const [index, step] of chapter.steps.entries()) {
    assert.equal(h.session.store.getState().stepIndex, index, step.id);
    if (step.kind === "word") {
      h.session.begin();
      h.store.patch({ accepted: [...h.store.getState().accepted, step.word], score: h.store.getState().score + getTutorialTarget(chapter, step).pts });
    }
    if (step.kind === "presenter") h.presenter();
    if (step.kind === "vocabulary") { h.session.begin(); h.store.set("vocabOpen", false); }
    if (step.kind === "ranking") h.store.set("rankingMode", "total");
    if (step.kind === "words") h.store.set("showAllWords", true);
    if (step.kind === "finders") h.store.set("analysisWord", "arme");
    if (step.kind === "definition") {
      h.store.set("definitionWord", "arme"); h.flush();
      assert.equal(h.session.store.getState().screen, "lesson", "keep the definition readable until it closes");
      h.store.set("definitionWord", "");
    }
    h.flush();
    if (step.kind === "word" || step.kind === "read") { assert.equal(h.session.advance(), true, step.id); h.flush(); }
    else if (step.kind !== "definition") assert.equal(h.session.store.getState().stepIndex, index + 1, "native action advances without another tutorial button");
  }
  assert.equal(h.session.store.getState().screen, "hub");
  assert.deepEqual(readTutorialProgress(h.storage, tutorialStorageKey()), ["basics"]);
});

test("results retain the learner's actual words, score and Gobbles", () => {
  const prepared = prepareTutorialRound(TUTORIAL_CHAPTERS[0], 1);
  const words = ["arme", "quad", "quadrilatere"];
  const scores = new Map([["arme", 5], ["quad", 25], ["quadrilatere", 300]]);
  const result = buildTutorialResults(prepared, { nick: "Paul", accepted: words, score: 330, wordScores: scores });
  const self = result.players.find((entry) => entry.nick === "Paul");
  assert.equal(self.score, 330);
  assert.deepEqual(self.words, words, "native results require an array of strings");
  assert.deepEqual(self.wordScores, Object.fromEntries(scores));
  assert.equal(Object.values(self.wordScores).reduce((sum, pts) => sum + pts, 0), self.score);
  assert.equal(self.gobbles, 2);
  assert.equal(result.roundAwarded.Paul.total, 12);
});

test("leaving cancels tutorial timers and subscriptions; skipped chapters are not completed", () => {
  const h = harness(); h.session.startChapter("speed"); h.flush();
  h.session.advance({ skip: true }); h.session.begin();
  h.session.openHelp(); assert.equal(h.session.store.getState().mode, "help");
  h.session.resume(); h.expire(); h.flush();
  assert.equal(h.store.getState().phase, "results");
  h.session.advance();
  assert.deepEqual(h.session.store.getState().completed, []);
  h.session.startChapter("basics"); h.session.dispose();
  assert.equal(h.timers.size, 0);
  assert.equal(h.session.startChapter("gold"), false);
});

test("speed keeps the long Gobble; target rounds award only players who found the target", () => {
  const speed = prepareTutorialRound(TUTORIAL_CHAPTERS.find((entry) => entry.id === "speed"), 1);
  const longest = speed.solutions.find((entry) => entry.word.length === speed.quality.maxLen);
  const speedResult = buildTutorialResults(speed, { nick: "Lina", accepted: [longest.word], score: 11 });
  assert.equal(speedResult.roundAwarded.Lina.gobbles, 1);
  assert.equal(new Set(speedResult.players.map((entry) => entry.nick)).size, speedResult.players.length);
  const prepared = prepareTutorialRound(TUTORIAL_CHAPTERS.find((entry) => entry.id === "target-long"), 2);
  const result = buildTutorialResults(prepared, { nick: "Paul", accepted: [prepared.targetWord], score: 28, elapsedMs: 4321 });
  const self = result.players.find((entry) => entry.nick === "Paul");
  assert.equal(self.targetFoundMs, 4321);
  assert.equal(self.targetFoundAt, 4321);
  assert.equal(result.roundAwarded.Paul.gobbles, 0);
  assert.equal(result.roundAwarded.Paul.total, 10);
  assert.equal(result.roundAwarded.Lina.total, 0);
  assert.equal(result.roundAwarded.Oscar.total, 0);
  assert.deepEqual(result.players.find((entry) => entry.nick === "Lina").words, []);
});

test("invalid or blocked local storage does not block the introduction", () => {
  assert.deepEqual(readTutorialProgress({ getItem: () => { throw Error("blocked"); } }, "x"), []);
  assert.deepEqual(readTutorialProgress({ getItem: () => '{"version":2,"completed":["unknown","basics"]}' }, "x"), ["basics"]);
});

test("mobile results follow native swipes, word info and definition without confirmation cards", () => {
  const h = harness(); h.store.set("mobile", true); h.session.startChapter("basics"); h.flush();
  while (h.session.store.getState().stepIndex < 8) { h.session.advance({ skip: true }); h.flush(); }
  assert.equal(h.session.store.getState().mode, "acting");
  h.store.set("resultsPage", "total"); h.session.openHelp(); h.flush();
  assert.equal(h.session.store.getState().stepIndex, 8, "pending transitions wait while help is open");
  h.session.resume(); h.flush();
  assert.equal(h.session.store.getState().stepIndex, 9);
  h.store.set("resultsPage", "found"); h.flush();
  assert.equal(h.session.store.getState().stepIndex, 9, "show found words before continuing to all");
  h.session.openHelp(); h.store.set("resultsPage", "all"); h.flush();
  assert.equal(h.session.store.getState().mode, "help", "help pauses guidance while open");
  h.session.resume(); h.flush();
  assert.equal(h.session.store.getState().stepIndex, 10);
  h.store.set("wordInfoWord", "arme"); h.flush();
  assert.equal(h.session.store.getState().stepIndex, 11);
  h.store.set("definitionWord", "arme"); h.flush();
  assert.equal(h.session.store.getState().screen, "lesson");
  h.store.set("definitionWord", ""); h.flush();
  assert.equal(h.session.store.getState().screen, "hub");
  assert.equal(h.store.getState().wordInfoWord, "");
});

test("Gobbello gives a real suffix clue, and presenters use their game names", () => {
  assert.deepEqual(TUTORIAL_PRESENTERS.map(({ name }) => name), ["Laurent Rhum&Co", "Julien Lechéper", "Maître Gobbello"]);
  const prepared = prepareTutorialRound(TUTORIAL_CHAPTERS[0], 1);
  const event = buildTutorialPresenterEvents(prepared).find(({ meta }) => meta.category === "coach");
  const suffix = event.text.match(/terminaison -([a-z]+)/)[1];
  const words = prepared.solutions.filter(({ word }) => word.length >= suffix.length + 2 && word.endsWith(suffix));
  assert.equal(words.length, 3);
  assert.ok(event.text.includes(`${words.length} mots possibles`));
  assert.equal(event.nick, "Maître Gobbello");
});
