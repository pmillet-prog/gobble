import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ApplicationRuntimeProvider } from "../../src/app/react/ApplicationRuntimeProvider.jsx";
import { createPresenterHintsController } from "../../src/features/presenters/createPresenterHintsController.js";
import { ResultsActionBar } from "../../src/features/presenters/MobilePresenterActionBar.jsx";
import useResultsPresenterGate from "../../src/components/botInterventions/useResultsPresenterGate.js";
import useResultsPresenterAvailability from "../../src/features/presenters/useResultsPresenterAvailability.js";
import LepersIntervention from "../../src/components/lepers/LepersIntervention.jsx";
import VocabProgressOverlay from "../../src/components/vocab/VocabProgressOverlay.jsx";
import "../../src/index.css";
import "../../src/styles/gameRuntime.css";

const controller = createPresenterHintsController({ storage: null });
const subscribe = () => () => {};
const features = {
  presenters: controller,
  liveUi: { store: { getState: () => ({ threeWordsRecapOpen: false }), subscribe } },
  chat: { store: { getState: () => ({ homeUnreadCount: 0, mobileUnreadCount: 0 }), subscribe } },
};
const kernel = { features: { prepare: key => features[key], acquire: () => ({ release() {} }) } };
let latestEvent = null;
const interventionListeners = new Set();
const liveRoundFeature = { subscribeLepersInterventions(listener) {
  interventionListeners.add(listener);
  if (latestEvent) listener(latestEvent);
  return () => interventionListeners.delete(listener);
} };
let sequence = 0;
const noop = () => {};
let pivotActivations = 0;
controller.subscribeRequests("pivot", () => pivotActivations++);

function App() {
  const [roundId, setRoundId] = React.useState("fixture-0");
  const [phase, setPhase] = React.useState("results");
  const [decision, setDecision] = React.useState(null);
  const [request, setRequest] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [mountOverlay, setMountOverlay] = React.useState(false);
  const [expected, setExpected] = React.useState(false);
  const [noAnimation, setNoAnimation] = React.useState(false);
  const [layout, setLayout] = React.useState("mobile");
  const host = React.useRef(null);
  const overlay = React.useRef(null);
  const wasOpen = React.useRef(false);
  const vocabReady = useResultsPresenterGate({ phase, roundId, vocabDecisionRoundId: decision,
    noVocabAnimation: noAnimation, vocabOverlayOpen: open, vocabOverlayRequest: request });
  const presenterReady = useResultsPresenterAvailability({ phase, roundId, vocabReady, lepersAnswerExpected: expected });
  React.useLayoutEffect(() => {
    controller.hydrateInterventions([{ id: `${roundId}:pivot`, roundId,
      text: "Une anecdote sur les mots de la manche.", meta: { category: "linguist" } }]);
  }, [roundId]);
  window.presenterResultsFixture = {
    reset(options = {}) {
      latestEvent = null;
      wasOpen.current = false;
      pivotActivations = 0;
      flushSync(() => {
        setRoundId(`fixture-${++sequence}`); setPhase("results"); setDecision(null);
        setRequest(null); setOpen(false); setMountOverlay(false);
        setExpected(!!options.expected); setNoAnimation(!!options.noAnimation);
        setLayout(options.layout || "mobile");
      });
    },
    settle() { flushSync(() => setDecision(roundId)); },
    queue() { flushSync(() => {
      setDecision(roundId);
      setRequest({ id: ++sequence, payload: { baseCount: 1200, deltaCount: 1, targetCount: 1201,
        weeklyBaseCount: 10, weeklyDeltaCount: 1, weeklyTargetCount: 11,
        words: ["CHAT"], seasonWords: ["CHAT"] } });
    }); },
    mount() { flushSync(() => setMountOverlay(true)); },
    skip() { overlay.current?.skip(); },
    phase(value) { flushSync(() => setPhase(value)); },
    event(kind, text = "Il fallait trouver le mot CHIEN.") {
      latestEvent = { id: `${roundId}:${kind}:${++sequence}`, roundId, kind, text, highlights: ["CHIEN"] };
      for (const listener of interventionListeners) listener(latestEvent);
    },
    activate() { return controller.request("pivot"); },
    click() { document.querySelector('[data-presenter-key="pivot"]')?.click(); },
    hit() { document.querySelector('[data-character="lepers"] button')?.click(); },
    snapshot() {
      const button = document.querySelector('[data-presenter-key="pivot"]');
      const sprite = document.querySelector('[data-character="lepers"] .sprite-intervention-surface');
      return { roundId, phase, vocabReady, presenterReady, expected, open, requested: !!request,
        disabled: button?.disabled, buttonLabel: button?.getAttribute("aria-label"),
        gray: !!button?.classList.contains("grayscale"),
        filter: button ? getComputedStyle(button).filter : "", pivotActivations,
        answerRound: controller.getSnapshot().lepersAnswerRevealedRoundId,
        spritePhase: sprite?.dataset.phase,
        text: sprite?.querySelector('.sprite-intervention-bubble .sprite-intervention-text')?.textContent || "" };
    },
  };
  return <main style={{ maxWidth: layout === "desktop" ? 680 : 390, margin: "30px auto", padding: 20 }}>
    <h1>Présentateurs — vérification locale</h1>
    <p>Données en mémoire, aucun serveur de jeu.</p>
    <div ref={host} style={{ height: 410, position: "relative", border: "1px solid #aaa", borderRadius: 20,
      display: "flex", flexDirection: "column", justifyContent: "end" }}>
      {phase === "results" && <ResultsActionBar roundId={roundId} layout={layout} hostRef={host}
        onOpenChat={noop} onOpenPlayers={noop} onOpenStats={noop} onReturnLobby={noop} />}
    </div>
    <LepersIntervention enabled={phase === "results" && vocabReady} liveRoundFeature={liveRoundFeature}
      roundId={roundId} phaseKey={phase} hostRef={host} />
    {mountOverlay && <VocabProgressOverlay ref={overlay} request={request} isMobileLayout={layout === "mobile"}
      getImageUrl={key => `/vocab-ranks/${key.replace("img_vocab_", "")}.png`}
      onVisibilityChange={value => {
        setOpen(value); if (!value && wasOpen.current) setRequest(null); wasOpen.current = value;
      }} />}
  </main>;
}
createRoot(document.getElementById("root")).render(<ApplicationRuntimeProvider kernel={kernel}><App /></ApplicationRuntimeProvider>);
