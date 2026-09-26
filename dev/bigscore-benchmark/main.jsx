import React from "react";
import { createRoot } from "react-dom/client";
import { ApplicationRuntimeProvider } from "../../src/app/react/ApplicationRuntimeProvider.jsx";
import { createResourceScope } from "../../src/app/core/createResourceScope.js";
import { createCelebrationFeature } from "../../src/features/celebration/createCelebrationFeature.js";
import { CelebrationRuntimeProvider } from "../../src/features/celebration/CelebrationRuntime.jsx";
import GameCelebrationOverlay from "../../src/components/GameCelebrationOverlay.jsx";
import AssetManager from "../../src/assets/assetManager.js";
import { BOOT_ASSET_MANIFEST_BASE } from "../../src/assets/bootAssetManifest.js";
import { IMAGE_KEYS } from "../../src/assets/assetKeys.js";
import confetti from "canvas-confetti";
import "../../src/index.css";
import "../../src/styles/gameRuntime.css";
import "./style.css";

const mode = new URLSearchParams(location.search).get("bigscoreRenderer") || "dom";
const mobile = new URLSearchParams(location.search).has("mobile");
const lite = new URLSearchParams(location.search).has("lite");
const scope = createResourceScope("bigscore-benchmark"), feature = createCelebrationFeature({ scope });
feature.start();
const kernel = { features: { prepare: name => {
  if (name !== "celebration") throw new Error(`Unexpected feature ${name}`);
  return feature;
}, acquire: () => ({ release() {} }) } };
let pixi = null, grid = null, sequence = 0, captureInputs = null;
const ready = controller => { pixi = controller; };
function Fixture() {
  const hostRef = React.useRef(null);
  const [mounted, setMounted] = React.useState(true);
  React.useEffect(() => { grid = hostRef.current; window.benchmark.setMounted = setMounted; }, []);
  return <ApplicationRuntimeProvider kernel={kernel}><CelebrationRuntimeProvider>
    <main><header>BigScore · {mode === "pixi" ? "PixiJS / WebGL" : "DOM / CSS"}</header>
      <p>Composant réel, grille de test et séquences identiques. Aucun serveur de jeu.</p>
      <div className="bench-grid" ref={hostRef}>{"GOBBLEPERFORMANCE".slice(0, 16).split("").map((letter, index) =>
        <button key={index} onPointerMove={event => {
          const stamp = event.timeStamp;
          event.currentTarget.classList.add("selected");
          requestAnimationFrame(() => { captureInputs?.push(performance.now() - stamp); });
        }} onPointerLeave={event => event.currentTarget.classList.remove("selected")}>{letter}<small>{index % 4 + 1}</small></button>)}</div>
      <footer><button onClick={() => window.benchmark.run("combined")}>Jouer la séquence</button>
        <a href="?bigscoreRenderer=dom">CSS</a><a href="?bigscoreRenderer=pixi">PixiJS</a></footer>
      {mounted && <GameCelebrationOverlay assetsReady hostRef={hostRef} phase="playing" isMobileLayout={mobile} liteVisualEffects={lite} onRendererReady={ready} />}
    </main>
  </CelebrationRuntimeProvider></ApplicationRuntimeProvider>;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const settled = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
function show(kind = "epic", index = 0) {
  const gobble = kind === "gobble" || kind === "doubleGobble";
  const durationMs = gobble ? 2400 : kind === "bonus" ? 4400 : 1800;
  feature.showCelebrationFlash(gobble ? "gobbleFlash" : "praiseFlash", {
    id: ++sequence, kind, durationMs, dx: index % 2 ? -140 : 140, dy: -90, scale: 2,
  }, durationMs);
}
const percentile = (items, ratio) => items.length ? [...items].sort((a, b) => a - b)[Math.min(items.length - 1, Math.floor(items.length * ratio))] : 0;
window.benchmark = {
  ready: false, mode,
  async parity(kind, elapsed) {
    feature.clearAllCelebrationFlashes(); await settled();
    pixi?.pause(); show(kind); await settled();
    if (pixi) pixi.seek(elapsed);
    const poses = [];
    for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = elapsed; }
    await settled();
    for (const element of document.querySelectorAll(".celebration-pop")) {
      const style = getComputedStyle(element), image = element.querySelector("img");
      const box = element.getBoundingClientRect(), host = grid.getBoundingClientRect();
      poses.push({ x: box.left + box.width / 2 - host.left - host.width / 2,
        y: box.top + box.height / 2 - host.top - host.height * .45,
        width: parseFloat(style.width), height: parseFloat(style.height),
        scale: new DOMMatrix(style.transform).a,
        alpha: +style.opacity * +(image ? getComputedStyle(image).opacity : 1) });
    }
    return { poses: pixi ? pixi.poses() : poses, stats: pixi?.stats(), rect: grid.getBoundingClientRect().toJSON() };
  },
  async run(scenario = "single") {
    feature.clearAllCelebrationFlashes(); confetti.reset(); pixi?.resume(); await settled();
    const frames = [], inputs = [], longTasks = [], timers = [];
    const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)));
    observer.observe({ type: "longtask" });
    const before = pixi?.stats();
    let raf = null, last = null, active = true;
    captureInputs = inputs;
    const sample = now => { if (!active) return; if (last != null) frames.push(now - last); last = now; raf = requestAnimationFrame(sample); };
    raf = requestAnimationFrame(sample);
    const schedule = (time, callback) => timers.push(setTimeout(callback, time));
    const started = performance.now();
    if (scenario === "single") show("epic");
    if (scenario === "combined") {
      show("doubleGobble");
      schedule(480, () => show("bonus"));
      grid.animate([{ translate: "0px 0px" }, { translate: "-6px 0px" }, { translate: "6px 0px" }, { translate: "0px 0px" }], { duration: 340 });
      const r = grid.getBoundingClientRect();
      const origin = { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height * .42) / innerHeight };
      confetti({ origin, particleCount: 49, spread: 65, startVelocity: 52, scalar: 1.05, shapes: ["star"], ticks: 120,
        colors: ["#fbbf24", "#f59e0b", "#fde68a"], zIndex: 13050 });
      confetti({ origin, particleCount: 35, spread: 95, startVelocity: 38, scalar: .9, shapes: ["circle"], ticks: 140,
        colors: ["#ffffff", "#fef3c7"], zIndex: 13050 });
    }
    if (scenario === "rapid") {
      for (let i = 0; i < 6; i++) schedule(i * 450, () => show(["epic", "doubleGobble", "gold", "purple", "gobble", "blue"][i], i));
    }
    await sleep(scenario === "idle" ? 1200 : scenario === "single" ? 2600 : 5200);
    active = false; cancelAnimationFrame(raf); captureInputs = null;
    longTasks.push(...observer.takeRecords().map(entry => entry.duration)); observer.disconnect();
    for (const timer of timers) clearTimeout(timer);
    const duration = performance.now() - started, after = pixi?.stats();
    feature.clearAllCelebrationFlashes(); confetti.reset(); await settled();
    return { scenario, durationMs: duration, frames: frames.length, fps: frames.length * 1000 / frames.reduce((a, b) => a + b, 0),
      frameP95: percentile(frames, .95), frameMax: Math.max(0, ...frames), framesOver25: frames.filter(ms => ms > 25).length,
      inputSamples: inputs.length, inputP95: percentile(inputs, .95), inputMax: Math.max(0, ...inputs),
      longTasks: longTasks.length, longTaskMs: longTasks.reduce((a, b) => a + b, 0),
      pixiDraws: after ? after.draws - before.draws : null, pixi: after, idle: pixi?.stats() };
  },
  async cleanup() { feature.clearAllCelebrationFlashes(); this.setMounted(false); await settled(); return document.querySelectorAll("[data-bigscore-renderer]").length; },
  async loseContext() {
    document.querySelector('[data-bigscore-renderer]')?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
    await sleep(200); show('epic'); await settled();
    return { canvas: document.querySelectorAll('[data-bigscore-renderer]').length, css: document.querySelectorAll('.celebration-pop').length };
  },
  async invalid() {
    feature.clearAllCelebrationFlashes();
    feature.showCelebrationFlash('invalidFlash', { id: ++sequence, text: 'INVALIDE' }, 1050);
    await settled();
    return { text: document.querySelector('.celebration-text-invalid')?.textContent,
      draws: pixi?.stats().draws, frames: pixi?.stats().framePending };
  },
};
async function bootFixture() {
  AssetManager.registerManifest(BOOT_ASSET_MANIFEST_BASE);
  await AssetManager.preload({ keys: Object.values(IMAGE_KEYS.bigwords) });
  createRoot(document.getElementById("root")).render(<Fixture />);
  await settled();
  const deadline = performance.now() + 20000;
  while (mode === "pixi" && !pixi && performance.now() < deadline) await sleep(50);
  window.benchmark.ready = mode !== "pixi" || !!pixi;
}
void bootFixture();
