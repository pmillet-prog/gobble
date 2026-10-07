import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, ".tmp/presenter-results");
const origin = process.env.PRESENTER_RESULTS_ORIGIN || "http://127.0.0.1:8771";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
await fs.mkdir(output, { recursive: true });
const errors = [], cases = [];
let checks = 0, chrome, socket, cdp, chromeLog;
async function until(read, label) {
  for (let index = 0; index < 100; index++) {
    try { const value = await read(); if (value) return value; } catch {}
    await delay(100);
  }
  throw new Error(`Timeout: ${label}`);
}
function attach(ws) {
  let sequence = 0;
  const pending = new Map();
  ws.on("message", raw => {
    const message = JSON.parse(raw);
    if (!message.id) { if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails); return; }
    const item = pending.get(message.id); if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer);
    if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result);
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const call = (method, ...args) => evaluate(`window.presenterResultsFixture[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
const snapshot = () => call("snapshot");
function check(label, condition, detail) { checks++; assert.ok(condition, `${label}: ${JSON.stringify(detail)}`); }
async function capture(label) {
  const state = await snapshot(); cases.push({ label, ...state });
  const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(output, `${label}.png`), Buffer.from(screenshot.data, "base64"));
  return state;
}
try {
  let executable;
  for (const candidate of [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean)) {
    try { await fs.access(candidate); executable = candidate; break; } catch {}
  }
  assert.ok(executable, "Chromium executable required");
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  chromeLog = await fs.open(path.join(output, "browser.log"), "w");
  chrome = spawn(executable, ["--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(output, `chrome-${Date.now()}`)}`, "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "about:blank"],
    { windowsHide: true, stdio: ["ignore", chromeLog.fd, chromeLog.fd] });
  const target = await until(async () => (await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json())).find(p => p.type === "page"), "Chromium");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  cdp = attach(socket); await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");
  await cdp("Network.setBlockedURLs", { urls: ["https://gobble.fr/*", "http://gobble.fr/*"] });
  for (const profile of [{ layout: "mobile", width: 390, height: 844 }, { layout: "desktop", width: 1280, height: 900 }]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width: profile.width, height: profile.height, deviceScaleFactor: 1, mobile: profile.layout === "mobile" });
    await cdp("Page.navigate", { url: `${origin}/dev/presenter-results/` });
    await until(() => evaluate("!!window.presenterResultsFixture"), "fixture");
    await call("reset", profile); await delay(80);
    let state = await capture(`${profile.layout}-waiting`);
    check("Pending presenter is disabled and gray", state.disabled && state.gray && state.filter.includes("grayscale(1)"), state);
    check("Pending request blocked", await call("activate") === false);
    await call("click"); check("Disabled click does not activate", (await snapshot()).pivotActivations === 0);
    await call("queue"); await delay(350);
    state = await snapshot(); check("Lazy overlay queue keeps presenters locked", state.requested && !state.open && state.disabled, state);
    await call("mount"); await until(async () => (await snapshot()).open, "real vocabulary open");
    state = await snapshot(); check("Open overlay keeps presenters locked", state.disabled && !state.vocabReady, state);
    await call("skip"); await until(async () => !(await snapshot()).open, "real vocabulary skip");
    state = await capture(`${profile.layout}-vocab-skipped`);
    check("Skip releases presenter", !state.disabled && !state.gray && state.vocabReady, state);
    await call("click"); check("Released click activates once", (await snapshot()).pivotActivations === 1);

    await call("reset", { ...profile, expected: true }); await call("settle");
    state = await snapshot(); check("QPUC waits for Julien after vocab", state.vocabReady && state.disabled && state.buttonLabel.includes("Julien"), state);
    await call("event", "challenge", "Quelle est la réponse ?");
    await until(async () => (await snapshot()).spritePhase === "holding", "question fully revealed");
    check("Question cannot unlock answer gate", (await snapshot()).disabled);
    await call("event", "answer");
    await until(async () => (await snapshot()).spritePhase === "entering", "answer starts");
    await call("hit"); state = await snapshot();
    check("Unread answer cannot be zapped", state.spritePhase === "entering" && state.disabled, state);
    await until(async () => !!(await snapshot()).answerRound, "answer text reveal");
    state = await capture(`${profile.layout}-answer-revealed`);
    check("Complete answer unlocks other presenter", !state.disabled && state.text.includes("CHIEN"), state);

    await call("reset", { ...profile, expected: true }); await call("settle");
    await call("event", "answer");
    await until(async () => (await snapshot()).spritePhase === "entering", "cancel answer starts");
    await call("phase", "idle"); await delay(60); await call("phase", "results"); await delay(60);
    state = await snapshot(); check("Cancelled unread answer does not unlock", state.disabled && !state.answerRound, state);
    await until(async () => !!(await snapshot()).answerRound, "resumed answer reveal");
    check("Returning resumes unread answer without a new event", !(await snapshot()).disabled);
    await call("phase", "idle"); await delay(60); await call("phase", "results"); await delay(100);
    state = await snapshot(); check("Read answer is not replayed on return", !state.spritePhase && !state.disabled, state);

    await call("reset", { ...profile, noAnimation: true }); await delay(60);
    state = await snapshot(); check("No-animation round immediately available", !state.disabled && state.vocabReady, state);
    await call("reset", profile); await delay(60);
    state = await snapshot(); check("New round forgets old readiness", state.disabled && !state.answerRound, state);
  }
  check("No browser exceptions", errors.length === 0, errors);
  console.log(JSON.stringify({ checks, cases: cases.length, errors }));
} catch (error) {
  process.exitCode = 1; console.error(error.stack);
} finally {
  await fs.writeFile(path.join(output, "verification.json"), JSON.stringify({ checks, cases, errors }, null, 2));
  if (cdp) await cdp("Browser.close").catch(() => {});
  socket?.close(); if (chrome?.exitCode === null) chrome.kill();
  await chromeLog?.close();
}
