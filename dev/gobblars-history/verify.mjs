import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, ".tmp/gobblars-history");
const origin = process.env.GOBBLARS_HISTORY_ORIGIN || "http://127.0.0.1:8774";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
await fs.mkdir(output, { recursive: true });
const errors = [], cases = [];
let checks = 0, chrome, socket, cdp;
async function until(read, label) {
  for (let index = 0; index < 160; index++) {
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
    if (!message.id) {
      if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
      return;
    }
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
const call = (method, ...args) => evaluate(`window.gobblarsHistoryFixture[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
const snapshot = () => call("snapshot");
function check(label, condition, detail) { checks++; assert.ok(condition, `${label}: ${JSON.stringify(detail)}`); }
async function reset(scenario = "normal") {
  await call("reset", scenario);
  await until(async () => (await snapshot()).busy === (scenario === "loading" ? "true" : "false"), `scenario ${scenario}`);
}
async function click(text) {
  await evaluate(`(() => { const el = [...document.querySelectorAll("dialog button")].find(el => el.textContent.trim() === ${JSON.stringify(text)} || el.getAttribute("aria-label") === ${JSON.stringify(text)}); if (!el) throw new Error("Missing button"); el.scrollIntoView({ block: "nearest" }); el.click(); })()`);
  await delay(100);
}
async function capture(label) {
  const state = await snapshot(); cases.push({ label, ...state });
  const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(output, `${label}.png`), Buffer.from(screenshot.data, "base64"));
  return state;
}
function checkBounds(state, width, height) {
  check("Dialog stays in viewport", state.panel.x >= 0 && state.panel.right <= width + 1 && state.panel.y >= 0 && state.panel.bottom <= height + 1, state.panel);
  check("No horizontal overflow", state.contentWidth <= state.clientWidth + 1 && state.documentWidth <= width + 1, state);
  check("All signed amounts remain inside dialog width", state.amounts.every(amount => amount.rect.x >= state.panel.x && amount.rect.right <= state.panel.right), state.amounts);
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
  await cdp("Network.setBlockedURLs", { urls: ["https://gobble.fr/*", "http://gobble.fr/*", "*/api/*"] });
  for (const device of [{ name: "desktop", width: 1280, height: 900 }, { name: "mobile", width: 390, height: 844 }, { name: "small-mobile", width: 320, height: 568 }]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width: device.width, height: device.height, deviceScaleFactor: 1, mobile: device.name !== "desktop" });
    await cdp("Page.navigate", { url: `${origin}/dev/gobblars-history/` });
    await until(() => evaluate("!!window.gobblarsHistoryFixture"), "fixture");
    await until(async () => (await snapshot()).busy === "false", "initial load");
    let state = await capture(`${device.name}-movements`);
    checkBounds(state, device.width, device.height);
    check("Dialog has accessible history title", state.title === "Historique des gobblars" && state.labelledBy === state.titleId, state);
    check("Close button receives initial focus", state.focus === "Fermer l’historique", state.focus);
    for (const expected of ["équipe gagnante", "Semaine 40 de 2026", "Chapeau de mage : 300 gobblars", "Rondes : 150 gobblars", "Nuit étoilée : 125 gobblars", "Avatar réinitialisé", "3 gobbles : +3", "Médailles (1 or) : +20"]) {
      check(`Displays ${expected}`, state.text.includes(expected), state.text);
    }
    for (const [text, label] of [["+100", "100 gobblars reçus"], ["−450", "450 gobblars dépensés"], ["−125", "125 gobblars dépensés"], ["+450", "450 gobblars restitués"]]) {
      check(`Signed and accessible amount ${text}`, state.amounts.some(item => item.text === text && item.label === label), state.amounts);
    }
    await click("Opérations précédentes");
    await until(async () => (await snapshot()).text.includes("Page 2"), "older page");
    state = await capture(`${device.name}-older-long-items`);
    checkBounds(state, device.width, device.height);
    check("Older page preserves snapshot cursor", state.requests[1]?.before === "fixture-before" && state.requests[1]?.snapshot === "fixture-snapshot" && state.requests[1]?.credentials === "include", state.requests);
    check("Full theme purchase and old avatar remain visible", state.text.includes("Élément de collection au nom très long numéro 8 : 125 gobblars") && state.text.includes("ancienne-coupe"), state.text);
    check("Final page hides older button", !state.buttons.some(button => button.text === "Opérations précédentes"), state.buttons);
    await click("Actualiser");
    await until(async () => (await snapshot()).text.includes("Semaine 40 de 2026"), "refresh");
    state = await snapshot();
    check("Refresh returns to latest page", state.text.includes("Page 1") && state.requests.at(-1).before === null, state);
    await reset("empty");
    state = await snapshot();
    check("Empty history covers all operations", state.text.includes("Aucune opération enregistrée.") && state.amounts.length === 0, state);
    await reset("loading");
    state = await snapshot();
    check("Loading is announced and refresh disabled", state.text.includes("Chargement…") && state.busy === "true" && state.buttons.find(button => button.text === "Actualiser")?.disabled, state);
    await reset("error");
    state = await snapshot();
    check("Error offers retry", state.text.includes("Impossible de charger ton historique") && state.buttons.some(button => button.text === "Réessayer"), state);
    await call("setScenario", "normal");
    await click("Réessayer");
    await until(async () => (await snapshot()).text.includes("Semaine 40 de 2026"), "retry recovery");
    check("Retry recovers movements", (await snapshot()).amounts.length === 5, await snapshot());
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await until(async () => !(await snapshot()).panel, "escape closes");
    check("Escape closes dialog once", (await snapshot()).closes === 1, await snapshot());
  }
  check("No uncaught browser exceptions", errors.length === 0, errors);
  console.log(JSON.stringify({ checks, screenshots: cases.length, errors }));
} catch (error) {
  process.exitCode = 1; console.error(error.stack);
} finally {
  await fs.writeFile(path.join(output, "verification.json"), JSON.stringify({ checks, cases, errors }, null, 2));
  if (cdp) await cdp("Browser.close").catch(() => {});
  socket?.close(); if (chrome?.exitCode === null) chrome.kill();
}
