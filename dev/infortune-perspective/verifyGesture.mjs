// Uses a private, headless browser profile against an already running atelier.
// It never attaches to the user's browser and never starts a Gobble server.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, ".tmp/infortune-gesture-review");
const origin = process.env.INFORTUNE_GESTURE_ORIGIN || "http://127.0.0.1:8777";
const profile = process.env.INFORTUNE_GESTURE_PROFILE || "flat";
const touch = process.env.INFORTUNE_GESTURE_TOUCH === "1";
const training = process.env.INFORTUNE_GESTURE_PAGE === "training";
const sceneSelector = training ? ".wheel-test__scene" : ".perspective-workshop__scene";
const modeSelector = training ? ".wheel-test__mode select" : ".launch-game__mode select";
const verdictSelector = training ? ".wheel-test__verdict" : ".launch-game__quality";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
await fs.mkdir(output, { recursive: true });
const errors = [], report = [];
let chrome, socket, cdp;
async function until(read, label) {
  for (let i = 0; i < 160; i++) {
    const value = await read(); if (value) return value;
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function snapshot() {
  return evaluate(`(() => {
    const overlay = document.querySelector('.wheel-skill'), scene = document.querySelector('${sceneSelector}');
    const box = scene?.getBoundingClientRect(), svg = overlay?.querySelector('svg'), view = svg?.viewBox.baseVal;
    return { phase: document.querySelector('canvas')?.dataset.motion,
      scene: box && { x: box.x, y: box.y, width: box.width, height: box.height },
      bounds: view && { width: view.width, height: view.height },
      guide: overlay?.querySelector('.wheel-skill__path')?.getAttribute('d'),
      trail: overlay?.querySelector('[data-skill-trail]')?.getAttribute('d'),
      cursor: overlay?.querySelector('[data-skill-cursor]')?.getAttribute('transform'),
      power: overlay?.querySelector('[data-skill-power]')?.textContent,
      fill: overlay?.style.getPropertyValue('--skill-power'),
      progress: overlay?.querySelector('[data-skill-distance]')?.textContent,
      precision: overlay?.querySelector('[data-skill-precision]')?.textContent,
      hint: overlay?.querySelector('[data-skill-hint]')?.textContent,
      complete: overlay?.dataset.complete,
      feedback: document.querySelector('${verdictSelector}')?.textContent,
      quality: document.querySelector('${verdictSelector}')?.dataset.quality };
  })()`);
}
async function capture(name) {
  const { data } = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(data, "base64"));
}
async function click(x, y) {
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}
async function pointer(type, position) {
  if (touch) return cdp("Input.dispatchTouchEvent", {
    type: { down: "touchStart", move: "touchMove", up: "touchEnd" }[type],
    touchPoints: type === "up" ? [] : [{ ...position, id: 1, radiusX: 1, radiusY: 1 }],
  });
  return cdp("Input.dispatchMouseEvent", { type: { down: "mousePressed", move: "mouseMoved", up: "mouseReleased" }[type],
    ...position, button: "left", buttons: type === "up" ? 0 : 1, clickCount: type === "move" ? 0 : 1 });
}
try {
  let executable;
  for (const candidate of [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean)) {
    try { await fs.access(candidate); executable = candidate; break; } catch {}
  }
  assert.ok(executable, "Chromium executable required");
  const server = net.createServer(); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve));
  chrome = spawn(executable, ["--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(output, `chrome-${Date.now()}`)}`, "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "--autoplay-policy=no-user-gesture-required", "about:blank"],
    { windowsHide: true, stdio: "ignore" });
  const target = await until(async () => {
    try { return (await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json())).find(p => p.type === "page"); } catch { return null; }
  }, "private Chromium");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  cdp = attach(socket); await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem('gobble.infortune.performance.v1', JSON.stringify({version:2,preference:${JSON.stringify(profile)},profile:${JSON.stringify(profile)},at:Date.now()}))` });
  await cdp("Emulation.setDeviceMetricsOverride", { width: touch ? 390 : 1280, height: touch ? 844 : 1000, deviceScaleFactor: 1, mobile: touch });
  if (touch) await cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await cdp("Page.navigate", { url: `${origin}${training ? "/entrainement/roue/" : "/dev/infortune-perspective/"}` });
  await until(() => evaluate(`!!document.querySelector('${modeSelector}')`), "wheel page");
  await evaluate(`document.querySelector('${sceneSelector}').scrollIntoView({block:'center'})`);
  const start = await until(() => evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Entrer sur le plateau')); if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`), "intro button");
  await click(start.x, start.y);
  await until(() => evaluate(`document.querySelector('${sceneSelector}')?.dataset.inputLocked === 'false'`), "intro completion");
  await evaluate(`(() => { const s=document.querySelector('${modeSelector}');s.value='trace';s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await delay(80);
  const initial = await snapshot(), { scene } = initial;
  let startPoint = { x: scene.x + scene.width / 2, y: scene.y + scene.height * (334 / 640 + 0.3) };
  if (profile !== "flat") startPoint = await evaluate(`(async () => {
    const { createProjection, projectPoint } = await import('/dev/infortune-perspective/projection.js');
    const { cameraAt, normalizeCameraTimeline } = await import('/dev/infortune-perspective/cameraTimeline.js');
    const { project } = await fetch('/__atelier/infortune/camera-sequence').then(r => r.json());
    const rect = document.querySelector('${sceneSelector}').getBoundingClientRect();
    const point = projectPoint(320, 334 + 640 * 0.3, createProjection(rect.width, rect.height, cameraAt(normalizeCameraTimeline(project), 'intro', 5)));
    return { x: rect.x + point.x, y: rect.y + point.y };
  })()`);
  await pointer("down", startPoint);
  const pressed = await until(async () => { const value = await snapshot(); return value.guide ? value : null; }, "gesture guide");
  report.push({ label: "pressed", ...pressed });
  const numbers = pressed.guide.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
  const curve = [{ x: numbers[0], y: numbers[1] }, { x: numbers[2], y: numbers[3] }, { x: numbers[4], y: numbers[5] }];
  let position;
  for (let i = 1; i <= 36; i++) {
    const t = i / 36, u = 1 - t;
    position = { x: scene.x + (u*u*curve[0].x+2*u*t*curve[1].x+t*t*curve[2].x) * scene.width / pressed.bounds.width,
      y: scene.y + (u*u*curve[0].y+2*u*t*curve[1].y+t*t*curve[2].y) * scene.height / pressed.bounds.height };
    await pointer("move", position);
    await delay(10);
    if (i === 18) report.push({ label: "midpoint", ...await snapshot() });
  }
  report.push({ label: "before-release", ...await snapshot() });
  await pointer("up", position);
  await delay(120); report.push({ label: "released", ...await snapshot() });
  await capture(`gesture-result-${training ? "training-" : ""}${profile}-${touch ? "touch" : "mouse"}`);
  await delay(2000); report.push({ label: "after-two-seconds", ...await snapshot() });
  await delay(1800); report.push({ label: "after-expiry", ...await snapshot() });
  await fs.writeFile(path.join(output, `report-${training ? "training-" : ""}${profile}-${touch ? "touch" : "mouse"}.json`), JSON.stringify({ report, errors }, null, 2));
  console.log(JSON.stringify({ profile, touch, report: report.map(({ label, phase, progress, power, precision, hint, complete, quality }) =>
    ({ label, phase, progress, power, precision, hint, complete, quality })), errors }, null, 2));
  assert.equal(errors.length, 0, "No runtime exception during real pointer input");
  assert.notEqual(report[1].cursor, report[0].cursor, "Pointer motion must move the visible cursor");
  assert.ok(parseFloat(report[1].power) > 0, "The live gauge must respond to real pointer events");
  assert.ok(parseFloat(report[1].progress) > 30 && parseFloat(report[1].progress) < 70, "The progress gauge follows the drawn path");
  assert.equal(report[3].quality, "perfect", "Following the visible guide can earn a perfect bonus");
  assert.equal(report[3].complete, "true", "The release leaves a visible replay");
  assert.equal(report[4].cursor, report[3].cursor, "The actual release point is retained after two seconds");
  assert.equal(report[4].power, report[3].power, "The released gauge does not decay during replay");
  assert.equal(report[5].guide, undefined, "The replay disappears after its reading time");
  if (training) {
    await until(() => evaluate("[...document.querySelectorAll('.wheel-test__actions button')].some(b => b.textContent.includes('Un autre tour') && !b.disabled)"), "return to plateau");
    assert.match(await evaluate("document.querySelector('.wheel-test__summary').textContent"), /1 lancer terminé · 100/);
    await evaluate("window.__testWheelCanvas = document.querySelector('canvas'); [...document.querySelectorAll('button')].find(b => b.textContent.includes('Un autre tour')).click()");
    assert.equal(await evaluate("document.querySelector('.wheel-test__scene').dataset.inputLocked"), "true", "Replay locks input during the new intro");
    await until(() => evaluate("document.querySelector('.wheel-test__scene').dataset.inputLocked === 'false'"), "replay intro completion");
    assert.equal(await evaluate("window.__testWheelCanvas === document.querySelector('canvas')"), true, "Replaying retains the prepared canvas");
    assert.equal((await snapshot()).phase, "ready");
    await evaluate("Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); document.querySelector('.wheel-test__feedback .wheel-test__card button').click()");
    const copied = await until(() => evaluate("document.querySelector('.wheel-test__feedback textarea')?.value"), "manual report fallback");
    assert.match(copied, /lancers terminés : 1/);
    assert.match(copied, /Navigateur :/);
    assert.equal(await evaluate("!!document.querySelector('.camera-timeline, .perspective-workshop__camera')"), false);
    console.log("Training: result, replay without canvas recreation, intro lock and report fallback passed.");
  }
} finally {
  if (cdp) await cdp("Browser.close").catch(() => {});
  socket?.close(); if (chrome && chrome.exitCode === null) chrome.kill();
}
