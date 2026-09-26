// Actual React overlays, production build, isolated Chrome; no Gobble backend.
// node server/scripts/benchmark-bigscore.mjs [--quick | --checks-only]
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir, cpus } from "node:os";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import WebSocket from "ws";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, ".Tmp/bigscore-review");
const outDir = path.join(root, ".Tmp/bigscore-benchmark-build");
const quick = process.argv.includes("--quick");
const checksOnly = process.argv.includes("--checks-only");
const repetitions = quick ? 1 : 3;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await read(); if (value) return value; await sleep(100); }
  throw new Error("Benchmark browser timed out");
}
await mkdir(output, { recursive: true });
await build({ root, configFile: false, publicDir: false, logLevel: "error",
  build: { target: "esnext", outDir, emptyOutDir: true,
    rollupOptions: { input: path.join(root, "dev/bigscore-benchmark/index.html") } } });
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const base = url.pathname.startsWith("/bigwords/") ? path.join(root, "public") : outDir;
    const file = path.resolve(base, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png" };
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(0, "127.0.0.1"); await once(server, "listening");
const profile = await mkdtemp(path.join(tmpdir(), "gobble-bigscore-benchmark-"));
const errors = [], warnings = [], results = [], parity = [], memory = [], connections = [];
let chrome, sendBrowser;
async function connect(url) {
  const socket = new WebSocket(url); await once(socket, "open"); connections.push(socket);
  let next = 0; const pending = new Map();
  socket.on("message", data => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === "Runtime.consoleAPICalled" && ["warning", "error"].includes(message.params.type)) {
      warnings.push(message.params.args.map(arg => arg.description || arg.value).join(" "));
    }
    const task = pending.get(message.id);
    if (task) { pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}; ${errors.join("; ")}`)); }, 30000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
try {
  chrome = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  chrome.on("error", error => errors.push(error.message));
  const port = await until(() => readFile(path.join(profile, "DevToolsActivePort"), "utf8").then(text => Number(text.split("\n")[0])).catch(() => null));
  const browser = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  sendBrowser = await connect(browser.webSocketDebuggerUrl);
  const system = await sendBrowser("SystemInfo.getInfo");
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const send = await connect(target.webSocketDebuggerUrl);
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || "Evaluation failed");
    return result.result.value;
  };
  await send("Runtime.enable"); await send("Page.enable"); await send("Performance.enable");
  const metrics = async () => Object.fromEntries((await send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
  const navigate = async (mode, config) => {
    await send("Emulation.setDeviceMetricsOverride", { width: config.width, height: config.height, deviceScaleFactor: config.dpr, mobile: false });
    await send("Emulation.setCPUThrottlingRate", { rate: config.cpu });
    await evaluate("window.benchmark = null");
    const started = Date.now();
    await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/dev/bigscore-benchmark/index.html?bigscoreRenderer=${mode}${config.mobile ? '&mobile=1' : ''}${config.lite ? '&lite=1' : ''}` });
    try { await until(() => evaluate("!!window.benchmark?.ready")); }
    catch (error) { throw new Error(`${error.message}; ${warnings.join('; ')}`); }
    return Date.now() - started;
  };
  const desktop = { name: "desktop-1080p", width: 1920, height: 1080, dpr: 1, cpu: 1 };
  // Compare actual CSS and Pixi poses at identical animation times, then inspect screenshots.
  for (const config of [desktop, { name: "mobile-layout", width: 390, height: 844, dpr: 2, cpu: 1, mobile: true },
    { ...desktop, name: "desktop-lite", lite: true }]) {
    const reference = new Map();
    for (const mode of ["dom", "pixi"]) {
      await navigate(mode, config);
      const pixiLoaded = await evaluate("performance.getEntriesByType('resource').some(entry => entry.name.includes('/PixiCelebrationOverlay-'))");
      assert.equal(pixiLoaded, mode === "pixi", "CSS default does not download Pixi");
      for (const kind of ["epic", "doubleGobble"]) {
        for (const elapsed of [160, 500, 1200]) {
          const value = await evaluate(`window.benchmark.parity(${JSON.stringify(kind)}, ${elapsed})`);
          assert.equal(value.poses.length, 1, `${mode} ${kind}: visible animation`);
          const key = `${kind}-${elapsed}`;
          if (mode === "dom") reference.set(key, value.poses[0]);
          else for (const field of ["x", "y", "scale", "alpha", "width", "height"]) {
            assert.ok(Math.abs(value.poses[0][field] - reference.get(key)[field]) < (["scale", "alpha"].includes(field) ? .002 : .15),
              `${config.name} ${key} ${field}: CSS ${reference.get(key)[field]} / Pixi ${value.poses[0][field]}`);
          }
          parity.push({ configuration: config.name, mode, kind, elapsed, ...value });
          if (elapsed === 500) {
            const screenshot = await send("Page.captureScreenshot", { format: "png" });
            await writeFile(path.join(output, `${config.name}-${mode}-${kind}.png`), Buffer.from(screenshot.data, "base64"));
          }
        }
      }
      const invalid = await evaluate("window.benchmark.invalid()");
      assert.equal(invalid.text, "INVALIDE");
      if (mode === "pixi") assert.equal(invalid.frames, false, "invalid text remains CSS-only");
      assert.equal(await evaluate("window.benchmark.cleanup()"), 0, "canvas removed on unmount");
    }
  }
  console.log("Visual parity: 36 animation poses match; CSS-only invalid text and unmount cleanup passed.");
  const configs = checksOnly ? [] : quick ? [desktop] : [desktop,
    { name: "desktop-dpr2", width: 1280, height: 800, dpr: 2, cpu: 1 },
    { ...desktop, name: "desktop-cpu4", cpu: 4 }];
  for (const config of configs) for (let repetition = 0; repetition < repetitions; repetition++) {
    // Alternate order to reduce warm-cache / temperature / background-load bias.
    for (const mode of repetition % 2 ? ["pixi", "dom"] : ["dom", "pixi"]) {
      const readyMs = await navigate(mode, config);
      const coldStart = await evaluate("window.benchmark.run('single')"); // warm decoding, shaders and first upload
      await send("HeapProfiler.collectGarbage");
      const rect = await evaluate("document.querySelector('.bench-grid').getBoundingClientRect().toJSON()");
      for (const scenario of ["idle", "single", "combined", "rapid"]) {
        let moving = false, point = 0;
        const inputErrors = [];
        const pointer = setInterval(async () => {
          if (moving) return; moving = true;
          try {
            const index = point++ % 16;
            await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.left + (index % 4 + .5) * rect.width / 4,
              y: rect.top + (Math.floor(index / 4) + .5) * rect.height / 4 });
          } catch (error) { inputErrors.push(error.message); } finally { moving = false; }
        }, 100);
        let value, before, after;
        try { before = await metrics(); value = await evaluate(`window.benchmark.run(${JSON.stringify(scenario)})`); after = await metrics(); }
        finally { clearInterval(pointer); await until(() => !moving); }
        assert.deepEqual(inputErrors, []);
        assert.ok(value.inputSamples >= 5, "real pointer inputs received");
        if (mode === "pixi") {
          assert.equal(value.idle.active, 0); assert.equal(value.idle.framePending, false);
          if (scenario === "idle") assert.equal(value.pixiDraws, 0, "no Pixi frames while idle");
          assert.equal(value.pixi.textures, 7);
          assert.equal(value.pixi.systemTickerListeners, 0, "no hidden Pixi ticker");
        }
        const cpu = Object.fromEntries(["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration"].map(key => [key + "Ms", 1000 * (after[key] - before[key])]));
        results.push({ configuration: config, repetition, mode, readyMs, coldStart, ...value, ...cpu, heapUsed: after.JSHeapUsedSize, nodes: after.Nodes });
        console.log(`${config.name} #${repetition + 1} ${mode} ${scenario}: CPU ${cpu.TaskDurationMs.toFixed(1)}ms; frame p95 ${value.frameP95.toFixed(1)}ms; input p95 ${value.inputP95.toFixed(1)}ms`);
      }
      await send("HeapProfiler.collectGarbage");
      const mountedMetrics = await metrics();
      if (mode === "pixi") {
        assert.deepEqual(await evaluate("window.benchmark.loseContext()"), { canvas: 0, css: 1 }, "CSS fallback after WebGL context loss");
      }
      assert.equal(await evaluate("window.benchmark.cleanup()"), 0);
      await send("HeapProfiler.collectGarbage");
      const unmountedMetrics = await metrics();
      memory.push({ configuration: config.name, repetition, mode,
        mountedHeap: mountedMetrics.JSHeapUsedSize, unmountedHeap: unmountedMetrics.JSHeapUsedSize,
        mountedNodes: mountedMetrics.Nodes, unmountedNodes: unmountedMetrics.Nodes });
    }
  }
  // Browsers that refuse WebGL must still display celebrations through CSS.
  const blockedGL = await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__blockedWebGLAttempts = 0;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type === 'webgl' || type === 'webgl2') { window.__blockedWebGLAttempts++; return null; }
      return getContext.call(this, type, ...args);
    };` });
  await send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await evaluate("window.benchmark = null");
  await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/dev/bigscore-benchmark/index.html?bigscoreRenderer=pixi` });
  await until(() => evaluate("window.__blockedWebGLAttempts >= 2 && !!document.querySelector('.bench-grid')"));
  const fallback = await evaluate("window.benchmark.parity('epic', 500)");
  assert.equal(fallback.poses.length, 1);
  assert.equal(fallback.stats, undefined);
  assert.equal(await evaluate("document.querySelectorAll('[data-bigscore-renderer]').length"), 0);
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: blockedGL.identifier });
  console.log("WebGL unavailable: CSS fallback passed.");
  assert.deepEqual(errors, [], "no browser exceptions");
  await writeFile(path.join(output, checksOnly ? "checks-results.json" : quick ? "quick-results.json" : "results.json"), JSON.stringify({
    date: new Date().toISOString(), browser: browser.Browser, cpu: cpus()[0]?.model,
    gpu: system.gpu, repetitions, errors, warnings, parity, results, memory,
    limitations: "Headless Chrome, isolated actual overlay and mock interactive grid; CPU throttle is not an iPhone or full-game simulation. No physical display/presentation/GPU memory measurement.",
  }, null, 2));
  console.log(`Benchmark passed; ${results.length} runs; results and screenshots: ${output}`);
} catch (error) {
  await writeFile(path.join(output, "failure.json"), JSON.stringify({ error: error.stack, errors, warnings, results, parity }, null, 2));
  throw error;
} finally {
  await sendBrowser?.("Browser.close").catch(() => {});
  for (const socket of connections) socket.close();
  if (chrome && chrome.exitCode === null) chrome.kill(); // Only our isolated test browser.
  server.close();
  // Resolved unique temporary profile; never the user's own Chrome profile.
  if (path.dirname(profile) === path.resolve(tmpdir()) && path.basename(profile).startsWith("gobble-bigscore-benchmark-")) {
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
  }
}
