import React, { Profiler, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import "./style.css";

const baseline = new URLSearchParams(location.search).has("baseline");
const runtime = baseline ? "../../.tmp/vocab-overlay/baseline/src" : "../../src";
const baselineSource = "/.tmp/vocab-overlay/baseline/src/components/vocab/VocabProgressOverlay.jsx";
const source = baseline
  ? await import(/* @vite-ignore */ baselineSource)
  : await import("../../src/components/vocab/VocabProgressOverlay.jsx");
if (baseline) {
  for (const href of ["/.tmp/vocab-overlay/baseline/src/styles/gameRuntime.css", "/.tmp/vocab-overlay/baseline/src/index.css"]) await import(/* @vite-ignore */ href);
} else {
  await import("../../src/styles/gameRuntime.css");
  await import("../../src/index.css");
}
const Overlay = source.default;
let current = null;
let sequence = 0;
let previousFrame = null;
window.__vocabViewRender = () => { if (current) current.viewRenders++; };
const rounded = value => Math.round(value * 100) / 100;
const NativeResizeObserver = window.ResizeObserver;
window.ResizeObserver = class FixtureResizeObserver extends NativeResizeObserver {
  constructor(callback) {
    super((entries, observer) => {
      if (current) { current.resizeCallbacks++; current.resizeEntries += entries.length; }
      callback(entries, observer);
    });
  }
};
const originalRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function () {
  if (current) current.rectReads++;
  return originalRect.call(this);
};
for (const name of ["offsetWidth", "offsetHeight"]) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name);
  Object.defineProperty(HTMLElement.prototype, name, { ...descriptor, get() {
    if (current) current.offsetReads++;
    return descriptor.get.call(this);
  } });
}
new PerformanceObserver(list => {
  if (!current) return;
  for (const entry of list.getEntries()) current.layoutShifts.push({ value: entry.value, hadRecentInput: entry.hadRecentInput });
}).observe({ type: "layout-shift", buffered: false });
new PerformanceObserver(list => {
  if (!current) return;
  for (const entry of list.getEntries()) current.longTasks.push(rounded(entry.duration));
}).observe({ type: "longtask", buffered: false });
function frame(now) {
  if (current && previousFrame !== null) current.frameGaps.push(rounded(now - previousFrame));
  previousFrame = current ? now : null;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function profile(_id, phase, actualDuration, baseDuration) {
  if (current) current.commits.push({ phase, actualDuration: rounded(actualDuration), baseDuration: rounded(baseDuration), at: rounded(performance.now() - current.startAt) });
}
const knownWords = ["MAISON", "TRIANGLE", "ARBRE", "CHOCOLAT", "PROGRESSION", "BATEAU", "FLEUR", "MONTAGNE", "BIBLIOTHEQUE", "VOCABULAIRE", "COURONNE", "ETINCELLE", "ROUGE", "CHANTER", "BRILLANT", "JARDIN", "FEUILLE", "OISEAU", "NUAGE", "AVENTURE"];
function payloadFor(name) {
  const count = name === "zero" ? 0 : name === "many" ? 80 : 12;
  const seasonCount = name === "zero" ? 0 : name === "many" ? 27 : 5;
  const baseCount = name === "levelup" ? 1198 : name === "firstlevel" ? 499 : 1327;
  const words = Array.from({ length: count }, (_, index) => `${knownWords[index % knownWords.length]}${index < knownWords.length ? "" : index}`);
  return {
    baseCount, deltaCount: seasonCount, targetCount: baseCount + seasonCount,
    weeklyBaseCount: 289, weeklyDeltaCount: count, weeklyTargetCount: 289 + count,
    rankStart: 8, rankEnd: count ? 5 : 8,
    words, seasonWords: words.filter((_, index) => index < seasonCount),
    raceSnapshot: { min: 289, max: 395, nextAhead: { nick: "Camille", gap: 22 }, competitors: [
      { nick: "Alice", playerKey: "a", rank: 7, count: 291, status: "passed" },
      { nick: "Paul", playerKey: "b", rank: 6, count: 295, status: "passed" },
      { nick: "Camille", playerKey: "c", rank: 4, count: 323, status: "ahead" },
      { nick: "Alexandre", playerKey: "d", rank: 3, count: 354, status: "ahead" },
    ] },
  };
}
const tick = (index, options) => {
  if (current) current.ticks.push({ index, season: options?.isSeasonNew, at: rounded(performance.now() - current.startAt) });
};
const visible = value => { if (current) current.visibility.push({ value, at: rounded(performance.now() - current.startAt) }); };
const noop = () => {};
const imageUrl = key => `/vocab-ranks/${key.replace("img_vocab_", "")}.png`;
function App() {
  const controller = useRef(null);
  const [request, setRequest] = useState(null);
  const [mobile, setMobile] = useState(innerWidth < 700);
  const [darkMode, setDarkMode] = useState(false);
  const [noiseRevision, setNoiseRevision] = useState(0);
  const [imageRevision, setImageRevision] = useState(0);
  function start(name = "normal", options = {}) {
    setMobile(options.mobile ?? innerWidth < 700);
    setDarkMode(Boolean(options.darkMode));
    if (!options.replace) {
      current = { name, baseline, startAt: performance.now(), commits: [], frameGaps: [], layoutShifts: [], longTasks: [], ticks: [], visibility: [], callbackVersions: [], viewRenders: 0, resizeCallbacks: 0, resizeEntries: 0, rectReads: 0, offsetReads: 0, confetti: 0 };
      previousFrame = null;
    }
    setRequest({ id: ++sequence, payload: payloadFor(name) });
    return payloadFor(name);
  }
  window.vocabOverlayFixture = {
    start, skip: () => controller.current.skip(), stop: () => controller.current.stop(),
    noise: count => { for (let index = 0; index < count; index++) flushSync(() => setNoiseRevision(revision => revision + 1)); },
    changeImageUrl: () => flushSync(() => setImageRevision(revision => revision + 1)),
    snapshot: () => {
      const dialog = document.querySelector('[role="dialog"]');
      const rect = element => {
        if (!element) return null;
        const r = originalRect.call(element);
        return { x: rounded(r.x), y: rounded(r.y), width: rounded(r.width), height: rounded(r.height), bottom: rounded(r.bottom), right: rounded(r.right) };
      };
      return { open: Boolean(dialog), text: dialog?.innerText || "", panel: rect(dialog?.lastElementChild), images: [...(dialog?.querySelectorAll("img") || [])].map(img => ({ src: img.getAttribute("src"), loaded: img.complete && img.naturalWidth > 0, rect: rect(img) })), progressbars: [...(dialog?.querySelectorAll('[role="progressbar"]') || [])].map(element => ({ label: element.getAttribute("aria-label"), min: element.getAttribute("aria-valuemin"), max: element.getAttribute("aria-valuemax"), value: element.getAttribute("aria-valuenow"), rect: rect(element), fills: [...element.children].map(child => ({ className: child.className, rect: rect(child) })) })) };
    },
    result: () => {
      if (!current) return null;
      const gaps = [...current.frameGaps].sort((a, b) => a - b);
      const result = { ...current, elapsed: rounded(performance.now() - current.startAt), commitCount: current.commits.length, renderTotalMs: rounded(current.commits.reduce((sum, commit) => sum + commit.actualDuration, 0)), maxFrameGapMs: Math.max(0, ...gaps), p95FrameGapMs: gaps[Math.floor(gaps.length * 0.95)] || 0, gapsOver50ms: gaps.filter(gap => gap > 50).length, gapsOver100ms: gaps.filter(gap => gap > 100).length };
      return result;
    },
    end: () => { const result = window.vocabOverlayFixture.result(); current = null; return result; },
  };
  return <>
    <main className="fixture-controls"><h1>Animation vocabulaire — {baseline ? "avant" : "courante"}</h1><p>Composant réel, données en mémoire, aucun serveur de jeu.</p><div>{["normal", "zero", "many", "levelup"].map(name => <button key={name} onClick={() => start(name)}>{name}</button>)}</div></main>
    <Profiler id="vocab" onRender={profile}><Overlay ref={controller} request={request} darkMode={darkMode} isMobileLayout={mobile} getImageUrl={key => `${imageUrl(key)}${imageRevision ? `?fixtureRevision=${imageRevision}` : ""}`} onVisibilityChange={value => visible(value)} playVocabOverlayTickSound={(...args) => { tick(...args); if (current) current.callbackVersions.push(noiseRevision); }} playVocabOverlayClingSound={() => noop()} playVocabOverlayZeroSound={() => noop()} playCloseSound={() => noop()} triggerConfettiBurst={() => { if (current) current.confetti++; }} /></Profiler>
  </>;
}
createRoot(document.getElementById("root")).render(<App />);
document.documentElement.dataset.fixtureReady = runtime;
