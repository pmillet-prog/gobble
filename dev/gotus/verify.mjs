import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { createGotusUi, GOTUS_READY } from "./inputUi.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, ".tmp/gotus-ui");
const origin = "http://127.0.0.1:5192";
const responsiveOnly = process.argv.includes("--responsive-only");
const introOnly = process.argv.includes("--intro-only");
const chatOnly = process.argv.includes("--chat-only");
const inputOnly = process.argv.includes("--input-only");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const children = [], logs = [], errors = [], cases = [];
let cdp, socket;
await fs.mkdir(output, { recursive: true });
async function start(command, args, name) {
  const log = await fs.open(path.join(output, `${name}.log`), "w"); logs.push(log);
  const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: ["ignore", log.fd, log.fd] });
  children.push(child); child.on("error", error => errors.push(`${name}: ${error.message}`));
}
async function waitFor(read, label) {
  for (let i = 0; i < 100; i++) { try { const value = await read(); if (value) return value; } catch {} await delay(150); }
  throw new Error(`Timeout: ${label}`);
}
function connect(ws) {
  let id = 0; const pending = new Map();
  ws.on("message", raw => {
    const message = JSON.parse(raw);
    if (message.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(message.params.exceptionDetails));
    const task = pending.get(message.id); if (!task) return;
    pending.delete(message.id); clearTimeout(task.timer);
    if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result);
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const token = ++id, timer = setTimeout(() => reject(new Error(`CDP timeout ${method}`)), 15000);
    pending.set(token, { resolve, reject, timer }); ws.send(JSON.stringify({ id: token, method, params }));
  });
}
async function evaluate(expression) {
  const value = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails));
  return value.result.value;
}
async function capture(name) {
  const image = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(image.data, "base64"));
}
async function propose(word, mobile) {
  const ui = createGotusUi({ cdp, evaluate, mobile });
  await ui.word(word);
  await ui.submit();
  await delay(1900);
}
try {
  await start(process.execPath, [...process.execArgv, "node_modules/vite/bin/vite.js", "--config", "dev/gotus/vite.config.mjs"], "vite");
  await waitFor(async () => (await fetch(`${origin}/dev/gotus/`)).ok, "Vite");
  let chrome;
  for (const candidate of ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"]) {
    try { await fs.access(candidate); chrome = candidate; break; } catch {}
  }
  assert.ok(chrome, "Chromium unavailable");
  const portServer = net.createServer(); await new Promise(resolve => portServer.listen(0, "127.0.0.1", resolve));
  const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
  await start(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(output, `chrome-${Date.now()}`)}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "about:blank"], "chrome");
  const target = await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json())).find(page => page.type === "page"), "Chrome");
  socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise(resolve => socket.once("open", resolve)); cdp = connect(socket);
  await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");
  await cdp("Network.setBlockedURLs", { urls: ["https://gobble.fr/*", "http://gobble.fr/*"] });
  if (inputOnly) {
    const { runGotusInputChecks } = await import("./inputCases.mjs");
    await runGotusInputChecks({ cdp, evaluate, capture, waitFor, delay, origin, cases });
  } else if (chatOnly) {
    const { runGotusChatChecks } = await import("./chatCases.mjs");
    await runGotusChatChecks({ cdp, evaluate, capture, waitFor, delay, origin, cases });
  } else if (introOnly) {
    const { runGotusIntroChecks } = await import("./introCases.mjs");
    await runGotusIntroChecks({ cdp, evaluate, capture, waitFor, delay, origin, cases });
  } else if (responsiveOnly) {
    const { runGotusResponsiveChecks } = await import("./responsiveCases.mjs");
    await runGotusResponsiveChecks({ cdp, evaluate, capture, waitFor, delay, origin, cases,
      desktopOnly: process.argv.includes("--desktop-only"), mobileOnly: process.argv.includes("--mobile-only") });
  } else {
  for (const profile of process.argv.includes("--waiting-only") ? [] : [{ name: "desktop", width: 1280, height: 900, mobile: false }, { name: "mobile", width: 390, height: 844, mobile: true }, { name: "small", width: 320, height: 568, mobile: true }]) {
    await cdp("Emulation.setDeviceMetricsOverride", { ...profile, deviceScaleFactor: 1 });
    await cdp("Page.navigate", { url: `${origin}/dev/gotus/` });
    await waitFor(() => evaluate("window.gotusFixture?.state()?.phase === 'playing'"), "Gotus ready");
    await evaluate("window.gotusFixture.unlock()"); await waitFor(() => evaluate("window.gotusFixture.prepared()"), "five sounds decoded");
    await waitFor(() => evaluate("!document.querySelector('.gotus-intro')"), "initial intro finished");
    await delay(150); await capture(`${profile.name}-playing`);
    const geometry = await evaluate(`(() => { const panel=document.querySelector('.gotus__playground'), board=document.querySelector('.gotus__board'), keys=document.querySelector('.gotus__keyboard'); return { viewport:innerWidth,bodyWidth:document.body.scrollWidth,panel:panel.getBoundingClientRect().toJSON(),panelScroll:panel.scrollHeight,panelHeight:panel.clientHeight,board:board.getBoundingClientRect().toJSON(),keys:keys.getBoundingClientRect().toJSON(),cells:board.querySelectorAll('[role=gridcell]').length,images:[...document.images].map(image=>({src:image.getAttribute('src'),loaded:image.complete&&image.naturalWidth>0})) }; })()`);
    assert.equal(geometry.cells, 36); assert.ok(geometry.bodyWidth <= profile.width + 1, "horizontal overflow");
    assert.ok(geometry.images.every(image => image.loaded), "images loaded");
    cases.push({ profile: profile.name, geometry });
    await propose("BANANE", profile.mobile); await capture(`${profile.name}-marks`);
    if (profile.name !== "small") {
      await propose("BALLON", profile.mobile); await delay(120);
      const winning = await evaluate("({state:gotusFixture.state(),neutral:document.querySelectorAll('[data-victory-neutral=true]').length,sounds:gotusFixture.sounds.filter(sound=>Math.abs(sound.duration-68132/48000)>.002)})");
      assert.equal(winning.state.phase, "won"); assert.equal(winning.neutral, 1); assert.equal(winning.sounds.length, 13);
      cases.push({ profile: profile.name, winning }); await capture(`${profile.name}-victory`);
      await delay(2600);
      assert.equal(await evaluate("document.querySelectorAll('[data-victory-neutral=true]').length"), 0);
      const cascade = await evaluate("gotusFixture.cascade");
      assert.deepEqual(cascade.map(frame => frame.column), Array.from({ length: 24 }, (_, index) => index % 6));
      cases.push({ profile: profile.name, cascade });
    }
  }
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp("Page.navigate", { url: `${origin}/dev/gotus/` });
  await waitFor(() => evaluate("!!window.gotusFixture?.waiting"), "waiting fixture ready");
  for (const kind of ["session", "offer", "reminder"]) {
    await evaluate(`gotusFixture.waiting(${JSON.stringify(kind)})`);
    await waitFor(() => evaluate(kind === "session" ? GOTUS_READY : "!!document.querySelector('.gotus-waiting__dialog')"), "waiting surface");
    if (kind === "session") await waitFor(() => evaluate("!document.querySelector('.gotus-intro')"), "waiting intro finished");
    await delay(150); await capture(`mobile-waiting-${kind}`);
    const geometry = await evaluate(`(() => { const dialog=document.querySelector('.gotus-waiting__dialog')||document.querySelector('.gotus-waiting__game'); return { rect:dialog.getBoundingClientRect().toJSON(),bodyWidth:document.body.scrollWidth,buttons:[...dialog.querySelectorAll('button')].filter(button=>button.offsetWidth>0).map(button=>{ const rect=button.getBoundingClientRect(); return {text:button.textContent.trim(),rect:rect.toJSON(),topmost:document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)===button};}) }; })()`);
    assert.ok(geometry.rect.left >= 0 && geometry.rect.right <= 390);
    assert.ok(geometry.rect.top >= 0 && geometry.rect.bottom <= 844);
    assert.ok(geometry.bodyWidth <= 390);
    if (kind !== "session") assert.ok(geometry.buttons.every(button => button.topmost), "dialog controls are reachable");
    cases.push({ waiting: kind, geometry });
    if (kind === "offer") {
      await evaluate("document.querySelector('.gotus-waiting__actions button').click()"); await delay(100);
      assert.equal(await evaluate("gotusFixture.actions.at(-1)"), "startTraining");
    } else if (kind === "reminder") {
      await evaluate("document.querySelector('.gotus-waiting__dialog input').click()"); await delay(50);
      assert.equal(await evaluate("document.querySelector('.gotus-waiting__dialog input').checked"), true);
      await evaluate("document.querySelectorAll('.gotus-waiting__actions button')[1].click()"); await delay(50);
      assert.equal(await evaluate("gotusFixture.actions.at(-1)"), "dismissDialog");
    }
  }
  }
  assert.deepEqual(errors, []);
} catch (error) { errors.push(error.stack); process.exitCode = 1; }
finally {
  await fs.writeFile(path.join(output, inputOnly ? "input-measurements.json" : chatOnly ? "chat-measurements.json" : introOnly ? "intro-measurements.json" : responsiveOnly ? process.argv.includes("--desktop-only") ? "responsive-desktop-measurements.json" : process.argv.includes("--mobile-only") ? "responsive-mobile-measurements.json" : "responsive-measurements.json" : process.argv.includes("--waiting-only") ? "waiting-measurements.json" : "measurements.json"), JSON.stringify({ cases, errors, limitations: "Synthetic desktop Chrome viewports; no real phone software keyboard or physical speaker listening. Gotus uses its production fullscreen surface and real chat feature/views with an in-memory transport; no backend connection." }, null, 2));
  if (cdp) await cdp("Browser.close").catch(() => {}); socket?.close();
  for (const child of children.reverse()) if (child.exitCode === null) child.kill();
  for (const log of logs) await log.close();
}
console.log(JSON.stringify({ output, cases: cases.length, errors }, null, 2));
