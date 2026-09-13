import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import { normalizeWord } from "../../components/gameLogic.js";
import { getTutorialChapter, getTutorialTarget, TUTORIAL_CHAPTERS } from "./tutorialScenarios.js";
import { buildTutorialResults, prepareTutorialRound } from "./tutorialPreparedRounds.js";
import { buildTutorialPresenterEvents } from "./tutorialPresenters.js";

export const isDirectResultsStep = (step) => step.phase === "results" && ["ranking", "words", "finders", "definition"].includes(step.kind);
const isPlayStep = (step) => ["word", "slot", "placement", "practice"].includes(step.kind) || step.allowPlay;

export const tutorialStorageKey = (identity = "guest") => `gobble:guided-tutorial:v2:${identity}`;
export function readTutorialProgress(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem(key) || "null");
    return value?.version === 2 ? TUTORIAL_CHAPTERS.filter((chapter) => value.completed?.includes(chapter.id)).map((chapter) => chapter.id) : [];
  } catch (_) { return []; }
}

export function createTutorialSession({ game, storage, storageKey = tutorialStorageKey(), setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
  const completed = readTutorialProgress(storage, storageKey);
  const store = createFeatureStore({ screen: completed.includes("basics") ? "hub" : "welcome", chapterId: "basics", stepIndex: 0, completed,
    mode: "briefing", achieved: false, hint: 0, feedback: "", vocabularySeen: false, dismissed: false });
  let prepared = null;
  let finishedResult = null;
  let disposed = false;
  let stopExpiration = null;
  let stopGame = null;
  let stopPresenter = null;
  let lastProgress = "";
  let serial = 0;
  let modeBeforeHelp = "playing";
  const timers = new Set();
  const step = () => getTutorialChapter(store.getState().chapterId).steps[store.getState().stepIndex];
  const later = (callback, delay) => {
    const id = setTimeoutFn(() => { timers.delete(id); if (!disposed) callback(); }, delay);
    timers.add(id);
  };
  const clearTimers = () => { for (const id of timers) clearTimeoutFn(id); timers.clear(); };
  const pause = () => { stopExpiration?.(); stopExpiration = null; game.pause(); };
  const save = () => { try { storage?.setItem(storageKey, JSON.stringify({ version: 2, completed: store.getState().completed })); } catch (_) {} };
  const result = (final = false) => finishedResult || buildTutorialResults(prepared, game.read(), { final });

  function enter(index) {
    clearTimers();
    pause();
    const chapter = getTutorialChapter(store.getState().chapterId);
    const current = chapter.steps[index];
    game.lock(true);
    store.patch({ stepIndex: index, mode: isDirectResultsStep(current) ? "acting" : "briefing", achieved: current.kind === "read", hint: 0, feedback: "", vocabularySeen: false });
    if (current.kind === "presenter") {
      game.present(buildTutorialPresenterEvents(prepared));
    }
    if (current.id === "to-results" || current.allowPlay) game.lock(false);
    if (current.autoBegin) begin();
    observe();
  }

  function startChapter(id) {
    if (disposed) return false;
    clearTimers();
    pause();
    const chapter = getTutorialChapter(id);
    prepared = prepareTutorialRound(chapter, ++serial);
    finishedResult = null;
    store.patch({ chapterId: chapter.id, stepIndex: 0, screen: "lesson", mode: "transition", achieved: false, dismissed: false });
    if (!game.start(prepared)) { store.patch({ screen: "welcome", feedback: "La grille n’a pas pu démarrer. Réessaie dans un instant." }); return false; }
    lastProgress = "";
    // React mounts the unchanged game scene before targets and presenter hosts are measured.
    later(() => { game.seedRanking(result()); enter(0); }, 260);
    return true;
  }

  function observe() {
    const state = store.getState();
    if (disposed || state.screen !== "lesson" || ["transition", "help"].includes(state.mode) || !prepared) return;
    const snapshot = game.read();
    const progressKey = `${snapshot.score}:${snapshot.accepted?.join(",") || ""}`;
    if (progressKey !== lastProgress) { lastProgress = progressKey; game.seedRanking(result()); }
    const current = step();
    if (state.achieved) {
      if (current.kind === "definition" && !snapshot.definitionWord) {
        advance();
        game.closeWordInfo?.();
      }
      return;
    }
    const target = getTutorialTarget(getTutorialChapter(state.chapterId), current);
    let achieved = false;
    if (current.kind === "word") achieved = !!target && snapshot.accepted?.includes(target.word);
    if (current.kind === "slot") achieved = snapshot.wordSlots?.some(slot => slot.word === current.word);
    if (current.kind === "placement") achieved = Object.entries(current.placements).every(([bonus, index]) => snapshot.specialPlacements?.[bonus] === index);
    if (current.kind === "ranking") achieved = snapshot.rankingMode === "total" || snapshot.resultsPage === "total";
    if (current.kind === "words") achieved = snapshot.mobile ? snapshot.resultsPage === "all" : snapshot.showAllWords;
    if (current.kind === "finders") achieved = normalizeWord((snapshot.mobile ? snapshot.wordInfoWord : snapshot.analysisWord) || "") === current.word;
    if (current.kind === "definition") achieved = normalizeWord(snapshot.definitionWord || "") === current.word;
    if (current.kind === "vocabulary") {
      if (snapshot.vocabOpen && !state.vocabularySeen) store.set("vocabularySeen", true);
      achieved = state.vocabularySeen && !snapshot.vocabOpen;
    }
    if (!achieved) return;
    game.lock(true);
    store.patch({ achieved: true, mode: current.kind === "word" ? "celebrating" : isDirectResultsStep(current) ? "acting" : "success" });
    if (current.kind === "word") later(() => store.set("mode", "success"), target.word.length >= 8 ? 2800 : 650);
    if (["slot", "placement"].includes(current.kind)) {
      store.set("mode", "celebrating");
      later(() => advance(), 900);
    }
    if (["ranking", "words", "finders", "vocabulary"].includes(current.kind)) later(() => advance(), current.kind === "finders" ? 0 : 450);
  }

  function begin() {
    const current = step();
    game.sound();
    if (current.kind === "vocabulary") {
      store.set("mode", "watching");
      game.vocabulary(game.read().accepted || []);
      return;
    }
    if (isPlayStep(current)) {
      store.patch({ mode: "playing", hint: current.guidePath ? 3 : 0 });
      game.lock(false);
      if (current.kind === "practice") stopExpiration = game.play(current.duration, finishPractice);
    } else store.set("mode", "acting");
  }

  function finishPractice() {
    pause();
    store.set("achieved", true);
    advance();
  }

  function advance({ skip = false } = {}) {
    const state = store.getState();
    if (disposed || state.screen !== "lesson" || state.mode === "transition" || (!skip && (state.mode === "help" || !state.achieved))) return false;
    const chapter = getTutorialChapter(state.chapterId);
    const current = step();
    if (skip) store.set("dismissed", true);
    game.sound();
    if (state.stepIndex === chapter.steps.length - 1) {
      if (!store.getState().dismissed) store.set("completed", (previous) => [...new Set([...previous, chapter.id])]);
      save();
      goToHub();
      return true;
    }
    if (current.finishRound || current.kind === "practice") {
      game.lock(true);
      store.set("mode", "transition");
      later(() => {
        finishedResult = result(true);
        game.finish(finishedResult);
        later(() => enter(state.stepIndex + 1), 380);
      }, 180);
    } else enter(state.stepIndex + 1);
    return true;
  }

  function hint() {
    store.set("hint", 3);
    if (store.getState().mode === "help") resume();
  }
  function openHelp() {
    modeBeforeHelp = store.getState().mode;
    pause();
    game.lock(true);
    store.set("mode", "help");
  }
  function resume() {
    store.set("mode", modeBeforeHelp);
    if (store.getState().achieved && ["ranking", "words", "finders"].includes(step().kind)) { advance(); return; }
    if (isPlayStep(step()) || step().id === "to-results") game.lock(false);
    if (step().kind === "practice") stopExpiration = game.play(Math.max(1, game.remaining()), finishPractice);
    observe();
  }
  function goToHub() { clearTimers(); pause(); game.lock(true); store.patch({ screen: "hub", mode: "briefing" }); }
  function activate() {
    disposed = false;
    if (!stopGame) stopGame = game.store.subscribe(observe);
    if (!stopPresenter) stopPresenter = game.onPresenter(() => {
      if (store.getState().screen === "lesson" && step().kind === "presenter") {
        store.patch({ achieved: true, mode: "watching" });
        later(() => advance(), 4200);
      }
    });
  }
  function dispose() { disposed = true; clearTimers(); pause(); stopGame?.(); stopGame = null; stopPresenter?.(); stopPresenter = null; }
  function closeRecap() {
    if (step().kind !== "recap") return;
    store.set("achieved", true);
    advance();
  }
  return { store, activate, dispose, startChapter, begin, advance, hint, openHelp, resume, finishPractice, goToHub, closeRecap,
    getTarget: () => {
      const chapter = getTutorialChapter(store.getState().chapterId);
      return step().kind === "practice" ? prepared.solutions.find((entry) => entry.word.length >= 3 && entry.word.length <= 5 && !game.read().accepted?.includes(entry.word)) : ["word", "slot", "placement"].includes(step().kind) ? getTutorialTarget(chapter, step()) : null;
    },
  };
}
