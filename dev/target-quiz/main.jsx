import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ApplicationRuntimeProvider } from "../../src/app/react/ApplicationRuntimeProvider.jsx";
import TargetQuizPlayground from "../../src/components/targetQuiz/TargetQuizPlayground.jsx";
import AudioPreview, { createPreviewPreferences, installPreviewAudioTrace } from "./AudioPreview.jsx";
import { reloadFeedbackAudio } from "./reloadFeedbackAudio.js";
import { createTargetQuizFeature } from "../../src/features/targetQuiz/createTargetQuizFeature.js";
import useTargetQuizPlacement from "../../src/features/targetQuiz/useTargetQuizPlacement.js";
import TargetQuizRecapSatellite from "../../src/components/targetQuiz/TargetQuizRecapSatellite.jsx";
import TargetQuizBonusBadge from "../../src/components/targetQuiz/TargetQuizBonusBadge.jsx";
import MobileTargetHintPanel from "../../src/components/mobile/MobileTargetHintPanel.jsx";
import ResultsPreview from "./ResultsPreview.jsx";
import MobileRoundPreview from "./MobileRoundPreview.jsx";
import { createCelebrationFeature } from "../../src/features/celebration/createCelebrationFeature.js";
import { CelebrationRuntimeProvider } from "../../src/features/celebration/CelebrationRuntime.jsx";
import GameCelebrationDomOverlay from "../../src/components/GameCelebrationDomOverlay.jsx";
import useTargetQuizTargetSource from "../../src/components/targetQuiz/useTargetQuizTargetSource.js";
import { advanceTargetQuizPoints, normalizeTargetQuizPoints } from "../../shared/targetQuizPoints.js";
import { createNotificationsFeature } from "../../src/features/notifications/createNotificationsFeature.js";
import NotificationToastLayer from "../../src/features/notifications/NotificationToastLayer.jsx";
import ProfileTargetQuiz from "../../src/components/profile/ProfileTargetQuiz.jsx";
import { TARGET_QUIZ_FEEDBACK_MS, TARGET_QUIZ_QUESTION_FADE_MS } from "../../shared/targetQuizTiming.js";
import "../../src/index.css";

// Verbatim questions from data/target-quiz-bank.json (Wiktionary, CC BY-SA / GFDL).
const questions = [
  { id: "q00001", definition: "Qui est en deçà du Pô.(du point de vue de Rome)",
    words: ["samarien", "inexercé", "cispadan", "miscible"],
    spellings: ["cispadan", "cyspadan", "sispadan", "cispaddan"], answerIndices: [2, 0] },
  { id: "q00002", definition: "Nom vernaculaire de certaines espèces d’oiseaux palmipèdes de la famille des anatidés, canards de surface.",
    words: ["érismature", "bioéthique", "dépilement", "bleuissage"],
    spellings: ["érismathure", "érrismature", "érismaturre", "érismature"], answerIndices: [0, 3] },
  { id: "q00620", definition: "Système d’idées antérieur ou postérieur, semblable à celui de Leibnitz: toute théorie qui admet ou qui cherche à démontrer que l’Univers est composé de monades.",
    words: ["monadologie", "évhémérisme", "maïeuticien", "gnoséologie"],
    spellings: ["monadologie", "monadolaugie", "monnadologie", "monadollogie"], answerIndices: [0, 0] },
  { id: "q00013", definition: "État paranoïaque d'un individu incapable de se mettre à la place d'autrui.",
    words: ["syllogomanie", "décompensation", "claustromanie", "psychorigidité"],
    spellings: ["psychoriggidité", "pcychorigidité", "psychorigiddité", "psychorigidité"], answerIndices: [3, 3] },
];
const subscribe = () => () => {};
const feature = state => ({ subscribe, getSnapshot: () => state, store: { subscribe, getState: () => state } });
const preferences = createPreviewPreferences();
const audioTrace = installPreviewAudioTrace();
const quizFeature = createTargetQuizFeature({ scope: { add() {} } });
const celebration = createCelebrationFeature({ scope: { add() {} } });
const notifications = createNotificationsFeature({ scope: { add() {} } });
const features = {
  feed: feature({ announcements: [], lastWords: [] }),
  progress: feature({ score: 0, acceptedCount: 0, foundWordsCount: 0, inputShake: false, statusText: "", bannerText: "La manche cible continue pour les autres joueurs" }),
  clock: feature({ remainingSeconds: 180 }),
  liveUi: feature({ gridShake: false }),
  trace: { ...feature({ highlightPath: [], currentTiles: [] }), registerTraceTile: () => () => {}, isTraceTileHighlighted: () => false },
  presenters: { ...feature({ entries: {} }), setRound() {}, setInterventionHost: () => () => {} },
  roster: feature({ livePlayers: [], liveProvisionalRanking: [] }),
  celebration,
  notifications,
  preferences,
  targetQuiz: quizFeature,
};
const applicationState = { navigation: { view: "live" }, session: { isLoggedIn: false } };
const kernel = { getState: () => applicationState, subscribe, features: { prepare: key => features[key], acquire: () => ({ release() {} }) } };
const now = () => Date.now();
const profiles = { desktop: 820, small: 296, mobile: 366, square: 480 };
const strictPreview = new URLSearchParams(window.location.search).has("strict");
const phonePreview = new URLSearchParams(window.location.search).has("phone");

function readLighting({ checkPixels = false } = {}) {
  const canvas = document.querySelector("canvas.target-quiz-lighting");
  if (!canvas || canvas.hidden || canvas.dataset.state !== "running") return null;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  // Pixel readback is deliberately opt-in: polling it forces canvas/GPU sync.
  const pixels = checkPixels ? canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data : null;
  const protectedAlpha = pixels ? [...document.querySelectorAll(".target-quiz__definition, .target-quiz__choice, .target-quiz__feedback")].map(node => {
    const area = node.getBoundingClientRect();
    const x = Math.max(0, Math.floor((area.left - rect.left + 1) * scaleX));
    const y = Math.max(0, Math.floor((area.top - rect.top + 1) * scaleY));
    const width = Math.max(1, Math.min(canvas.width - x, Math.floor((area.width - 2) * scaleX)));
    const height = Math.max(1, Math.min(canvas.height - y, Math.floor((area.height - 2) * scaleY)));
    let maximum = 0;
    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) {
        maximum = Math.max(maximum, pixels[(row * canvas.width + column) * 4 + 3]);
      }
    }
    return maximum;
  }) : null;
  return { state: canvas.dataset.state, progress: Number(canvas.dataset.progress),
    spots: Number(canvas.dataset.projectorCount), width: rect.width, height: rect.height,
    pointerEvents: getComputedStyle(canvas).pointerEvents, protectedAlpha };
}

function createFixtureSocket(options, roundId, endsAt) {
  let index = 0;
  let feedback = null;
  let nextQuestion = null;
  let latency = Number(options.latency) || 12;
  const log = [];
  const stats = { score: 0, streak: 0, bestStreak: 0, correctCount: 0, wrongCount: 0 };
  const initialPoints = normalizeTargetQuizPoints(options.points);
  let progression = { before: initialPoints, after: initialPoints, steps: [], rewards: [] };
  const listeners = new Map();
  const makeQuestion = (position) => {
    const source = questions[(position + (options.long ? 2 : 0)) % questions.length];
    const mode = (position % 2 ? options.mode !== "spellings" : options.mode === "spellings") ? "spellings" : "words";
    return { id: source.id, questionToken: `${roundId}:${position}`, definition: source.definition,
      mode, choices: source[mode], answerIndex: source.answerIndices[mode === "spellings" ? 1 : 0] };
  };
  let question = makeQuestion(index);
  const publicQuestion = (value) => value ? (({ answerIndex, ...rest }) => rest)(value) : null;
  const settle = () => {
    if (feedback && Date.now() >= feedback.availableAt) {
      question = nextQuestion; nextQuestion = null; feedback = null;
    }
  };
  const view = () => ({ ok: true, roundId, endsAt, phase: feedback ? "feedback" : "question", ...stats, progression,
    question: publicQuestion(question), nextQuestion: publicQuestion(nextQuestion), feedback });
  return {
    connected: true,
    on(event, callback) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(callback); },
    off(event, callback) { listeners.get(event)?.delete(callback); },
    emit(event, payload, ack) {
      log.push({ event, questionToken: payload.questionToken, at: Date.now() });
      settle();
      if (event === "targetQuiz:stop") return;
      if (event === "targetQuiz:dismiss") {
        stats.score = 0; stats.streak = 0; stats.cancelled = true;
        progression = { before: initialPoints, after: initialPoints, steps: [], rewards: [] };
        const response = { ...view(), phase: "stopped" };
        for (const listener of listeners.get("targetQuiz:progress") || []) listener(response);
        setTimeout(() => ack?.(response), latency);
        return;
      }
      if (event === "targetQuiz:answer" && !feedback) {
        const correct = payload.choiceIndex === question.answerIndex;
        stats.streak = correct ? stats.streak + 1 : 0;
        const delta = correct ? Math.min(200, 100 + (stats.streak - 1) * 25) : -75;
        stats.score += delta;
        const progress = advanceTargetQuizPoints(progression.after, delta);
        progression = { before: initialPoints, after: progress.after, steps: [...progression.steps, delta],
          rewards: [...progression.rewards, ...(progress.amount ? [{ amount: progress.amount, balance: 500 + progress.after.cycles * 50, receipt: `${roundId}:${index}` }] : [])] };
        stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
        stats.correctCount += correct ? 1 : 0;
        stats.wrongCount += correct ? 0 : 1;
        const at = Date.now();
        feedback = { questionToken: question.questionToken, selectedIndex: payload.choiceIndex,
          answerIndex: question.answerIndex, correct, delta,
          nextQuestionAt: at + TARGET_QUIZ_QUESTION_FADE_MS, availableAt: at + TARGET_QUIZ_FEEDBACK_MS };
        nextQuestion = makeQuestion(++index);
      }
      const response = event === "targetQuiz:shown" ? { ok: true, roundId } : view();
      setTimeout(() => ack?.(response), latency);
    },
    inspect() { settle(); return { ...view(), log: [...log], answerIndex: question.answerIndex }; },
    setLatency(value) { latency = value; },
  };
}

function App() {
  const [settings, setSettings] = React.useState({ layout: phonePreview ? "mobile" : "desktop", mode: "words", long: false, dark: false, epoch: 1 });
  const [active, setActive] = React.useState(true);
  const [solved, setSolved] = React.useState(true);
  const [definitionOpen, setDefinitionOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [deadline, setDeadline] = React.useState(null);
  const latestSession = React.useRef(null);
  const desktopGridRef = React.useRef(null);
  const transitionWatch = React.useRef({ observer: null, events: [] });
  const lightingWatch = React.useRef({ observer: null, events: [] });
  const session = React.useMemo(() => {
    const roundId = `target-quiz-fixture-${settings.epoch}`;
    const endsAt = Date.now() + 180_000;
    return { roundId, endsAt, socket: createFixtureSocket(settings, roundId, endsAt) };
  }, [settings.epoch]);
  const quiz = useTargetQuizPlacement({ appView: "live", gamePresentationView: "live", phase: "playing",
    isLoggedIn: active, roundId: session.roundId, roomId: "fixture", userId: 7, nickname: "Paul",
    endsAt: deadline ?? session.endsAt, getNowServerMs: now,
    specialRoundType: "target_long", foundTargetThisRound: solved });
  const reset = options => flushSync(() => {
    celebration.clearAllCelebrationFlashes();
    notifications.clear();
    setActive(true);
    setDeadline(null);
    setSolved(!options?.integration);
    setDefinitionOpen(false);
    setProfileOpen(false);
    setSettings(previous => ({ ...previous, ...options, epoch: previous.epoch + 1 }));
  });
  const restartWithAudio = async () => {
    flushSync(() => setActive(false));
    await reloadFeedbackAudio();
    reset({});
  };
  const finishRound = () => flushSync(() => setDeadline(Date.now()));
  const findTarget = (remaining, durationMs = 2400) => flushSync(() => {
    if (remaining != null) setDeadline(Date.now() + remaining);
    if (!solved && durationMs > 0) celebration.showCelebrationFlash("gobbleFlash", {
      id: Date.now(), text: "GOBBLE", kind: "gobble", durationMs, dx: 0, dy: 0, scale: 1,
    }, durationMs);
    setSolved(true);
  });
  const report = React.useCallback(state => {
    latestSession.current = state;
    quizFeature.capture(session.roundId, state);
    if (state.phase === "finished" && quizFeature.hasPlayed(session.roundId)) void quizFeature.showRecap(session.roundId);
  }, [session]);
  React.useEffect(() => () => {
    transitionWatch.current.observer?.disconnect();
    lightingWatch.current.observer?.disconnect();
  }, [session]);
  const answer = correct => {
    const state = session.socket.inspect();
    const index = correct ? state.answerIndex : (state.answerIndex + 1) % 4;
    document.querySelectorAll(".target-quiz__choice")[index]?.click();
  };
  window.targetQuizFixture = {
    reset, answer, latency: value => session.socket.setLatency(value),
    openProfile: () => setProfileOpen(true),
    reward: () => notifications.store.getState().gobblarsReward,
    restartWithAudio, finishRound,
    findTarget,
    recap: () => quizFeature.showRecap(session.roundId),
    integrationState: () => ({ ...quizFeature.store.getState(), definitionOpen, active: quiz.active, gobbleActive: !!celebration.getSnapshot().gobbleFlash }),
    deadlineIn: ms => flushSync(() => setDeadline(Date.now() + Math.max(1, Number(ms) || 1))),
    audio: () => audioTrace.snapshot(),
    audioContext: state => audioTrace.setContextState(state),
    mute: value => preferences.mute(value),
    volume: value => preferences.volume(value),
    active: value => flushSync(() => setActive(!!value)),
    lights: readLighting,
    watchLights() {
      lightingWatch.current.observer?.disconnect();
      const events = [];
      const canvases = new WeakMap();
      let canvasCount = 0;
      let previous = "";
      const record = () => {
        const canvas = document.querySelector("canvas.target-quiz-lighting");
        if (canvas && !canvases.has(canvas)) canvases.set(canvas, ++canvasCount);
        const value = canvas ? { canvas: canvases.get(canvas), state: canvas.dataset.state,
          progress: Number(canvas.dataset.progress), hidden: canvas.hidden } : { canvas: null };
        const key = JSON.stringify(value);
        if (key === previous) return;
        previous = key;
        events.push({ at: performance.now(), ...value });
      };
      const observer = new MutationObserver(record);
      observer.observe(document.body, { attributes: true,
        attributeFilter: ["data-state", "data-progress", "hidden"], childList: true, subtree: true });
      lightingWatch.current = { observer, events };
      record();
    },
    watchTransition() {
      transitionWatch.current.observer?.disconnect();
      const events = [];
      let previous = "";
      const record = () => {
        const transition = document.querySelector(".target-quiz__cards")?.className || "";
        const presenter = document.querySelector(".target-quiz__presenter")?.dataset.state || "";
        const definition = document.querySelector(".target-quiz__definition")?.textContent || "";
        const key = JSON.stringify([transition, presenter, definition]);
        if (key === previous) return;
        previous = key;
        events.push({ at: performance.now(), transition, presenter, definition });
      };
      const observer = new MutationObserver(record);
      observer.observe(document.querySelector(".target-quiz__question"), {
        attributes: true, attributeFilter: ["class", "data-state"], childList: true, subtree: true,
      });
      transitionWatch.current = { observer, events };
      record();
    },
    snapshot() {
      const section = document.querySelector(".target-quiz__question");
      const rect = section?.getBoundingClientRect();
      const choices = [...document.querySelectorAll(".target-quiz__choice")];
      const presenter = document.querySelector(".target-quiz__presenter");
      const lights = document.querySelector("canvas.target-quiz-lighting");
      return { settings, strictPreview, session: latestSession.current, server: session.socket.inspect(),
        definition: document.querySelector(".target-quiz__definition")?.textContent,
        choices: choices.map(node => ({ text: node.textContent, disabled: node.disabled,
          width: node.clientWidth, scrollWidth: node.scrollWidth })),
        feedback: document.querySelector(".target-quiz__feedback")?.textContent,
        transition: document.querySelector(".target-quiz__cards")?.className,
        transitionEvents: [...transitionWatch.current.events],
        presenter: presenter ? { ...presenter.dataset } : null,
        lighting: lights ? { ...lights.dataset, hidden: lights.hidden, ...readLighting() } : null,
        lightingEvents: [...lightingWatch.current.events],
        panel: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height,
          clientHeight: section.clientHeight, scrollHeight: section.scrollHeight,
          clientWidth: section.clientWidth, scrollWidth: section.scrollWidth } : null,
        documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth,
      };
    },
  };
  const compact = settings.layout !== "desktop";
  const targetSource = useTargetQuizTargetSource(!compact && quiz.active);
  return <main className={`fixture${phonePreview ? " fixture--phone" : ""}`}>
    <h1>Mots rares — aperçu local</h1>
    <p>Composant du jeu réel, questions de la banque, réponses simulées en mémoire.</p>
    <div className="fixture-controls">
      <select aria-label="Format" value={settings.layout} onChange={event => reset({ layout: event.target.value })}>
        <option value="desktop">Bureau</option><option value="small">Mobile 320</option>
        <option value="mobile">Mobile 390</option><option value="square">Carré 480</option>
      </select>
      <select aria-label="Première formule" value={settings.mode} onChange={event => reset({ mode: event.target.value })}>
        <option value="words">Quatre mots</option><option value="spellings">Orthographe</option>
      </select>
      <select aria-label="Latence simulée" value={settings.latency || 12} onChange={event => reset({ latency: Number(event.target.value) })}>
        <option value="12">Réponse rapide</option><option value="180">Latence 180 ms</option><option value="600">Latence 600 ms</option>
      </select>
      <label><input type="checkbox" checked={settings.long} onChange={event => reset({ long: event.target.checked })} />Texte long</label>
      <label><input type="checkbox" checked={settings.dark} onChange={event => reset({ dark: event.target.checked })} />Sombre</label>
      <button onClick={restartWithAudio}>Recommencer</button>
      <button onClick={() => answer(true)}>Bonne réponse</button>
      <button onClick={() => answer(false)}>Erreur</button>
      <button onClick={() => reset({ integration: true })}>Tester une manche cible</button>
      <button disabled={solved} onClick={() => findTarget()}>Cible trouvée</button>
      <button disabled={solved} onClick={() => findTarget(5000)}>Cible à 5 s</button>
      <button onClick={() => void quizFeature.showRecap(session.roundId)}>Voir le bilan</button>
      <button onClick={() => reset({ points: { points: 9950, total: 19950, cycles: 1 } })}>Tester le palier de 10 000</button>
      <button onClick={() => setProfileOpen(true)}>Progression du profil</button>
    </div>
    <AudioPreview trace={audioTrace} preferences={preferences} onRestart={restartWithAudio}
      onClose={() => setActive(false)} onFinish={finishRound} />
    <div className={`fixture-stage fixture-stage--${compact ? "compact" : "desktop"}`} style={{ width: phonePreview ? "100%" : compact ? profiles[settings.layout] + 24 : profiles[settings.layout] }}>
      {compact ? <MobileRoundPreview quiz={quiz} solved={solved} width={phonePreview ? window.innerWidth : profiles[settings.layout] + 24}
        viewport={phonePreview} darkMode={settings.dark} onOpenDefinition={() => setDefinitionOpen(true)} roundId={session.roundId} /> : <>
      <div className="fixture-board">
        <div ref={targetSource} style={quiz.active ? { height: 0, visibility: "hidden" } : undefined}>
        <MobileTargetHintPanel specialHintDisplay={solved ? "EXTRAORDINAIRE" : "E _ _ _ _ _ _ _ _ _ _ _ E"}
          specialHint={{ length: 13 }} solvedTargetWord={solved ? "EXTRAORDINAIRE" : ""} showSolvedTargetLoupe={solved}
          onOpenDefinition={() => setDefinitionOpen(true)} />
        </div>
        <div ref={node => { desktopGridRef.current = node; quiz.setGridHost(node); }} className="fixture-grid" style={{ height: 480 }}>
          <GameCelebrationDomOverlay hostRef={desktopGridRef} phase="playing" />
          {!quiz.active ? <p style={{ padding: 28, color: "#c6d3e5" }}>{quizFeature.store.getState().dismissed ? "Mini-jeu fermé pour cette manche" : solved ? "Moins de 5 secondes : pas de mini-jeu" : "Manche cible en cours…"}</p> : null}
        </div>
      </div>
      <div ref={quiz.setSideHost} className="fixture-side" />
      </>}
    </div>
    <TargetQuizPlayground key={session.roundId} active={quiz.active} gridHost={quiz.gridHost} sideHost={quiz.sideHost} socket={session.socket}
      roundId={session.roundId} endsAt={deadline ?? session.endsAt} getNowServerMs={now} darkMode={settings.dark}
      compact={compact} onSessionStateChange={report} onDismiss={quiz.onDismiss}
      targetWord="EXTRAORDINAIRE" onOpenTargetDefinition={() => setDefinitionOpen(true)} />
    <p className="target-quiz-result-detail">Aperçu résultats : <TargetQuizBonusBadge summary={latestSession.current} /> <span>10 pts · 12,4 s</span></p>
    <ResultsPreview />
    <TargetQuizRecapSatellite />
    <NotificationToastLayer />
    {profileOpen ? <div role="dialog" aria-label="Progression du profil" style={{ position: "fixed", inset: "20% 5% auto", zIndex: 23000, padding: 20, background: "white", borderRadius: 16, color: "#172033" }}>
      <button onClick={() => setProfileOpen(false)}>Fermer le profil</button>
      <ProfileTargetQuiz progress={quizFeature.store.getState().summary?.progression?.after || normalizeTargetQuizPoints(settings.points)} />
    </div> : null}
    {definitionOpen ? <div role="dialog" aria-label="Définition du mot cible" style={{ position: "fixed", inset: "20% 12%", zIndex: 22000, padding: 24, background: "white", borderRadius: 16, color: "#172033" }}>
      <button onClick={() => setDefinitionOpen(false)}>Fermer la définition</button><h2>EXTRAORDINAIRE</h2><p>Qui sort de l’ordre commun, de l’ordinaire.</p>
    </div> : null}
  </main>;
}
const PreviewBoundary = strictPreview ? React.StrictMode : React.Fragment;
createRoot(document.getElementById("root")).render(<PreviewBoundary><ApplicationRuntimeProvider kernel={kernel}><CelebrationRuntimeProvider><App /></CelebrationRuntimeProvider></ApplicationRuntimeProvider></PreviewBoundary>);
