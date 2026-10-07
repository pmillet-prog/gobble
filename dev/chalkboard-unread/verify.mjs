import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, ".tmp/chalkboard-unread");
const origin = process.env.CHALKBOARD_UNREAD_ORIGIN || "http://127.0.0.1:8772";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
await fs.mkdir(output, { recursive: true });
const errors = [], cases = [];
let checks = 0, chrome, socket, cdp;
async function until(read, label) {
  for (let index = 0; index < 100; index++) {
    try { const value = await read(); if (value) return value; } catch {}
    await delay(75);
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const call = (method, ...args) => evaluate(`window.chalkboardUnreadFixture[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
const snapshot = () => call("snapshot");
function check(label, condition, detail) { checks++; assert.ok(condition, `${label}: ${JSON.stringify(detail)}`); }
const settled = () => evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
async function move(center) { await call("scrollToWorld", center); await delay(90); await settled(); }
async function reset(name) { await call("reset", name); await delay(75); await settled(); }
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
  chrome = spawn(executable, ["--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(output, `chrome-${Date.now()}`)}`, "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "about:blank"],
    { windowsHide: true, stdio: "ignore" });
  const target = await until(async () => (await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json())).find(p => p.type === "page"), "Chromium");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  cdp = attach(socket); await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");
  await cdp("Network.setBlockedURLs", { urls: ["https://gobble.fr/*", "http://gobble.fr/*"] });
  for (const profile of [{ layout: "mobile", width: 390, height: 844 }, { layout: "desktop", width: 1280, height: 900 }]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width: profile.width, height: profile.height, deviceScaleFactor: 1, mobile: profile.layout === "mobile" });
    await cdp("Page.navigate", { url: `${origin}/dev/chalkboard-unread/` });
    await until(() => evaluate("!!window.chalkboardUnreadFixture"), "fixture");
    await reset("two-regions");
    let state = await capture(`${profile.layout}-initial-right`);
    check("Initial unseen zone has right badge", state.rightBadge && !state.leftBadge, state);
    check("Right cue fits viewport", state.rightRect.x >= 0 && state.rightRect.x + state.rightRect.width <= profile.width, state);
    await move(4000); state = await snapshot();
    check("Badge remains after navigation has been discovered", state.rightBadge && !state.leftBadge, state);
    await call("open", false); await delay(40); await call("open", true); await delay(90);
    state = await snapshot(); check("Closing before reaching zone retains unread", state.rightBadge, state);
    await move(16000); state = await capture(`${profile.layout}-skipped-earlier-zone`);
    check("Visiting newest zone preserves earlier unseen zone on left", state.leftBadge && !state.rightBadge, state);
    check("Left cue fits viewport", state.leftRect.x >= 0 && state.leftRect.x + state.leftRect.width <= profile.width, state);
    await call("open", false); await delay(40); await call("open", true); await delay(90);
    state = await snapshot(); check("Partial read survives reopen", state.rightBadge && !state.leftBadge, state);
    await move(8000); state = await capture(`${profile.layout}-all-read`);
    check("Visiting remaining zone clears both badges", !state.leftBadge && !state.rightBadge, state);
    check("Hints hide once discovered and all entries read", !state.leftHint && !state.rightHint, state);
    await call("open", false); await delay(40); await call("open", true); await delay(90);
    state = await snapshot(); check("Read entries stay read after reopen", !state.leftBadge && !state.rightBadge, state);

    await reset("own-only"); state = await snapshot();
    check("Own entry does not trigger badge", !state.leftBadge && !state.rightBadge, state);
    await move(8000); state = await snapshot();
    check("Own entry never keeps navigation hint alive", !state.leftHint && !state.rightHint, state);
    await reset("mixed"); state = await snapshot();
    check("Other entry among own entries triggers right badge", state.rightBadge, state);
    await move(8000); state = await snapshot();
    check("Only own farther entry remains: no badge", !state.leftBadge && !state.rightBadge, state);

    await reset("new-left"); await move(16000); await call("add", 3, 200); await delay(90);
    state = await capture(`${profile.layout}-new-left`);
    check("New entry behind reader triggers left badge", state.leftBadge && !state.rightBadge, state);
    await move(8000); state = await snapshot();
    check("Left badge persists until concerned zone", state.leftBadge, state);
    await move(200); state = await snapshot();
    check("Reaching left entry clears badge", !state.leftBadge && !state.rightBadge, state);

    await reset("mixed"); await call("enabled", false); await delay(40); await move(8000);
    state = await snapshot(); check("Loading/editing state hides indicators", !state.leftHint && !state.rightHint, state);
    await move(4000); await call("enabled", true); await delay(90); state = await snapshot();
    check("Crossing zone while disabled does not mark it read", state.rightBadge, state);
    await move(8000); state = await snapshot();
    check("Actual visible visit after disabled state marks read", !state.rightBadge && !state.leftBadge, state);
  }
  check("No browser exceptions", errors.length === 0, errors);
  console.log(JSON.stringify({ checks, cases: cases.length, errors }));
} catch (error) {
  process.exitCode = 1; console.error(error.stack);
} finally {
  await fs.writeFile(path.join(output, "verification.json"), JSON.stringify({ checks, cases, errors }, null, 2));
  if (cdp) await cdp("Browser.close").catch(() => {});
  socket?.close(); if (chrome?.exitCode === null) chrome.kill();
}
