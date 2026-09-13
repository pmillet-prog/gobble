import React from "react";
import { createFeatureStore } from "../../app/core/createFeatureStore.js";

// The tutorial owns instructions only. Commands below enter the application's
// existing round, vocabulary and results controllers; no alternate game view,
// input handler, scoring engine, audio pipeline or results UI is created.
export default function useTutorialGameBridge(runtime) {
  const current = React.useRef(runtime);
  current.current = runtime;
  const [bridge] = React.useState(() => {
    const store = createFeatureStore({});
    let originalNick = null;
    let startedAt = 0;
    let ownsRound = false;
    let tutorialSession = null;
    const api = {
      store,
      getSession(factory) { if (!tutorialSession) tutorialSession = factory(); return tutorialSession; },
      disposeSession() { tutorialSession?.dispose(); tutorialSession = null; },
      read() {
        const r = current.current;
        const progress = r.progressFeature.store.getState();
        return { ...store.getState(), ...progress, wordSlots: r.dailyWordSlots, specialPlacements: r.dailySpecialPlacements, nick: r.nicknameRef.current || "Toi", paths: r.dailyAcceptedPathsRef.current, wordMeta: r.acceptedWordMetaRef.current, wordScores: r.acceptedScoresRef.current, elapsedMs: Date.now() - startedAt };
      },
      start(prepared) {
        const r = current.current;
        if (originalNick === null) originalNick = r.nicknameRef.current;
        if (!r.nicknameRef.current?.trim()) { r.nicknameRef.current = "Toi"; r.setNickname("Toi"); }
        r.clearSelection();
        store.set("threeWordReview", null);
        startedAt = Date.now();
        ownsRound = true;
        return r.standaloneTrainingFeature.startPreparedSession(prepared);
      },
      seedRanking(result) {
        const r = current.current;
        r.rosterFeature.setPlayers(result.players);
        r.rosterFeature.setProvisionalRanking(result.players);
        r.setTournament(result.tournament);
        r.setTournamentRoundPoints(result.roundAwarded);
        r.setTournamentRanking(result.ranking);
      },
      finish(result) {
        const r = current.current;
        r.clearSelection();
        r.finishStandaloneTraining({ skipAutoSubmit: true });
        if (result.threeWordReview) {
          const learner = result.players.find(player => !player.isBot);
          r.acceptedScoresRef.current = new Map(Object.entries(learner.wordScores));
          r.dailyAcceptedPathsRef.current = new Map(learner.specialWordSlots.map(slot => [slot.word, { path: slot.path }]));
          r.acceptedRef.current = learner.words;
          r.acceptedWordSetRef.current = new Set(learner.words);
          r.progressFeature.setAccepted(learner.words);
          r.progressFeature.setScore(learner.score);
          store.set("threeWordReview", result.threeWordReview);
        }
        r.setFinalResults(result.players);
        api.seedRanking(result);
      },
      vocabulary(words) {
        current.current.startVocabOverlayAnimation({ baseCount: 0, targetCount: words.length, deltaCount: words.length, weeklyBaseCount: 0, weeklyTargetCount: words.length, weeklyDeltaCount: words.length, words, seasonWords: words });
      },
      present(events) {
        const r = current.current;
        r.presentersFeature.hydrateInterventions(events);
      },
      onPresenter(listener) { return current.current.presentersFeature.subscribeRequests("capello", listener); },
      closeWordInfo: () => current.current.closeWordInfoModal(),
      lock(value) {
        const r = current.current;
        r.inputLockedRef.current = value;
        r.setInputLocked(value);
        if (value && r.phase === "playing") r.clearSelection();
      },
      pause() { current.current.clockFeature.stop({ preserveRemaining: true }); },
      play(seconds, onExpired) {
        const r = current.current;
        const cleanup = r.clockFeature.onExpired(onExpired);
        const now = r.getNowServerMs();
        r.clockFeature.startRound({ deadlineServerMs: now + seconds * 1000, serverNowMs: now, maxSeconds: seconds });
        return cleanup;
      },
      remaining: () => current.current.clockFeature.store.getState().remainingSeconds,
      gameRefs: () => ({ grid: current.current.gridRef, tiles: current.current.tileRefs, header: current.current.mobileHeaderRef, ranking: current.current.mobileRankingRef }),
      returnToMenu() {
        const r = current.current;
        r.stopVocabOverlayAnimation();
        r.closeDefinition();
        r.closeWordInfoModal();
        if (ownsRound) {
          r.standaloneTrainingFeature.clearSession();
          r.returnToLobby();
          ownsRound = false;
        }
        if (originalNick !== null) { r.nicknameRef.current = originalNick; r.setNickname(originalNick); originalNick = null; }
      },
      sound: () => current.current.playUiClickSound?.(),
    };
    return api;
  });
  React.useLayoutEffect(() => {
    if (!runtime.open) return;
    bridge.store.patch({
      phase: runtime.phase, mobile: runtime.isMobileLayout, darkMode: runtime.darkMode,
      gridRotationTurns: runtime.gridRotationTurns,
      rankingMode: runtime.resultsRankingMode, resultsPage: runtime.mobileResultPages[runtime.mobileResultsPage],
      showAllWords: runtime.showAllWords, analysisWord: runtime.analysis?.word || "",
      wordInfoWord: runtime.wordInfoModal.open ? runtime.wordInfoModal.word : "",
      definitionWord: runtime.definitionModal.open ? runtime.definitionModal.word : "",
      vocabOpen: runtime.isVocabOverlayOpen,
      wordSlots: runtime.dailyWordSlots, specialPlacements: runtime.dailySpecialPlacements,
    });
  });
  React.useEffect(() => {
    if (!runtime.open) return;
    return runtime.progressFeature.store.subscribe(() => {
      const { accepted, score } = runtime.progressFeature.store.getState();
      bridge.store.patch({ accepted, score });
    });
  }, [bridge, runtime.progressFeature, runtime.open]);
  React.useEffect(() => {
    if (!runtime.open) bridge.disposeSession();
  }, [bridge, runtime.open]);
  React.useEffect(() => () => bridge.disposeSession(), [bridge]);
  return bridge;
}
