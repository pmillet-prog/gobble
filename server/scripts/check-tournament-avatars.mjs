import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import WebSocket from "ws";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, ".Tmp/tournament-avatar-review");
const profile = await mkdtemp(path.join(tmpdir(), "gobble-avatar-check-"));
const vite = await createServer({ root, configFile: false, logLevel: "error", cacheDir: path.join(output, "vite-cache"),
  optimizeDeps: { noDiscovery: true, include: ["react", "react-dom/client", "react-dom", "canvas-confetti", "socket.io-client"] },
  server: { host: "127.0.0.1", port: 0 } });
let browser, socket, send, diagnose;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await read(); if (value) return value; await pause(50); }
  throw Error("Avatar browser check timed out");
}
try {
  await vite.listen(); await mkdir(output, { recursive: true });
  browser = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  const port = await until(() => readFile(path.join(profile, "DevToolsActivePort"), "utf8").then(text => Number(text.split("\n")[0])).catch(() => null));
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl); await once(socket, "open");
  let serial = 0; const pending = new Map(), errors = [];
  socket.on("message", raw => {
    const message = JSON.parse(raw);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    const task = pending.get(message.id);
    if (task) { pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result); }
  });
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error(`Timeout ${method}: ${errors.join("; ")}`)); }, 30000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || "Evaluation failed");
    return result.result.value;
  };
  const settle = () => evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const shot = async name => { const image = await send("Page.captureScreenshot", { format: "png" }); await writeFile(path.join(output, `${name}.png`), Buffer.from(image.data, "base64")); };
  diagnose = async () => {
    await shot("failure");
    const state = await evaluate("({ metrics: window.avatarFixture?.metrics, body: document.body.textContent.slice(0, 1500) })");
    await writeFile(path.join(output, "failure.json"), JSON.stringify({ state, errors }, null, 2));
    return JSON.stringify({ state, errors });
  };
  const load = async (width, height, reduced = false) => {
    errors.length = 0;
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 });
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
    await send("Page.navigate", { url: `http://127.0.0.1:${vite.httpServer.address().port}/dev/avatar-tournament/` });
    try { await until(() => evaluate("!!window.avatarFixture && document.querySelectorAll('.avatar-thumbnail img').length === 2"), 60000); }
    catch (error) { await shot("failure"); throw Error(`${error.message}: ${errors.join("; ")}`); }
  };
  await send("Runtime.enable"); await send("Page.enable");
  await load(1280, 900);
  for (let round = 2; round <= 8; round++) { await evaluate("avatarFixture.nextRound()"); await settle(); }
  assert.equal(await evaluate("avatarFixture.metrics.requests.length"), 2, "one thumbnail per player across eight result mounts");
  await evaluate("avatarFixture.join()");
  await until(() => evaluate("document.querySelectorAll('.avatar-thumbnail img').length === 3"));
  assert.equal(await evaluate("avatarFixture.metrics.requests.length"), 3, "late arrival only loads its own thumbnail");
  console.log("Eight rounds + late arrival: three thumbnails, no repeated requests.");
  await evaluate("avatarFixture.final()");
  try {
    await until(() => evaluate("avatarFixture.metrics.preparations.length === 1 || avatarFixture.metrics.preparationError"), 60000);
    assert.equal(await evaluate("avatarFixture.metrics.preparationError || null"), null);
  } catch (error) {
    await shot("preparation-failure");
    throw Error(`${error.message}\n${JSON.stringify(await evaluate("avatarFixture.metrics"))}\n${errors.join("; ")}`);
  }
  assert.equal(await evaluate("!!document.querySelector('.tournament-podium')"), false, "poses are prepared while final round results remain visible");
  await evaluate("avatarFixture.open()");
  await until(() => evaluate("!!document.querySelector('.podium-performance.is-playing')"));
  assert.equal(await evaluate("!!document.querySelector('.podium-replay')"), false);
  await until(() => evaluate("!!document.querySelector('.podium-performance.is-complete')"));
  await shot("desktop-podium-complete");
  await pause(4000);
  assert.equal(await evaluate("!!document.querySelector('.tournament-podium')"), true, "final pose remains visible for five seconds");
  await until(() => evaluate("!!avatarFixture.metrics.rankingAt"), 5000);
  await shot("desktop-ranking");
  const desktop = await evaluate("avatarFixture.metrics");
  assert.ok(desktop.rankingAt - desktop.completeAt >= 4900);
  assert.ok(desktop.rankingAt - desktop.completeAt < 6500);
  assert.equal(desktop.preparations.length, 1);
  assert.equal(desktop.requests.filter(url => url.includes("avatars?")).length, 1);
  assert.deepEqual(errors, []);
  await evaluate("avatarFixture.nextTournament()");
  await until(() => evaluate("avatarFixture.metrics.requests.filter(url => url.includes('chat.png')).length === 6"));
  console.log(`Podium prepared in ${(desktop.preparations[0].readyAt - desktop.preparations[0].startedAt).toFixed(0)} ms before opening; opening to animation ${(desktop.playingAt - desktop.openedAt).toFixed(0)} ms; ranking after ${(desktop.rankingAt - desktop.completeAt).toFixed(0)} ms.`);

  await load(393, 852, true);
  // Joining during the celebration has no warmup: it must still work.
  await evaluate("avatarFixture.open()");
  await until(() => evaluate("!!document.querySelector('.podium-performance.is-complete')"), 60000);
  await shot("mobile-reduced-podium");
  await until(() => evaluate("!!avatarFixture.metrics.rankingAt"), 10000);
  const mobile = await evaluate("avatarFixture.metrics");
  assert.ok(mobile.rankingAt - mobile.completeAt >= 4900);
  assert.equal(mobile.preparations.length, 1);
  assert.deepEqual(errors, []);
  await shot("mobile-ranking");
  console.log("Mobile, reduced motion and direct arrival: preparation succeeds, ranking appears five seconds after completion.");
  await writeFile(path.join(output, "measurements.json"), JSON.stringify({ desktop, mobile }, null, 2));
} catch (error) {
  throw Error(`${error.message}\n${await diagnose?.().catch(() => "Unable to collect browser state")}`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) await send?.("Browser.close").catch(() => {});
  socket?.close();
  if (browser && browser.exitCode === null) browser.kill();
  await vite.close();
  if (path.dirname(profile) === path.resolve(tmpdir()) && path.basename(profile).startsWith("gobble-avatar-check-")) {
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
  }
}
