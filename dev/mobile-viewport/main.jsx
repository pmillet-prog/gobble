// Local browser fixture: production UI, in-memory feature state, no game server.
import React from "react";
import { createRoot } from "react-dom/client";
import { ApplicationRuntimeProvider } from "../../src/app/react/ApplicationRuntimeProvider.jsx";
import { acquireMobileGameViewportTracker, lockMobileGameDocument } from "../../src/features/layout/mobileGameViewport.js";
import { TraceRuntimeProvider } from "../../src/features/trace/TraceRuntime.jsx";
import MobileStandardPlaying from "../../src/components/mobile/MobileStandardPlaying.jsx";
import HomeLobby from "../../src/components/home/HomeLobby.jsx";
import LiveSalonScene from "../../src/components/live/LiveSalonScene.jsx";
import ChatStyleSlide from "../../src/components/chat/ChatStyleSlide.jsx";
import "../../src/styles/gameRuntime.css";
import "../../src/index.css";
import "./style.css";

const originalFetch = window.fetch.bind(window);
window.fetch = (url, options) => {
  const resolved = new URL(String(url), location.href);
  if (resolved.origin !== location.origin || resolved.pathname.startsWith("/api/")) {
    throw new Error(`Fixture forbids backend/external fetch: ${resolved.pathname}`);
  }
  return originalFetch(url, options);
};

function memoryFeature(initial) {
  let state = initial;
  const listeners = new Set();
  const subscribe = callback => { listeners.add(callback); return () => listeners.delete(callback); };
  return {
    store: { getState: () => state, subscribe },
    subscribe, getSnapshot: () => state,
    set(key, value) {
      state = { ...state, [key]: typeof value === "function" ? value(state[key]) : value };
      for (const callback of listeners) callback();
    },
  };
}
const chat = memoryFeature({
  input: "", tab: "messages", blockedInstallIds: [], botVisibility: {}, showBotMessages: true,
  homeUnreadCount: 0, homeBotUnreadCount: 0, mobileUnreadCount: 0, mobileBotUnreadCount: 0,
  messages: Array.from({ length: 14 }, (_, index) => ({
    id: `fixture-${index}`, nick: index % 2 ? "Test" : "Tigre", installId: index % 2 ? "test" : "self",
    text: index % 2 ? "Le chat doit rester lisible lorsque le clavier apparaît." : "Message local de vérification du cadrage.",
    t: 1770000000000 + index * 60000,
  })),
});
const features = {
  chat, accountAdmin: memoryFeature({ allowed: false, excluded: {} }),
  clock: memoryFeature({ remainingSeconds: 87 }), liveUi: memoryFeature({ gridShake: false }),
  progress: memoryFeature({ score: 12, acceptedCount: 3, foundWordsCount: 3, inputShake: false, statusText: "" }),
  roster: memoryFeature({ livePlayers: [], liveProvisionalRanking: [] }),
  trace: { ...memoryFeature({ highlightPath: [], currentTiles: [] }), registerTraceTile: () => () => {}, isTraceTileHighlighted: () => false },
  presenters: { ...memoryFeature({ entries: {} }), setRound() {}, setInterventionHost: () => () => {} },
};
const applicationState = { navigation: { view: "live" }, session: { isLoggedIn: false } };
const kernel = { getState: () => applicationState, subscribe: () => () => {}, features: {
  prepare(name) { if (!features[name]) throw new Error(`Unmocked fixture feature: ${name}`); return features[name]; },
  acquire() { return { release() {} }; },
} };

// Inject only visual-viewport measurements/events. This does not emulate UIKit
// scrolling or the iOS keyboard; native-engine behavior still needs an iPhone.
const nativeViewport = window.visualViewport;
let overrides = {};
Object.defineProperty(window, "visualViewport", { configurable: true, value: new Proxy(nativeViewport, {
  get(target, key) {
    if (Object.hasOwn(overrides, key)) return overrides[key];
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
}) });
function setViewport(value = {}) {
  overrides = value;
  nativeViewport.dispatchEvent(new Event("resize"));
  nativeViewport.dispatchEvent(new Event("scroll"));
}

function Board({ children, onOpenChat }) {
  const [viewport, setViewportState] = React.useState({ width: innerWidth, height: innerHeight });
  const gridRef = React.useRef(null);
  const headerRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const lease = acquireMobileGameViewportTracker();
    const { tracker } = lease;
    const unlock = lockMobileGameDocument({ tracker });
    setViewportState(tracker.getSnapshot());
    const unsubscribe = tracker.subscribe(setViewportState);
    if (gridRef.current) gridRef.current.dataset.fixtureGrid = "true";
    if (headerRef.current) headerRef.current.dataset.fixtureHeader = "true";
    return () => { unsubscribe(); unlock(); lease.release(); };
  }, []);
  return <TraceRuntimeProvider><MobileStandardPlaying
    boardForRender={"GOBBLECHATSTABLE!".slice(0, 16).split("").map(letter => ({ letter }))}
    gridRef={gridRef} mobileHeaderRef={headerRef} gridSize={4} phase="playing" clockOverrideSeconds={87}
    activeRoom={{ label: "Test local" }} countdownLines={[]} selfNick="Tigre" onOpenChat={onOpenChat}
    mobileViewportContainerStyle={{ position: "fixed", top: "var(--mobile-viewport-offset-top, 0px)", left: 0, width: "100%", height: viewport.height, minHeight: viewport.height, maxHeight: viewport.height, paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", overflow: "hidden" }}
    mobileBodyHeightStyle={{ minHeight: 0 }} mobileGridSide={Math.max(240, viewport.width - 24)}
    mobileTileFontPx={32} mobileGapPx="8px" previewBlockHeight={52} previewGapPx={4}
    mobileLayoutSizing={{ rankingHeight: 96, liveActionBarHeight: 76 }}
    defaultTileBaseClass="bg-amber-100 text-amber-950 border border-amber-600 rounded-xl"
    tileScore={() => 1} usedSet={new Set()} rosterConfig={{ selfNick: "Tigre", installId: "self", normalizeUserIdForProfile: value => value }}
    presentersDisabled chatOverlays={children} />
  </TraceRuntimeProvider>;
}

function Fixture() {
  const [view, setView] = React.useState(new URLSearchParams(location.search).get("view") || "home");
  const [chatOpen, setChatOpen] = React.useState(false);
  const inputRef = React.useRef(null);
  const noop = React.useCallback(() => {}, []);
  const chatProps = {
    darkMode: false, chatTab: "messages", chatInputRef: inputRef,
    chatInputDisabled: false, chatInputPlaceholder: "Message de test local",
    blockedEntries: [], blockedCount: 0, messagesUnreadCount: 0,
    selfInstallId: "self", selfNick: "Tigre", submitChat: event => event?.preventDefault(),
    onChangeChatTab: tab => chat.set("tab", tab),
  };
  React.useLayoutEffect(() => {
    window.mobileViewportFixture = {
      show(next) { setChatOpen(false); setView(next); },
      openChat() { setChatOpen(true); },
      closeChat() { setChatOpen(false); },
      focusComposer() { inputRef.current?.focus({ preventScroll: true }); },
      setViewport,
      setInput: value => chat.set("input", value),
      getInput: () => chat.store.getState().input,
      getView: () => view,
    };
    document.documentElement.dataset.fixtureReady = view;
  }, [view]);
  const slide = <ChatStyleSlide {...chatProps} isChatOpenMobile={chatOpen} isChatClosing={false}
    setIsChatOpenMobile={setChatOpen} chatOpenedAtMs={Date.now() - 1000} chatAnimationMs={220} />;
  return <>
    {view === "idle" ? <p>Surface démontée pour vérifier la restitution du document.</p>
      : view === "salon" ? <LiveSalonScene {...chatProps} className="live-salon-scene-fullscreen"
      topControls={<button className="fixture-control">Retour au menu</button>}
      salonControls={<button className="fixture-control">Prêt à jouer</button>}
      utilityControls={<button className="fixture-control">Réglages</button>} />
      : view === "board" ? <Board onOpenChat={() => setChatOpen(true)}>{slide}</Board>
      : <><HomeLobby playIntro={false} accountLabel="Test local" onOpenChat={() => setChatOpen(true)}
        onOpenTutorial={noop} onOpenAccount={noop} onOpenDaily={noop} onOpenDuel={noop}
        onOpenPlayers={noop} onOpenSettings={noop} onOpenStats={noop} onOpenVault={noop}
        onOpenChalkboard={noop} onPlay={noop} />{slide}</>}
  </>;
}

createRoot(document.getElementById("root")).render(<ApplicationRuntimeProvider kernel={kernel}><Fixture /></ApplicationRuntimeProvider>);
