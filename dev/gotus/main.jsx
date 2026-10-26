import React from "react";
import { createRoot } from "react-dom/client";
import { ApplicationRuntimeProvider } from "../../src/app/react/ApplicationRuntimeProvider.jsx";
import GotusPlayground from "../../src/components/gotus/GotusPlayground.jsx";
import GotusProgress from "../../src/components/gotus/GotusProgress.jsx";
import GotusWaitingSatellite from "../../src/components/gotus/GotusWaitingSatellite.jsx";
import { GotusRecap } from "../../src/components/gotus/GotusRecapSatellite.jsx";
import { useDefinitionFixture } from "./definitionFixture.jsx";
import TrainingPlayerBadge, { GotusTrainingBadge } from "../../src/components/training/TrainingPlayerBadge.jsx";
import AssetManager from "../../src/assets/assetManager.js";
import { computeMobileGameLayoutSizing } from "../../src/features/layout/useMobileLayoutController.js";
import { installGotusIntroProbe } from "./introFixture.js";
import { createFixtureChat, useFixtureChat, FixtureMobileChat } from "./chatFixture.jsx";
import { evaluateGotusGuess } from "../../shared/gotusRules.js";
import "../../src/index.css";
import "./style.css";

// This fixture has no socket or backend. Only the local training word bank is fixed.
const fetchOriginal = window.fetch.bind(window);
window.fetch = (input, init) => String(input).endsWith("/gotus/words.json")
  ? Promise.resolve(new Response(JSON.stringify({ targets: ["BALLON"], accepted: ["BALLON", "BANANE", "BALLES", "BILLES", "BATEAU", "BOUCLE", "BOUTON"] }), { headers: { "Content-Type": "application/json" } }))
  : fetchOriginal(input, init);
let preferenceState = { isSfxMuted: false, chatDesktopFontScale: 1 };
const preferenceListeners = new Set();
const preferences = {
  store: { getState: () => preferenceState, subscribe: listener => { preferenceListeners.add(listener); return () => preferenceListeners.delete(listener); } },
  set: (key, value) => { preferenceState = { ...preferenceState, [key]: value }; for (const listener of preferenceListeners) listener(); },
};
const chatRuntime = createFixtureChat();
const kernel = {
  getState: () => ({ session: { isLoggedIn: chatRuntime.refs.isLoggedInRef.current } }),
  features: { prepare: name => name === "chat" ? chatRuntime.feature : preferences, acquire: () => ({ release() {} }) },
};
const sounds = [], states = [], cascade = [], actions = [], liveEmissions = [];
new MutationObserver(records => {
  for (const record of records) {
    if (record.target.dataset.victoryNeutral === "true") cascade.push({ column: Number(record.target.dataset.gotusColumn), at: AssetManager.getAudioOutput()?.ctx.currentTime });
  }
}).observe(document.querySelector("#root"), { subtree: true, attributes: true, attributeFilter: ["data-victory-neutral"] });
const contextPrototype = (window.AudioContext || window.webkitAudioContext)?.prototype;
if (contextPrototype) {
  const createSource = contextPrototype.createBufferSource;
  contextPrototype.createBufferSource = function () {
    const source = createSource.call(this), start = source.start.bind(source), stop = source.stop.bind(source), ctx = this;
    let playback;
    source.start = (...args) => {
      if (source.buffer?.duration > .1) {
        playback = { id: sounds.length + 1, at: ctx.currentTime, scheduledAt: args[0] ?? ctx.currentTime, wall: performance.now(), duration: source.buffer.duration };
        sounds.push(playback);
      }
      return start(...args);
    };
    source.stop = (...args) => { if (playback) { playback.stoppedAt = ctx.currentTime; playback.stoppedWall = performance.now(); } return stop(...args); };
    source.addEventListener("ended", () => { if (playback) { playback.endedAt = ctx.currentTime; playback.endedWall = performance.now(); } });
    return source;
  };
}
window.gotusFixture = {
  sounds, states, cascade, actions, liveEmissions, unlock: () => AssetManager.unlockAudio(),
  prepared: () => ["correct", "present", "absent", "won", "lost"].every(name => AssetManager.getSfxBuffer(`gotus:${name}`)),
  state: () => states.at(-1),
  intro: installGotusIntroProbe(AssetManager),
  chat: { inspect: chatRuntime.inspect, receive: chatRuntime.receive },
  mute: value => { preferenceState = { isSfxMuted: !!value }; for (const listener of preferenceListeners) listener(); },
};
const onState = value => states.push(value);
let liveAttempts = [], liveDeadline = 0;
const liveSocket = {
  connected: true, on() {}, off() {},
  emit(event, payload, ack) {
    liveEmissions.push({ event, payload });
    if (event === "gotus:start") { liveAttempts = []; liveDeadline = Date.now() + 120000; }
    else if (event === "gotus:guess") liveAttempts.push({ word: payload.word, marks: evaluateGotusGuess("BALLON", payload.word) });
    else return;
    const won = liveAttempts.at(-1)?.word === "BALLON", phase = won ? "won" : liveAttempts.length >= 6 ? "lost" : "playing";
    queueMicrotask(() => ack?.({ ok: true, roundId: payload.roundId, phase, endsAt: liveDeadline,
      firstLetter: "B", known: [..."BALLON"].map((letter, column) => !column || liveAttempts.some(attempt => attempt.marks[column] === "correct") ? letter : ""),
      attempts: [...liveAttempts], remainingAttempts: 6 - liveAttempts.length,
      ...(phase === "playing" ? {} : { solution: "BALLON" }),
      wordsFound: won ? 1 : 0, summary: { phase, won, wordsFound: won ? 1 : 0, attemptsUsed: liveAttempts.length },
      progression: { before: { totalWins: 7 }, after: { totalWins: 7 }, reward: null },
    }));
  },
};
function LiveFixture({ mobile, chat, onOpenDefinition }) {
  const [gridHost, setGridHost] = React.useState(null), [sideHost, setSideHost] = React.useState(null);
  const deadline = React.useRef(Date.now() + 120000).current;
  const sizing = computeMobileGameLayoutSizing({ viewportWidth: innerWidth, viewportHeight: innerHeight,
    bodyHeight: innerHeight - 64, baseFontSize: 16, maxGridWidth: 720,
    roundType: "target_score", showLiveActionBar: true,
  });
  window.gotusFixture.liveSizing = sizing;
  return <div className={`fixture-live${mobile ? " fixture-live--mobile" : ""}`}>
    <header className="fixture-live__header">Manche cible · surface de jeu live</header>
    {mobile ? <div className="fixture-live__mobile-body" style={{ height: sizing.bodyHeight }}>
      <div className="fixture-live__hint" style={{ height: sizing.targetHintHeight }}>Cible trouvée</div>
      <div className="fixture-live__preview" style={{ height: sizing.wordPreviewHeight }}>Gotus</div>
      <div ref={setGridHost} className="fixture-live__grid-host" style={{ width: Math.min(innerWidth - 24, 720), height: sizing.gridSide }} />
      <div ref={setSideHost} className="fixture-live__feed" style={{ minHeight: sizing.liveFeedHeight }} data-target-quiz-surface="stats">Progression du mot</div>
      <div className="fixture-live__actionbar" style={{ height: sizing.liveActionBarHeight }}>Chat · Joueurs</div>
    </div> : <div className="fixture-live__desktop-body"><div ref={setGridHost} className="fixture-live__grid-host" /><div ref={setSideHost} className="fixture-live__side-host" /></div>}
    <GotusPlayground active={!!gridHost} mode="live" socket={liveSocket} roundId="live-fixture" endsAt={deadline}
      onOpenDefinition={onOpenDefinition}
      getNowServerMs={Date.now} gridHost={gridHost} sideHost={sideHost} compact={mobile} chat={chat} onSessionStateChange={onState} onDismiss={() => actions.push("dismissLive")} />
  </div>;
}
function Fixture() {
  const definition = useDefinitionFixture();
  const [recap, setRecap] = React.useState(null);
  const [waitingState, setWaitingState] = React.useState(null);
  const [liveMode, setLiveMode] = React.useState(null);
  const mobile = liveMode ? liveMode.mobile : innerWidth < 1000 || innerHeight < 600;
  const chat = useFixtureChat(chatRuntime, { mobile, training: !liveMode });
  const session = { sessionId: "waiting-fixture" };
  window.gotusFixture.closeAll = () => { setLiveMode(null); setWaitingState(null); };
  window.gotusFixture.recap = summary => setRecap(summary);
  const definitionViews = <>{definition.overlay}{recap ? <GotusRecap summary={recap} onOpenDefinition={definition.openDefinition} /> : null}</>;
  window.gotusFixture.waiting = kind => { setLiveMode(null); setWaitingState({
    busy: false, remindersMuted: false, session: kind === "offer" ? null : session,
    dialog: kind === "session" ? null : { kind, message: "Le mini-tournoi est déjà bien avancé. En attendant le prochain départ, essayez Gotus." },
  }); };
  window.gotusFixture.responsive = (surface, mobile) => {
    if (surface === "live") { setWaitingState(null); setLiveMode({ mobile }); }
    else { window.gotusFixture.waiting("session"); }
  };
  const act = (name, next) => { actions.push(name); setWaitingState(next); };
  const controller = {
    close: () => act("close", null), joinLive: () => act("joinLive", null), enterAnyway: () => act("enterAnyway", null),
    startTraining: () => act("startTraining", { session, dialog: null, busy: false, remindersMuted: false }),
    dismissDialog: () => act("dismissDialog", waitingState?.session ? { ...waitingState, dialog: null } : null),
    muteReminders: value => { actions.push("muteReminders"); setWaitingState({ ...waitingState, remindersMuted: value }); },
  };
  if (liveMode) return <><LiveFixture mobile={liveMode.mobile} chat={chat} onOpenDefinition={definition.openDefinition} /><FixtureMobileChat chat={chat} />{definitionViews}</>;
  return <><main className="fixture">
    <aside className="fixture__examples">
      <h1>Gotus · vérification client</h1>
      <div className="fixture__roster"><GotusTrainingBadge player={{ inTraining: true, trainingMode: "gotus" }} /><strong>Pounie</strong><span>en entraînement Gotus</span></div>
      <div className="fixture__roster"><strong>Tigre</strong><TrainingPlayerBadge /></div>
      <GotusProgress progress={{ totalWins: 7 }} />
    </aside>
    {!waitingState && !new URLSearchParams(location.search).has("intro-test") ? <div className="fixture__game"><GotusPlayground active mode="training" roundId="fixture" compact={mobile} chat={chat} onSessionStateChange={onState} onJoinLive={() => {}} onOpenDefinition={definition.openDefinition} /></div> : null}
  </main>{waitingState ? <GotusWaitingSatellite waiting={{ state: waitingState, controller }} darkMode={false} compact={mobile} chat={chat} onOpenDefinition={definition.openDefinition} /> : null}<FixtureMobileChat chat={chat} />{definitionViews}</>;
}
createRoot(document.querySelector("#root")).render(<ApplicationRuntimeProvider kernel={kernel}><Fixture /></ApplicationRuntimeProvider>);
