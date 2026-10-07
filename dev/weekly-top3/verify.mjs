import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, ".tmp/weekly-top3");
const origin = process.env.WEEKLY_TOP3_ORIGIN || "http://127.0.0.1:8773";
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
const call = (method, ...args) => evaluate(`window.weeklyTop3Fixture[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
const snapshot = () => call("snapshot");
function check(label, condition, detail) { checks++; assert.ok(condition, `${label}: ${JSON.stringify(detail)}`); }
const settle = () => delay(310);
async function reset(scenario = "normal", dark = false) { await call("reset", scenario, dark); await settle(); }
async function select(value) {
  await evaluate(`(() => { const el = document.querySelector("select"); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await settle();
}
async function click(text) {
  await evaluate(`(() => { const el = [...document.querySelectorAll("button")].find(el => el.textContent.trim() === ${JSON.stringify(text)} || el.getAttribute("aria-label") === ${JSON.stringify(text)}); if (!el) throw new Error("Missing button"); el.click(); })()`);
  await settle();
}
async function capture(label) {
  const state = await snapshot(); cases.push({ label, ...state });
  const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(output, `${label}.png`), Buffer.from(screenshot.data, "base64"));
  return state;
}
async function swipe(width, height, direction) {
  const start = width * (direction === "left" ? 0.8 : 0.2);
  const end = width * (direction === "left" ? 0.2 : 0.8);
  const y = height * 0.55;
  await cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: start, y }] });
  for (let step = 1; step <= 5; step++) {
    await cdp("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start + (end - start) * step / 5, y }] });
  }
  await cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await settle();
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
    const mobile = device.name !== "desktop";
    await cdp("Emulation.setDeviceMetricsOverride", { width: device.width, height: device.height, deviceScaleFactor: 1, mobile });
    await cdp("Emulation.setTouchEmulationEnabled", { enabled: mobile });
    await cdp("Page.navigate", { url: `${origin}/dev/weekly-top3/` });
    await until(() => evaluate("!!window.weeklyTop3Fixture"), "fixture");
    await reset();
    let state = await capture(`${device.name}-normal`);
    check("Page titled Top 3", state.title === "Top 3", state);
    check("All 11 round types available", state.options.length === 11, state.options);
    check("Positive-score-only rule visible", state.text.includes("score supérieur à 0"), state.text);
    for (const text of ["100 %", "75 %", "40 %", "0 %", "2 / 5 manches", "0 / 4 manches"]) {
      check(`Shows ${text}`, state.text.includes(text), state.text);
    }
    check("Dialog stays in viewport", state.panel.x >= 0 && state.panel.right <= device.width + 1 && state.panel.y >= 0 && state.panel.bottom <= device.height + 1, state);
    check("Select stays in viewport", state.select.x >= 0 && state.select.right <= device.width + 1, state);
    check("No horizontal list/page overflow", state.scrollWidth <= state.scrollClientWidth + 1 && state.documentWidth <= device.width + 1, state);
    for (let index = 0; index < state.options.length; index++) {
      const option = state.options[index];
      await select(option.value);
      const selected = await snapshot();
      check(`Select ${option.value} updates actual dataset`, selected.selected === option.value && selected.text.includes(`${index + 2} / ${index + 5} manches`), selected);
      check(`Select ${option.value} does not turn page`, selected.title === "Top 3", selected);
    }
    await select("target_score");
    await capture(`${device.name}-target-score`);
    if (mobile) {
      await swipe(device.width, device.height, "left");
      check("Horizontal swipe reaches next stats page", (await snapshot()).title === "Mots par manche", await snapshot());
      await swipe(device.width, device.height, "right");
    } else {
      await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" });
      await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight" });
      await settle();
      check("Arrow key reaches next stats page", (await snapshot()).title === "Mots par manche", await snapshot());
      await click("Page precedente");
    }
    state = await snapshot();
    check("Returning keeps selected round type", state.title === "Top 3" && state.selected === "target_score", state);
    await delay(500);
    await click("Voir le profil de Alice");
    state = await snapshot();
    check("Player profile target retained", state.profile?.userId === 9101 && state.profile.nick === "Alice", state);
    await click("Saison");
    check("Season page still opens", (await snapshot()).tab === "season", await snapshot());
    await click("Hebdo");
    check("Returning from season preserves Top 3", (await snapshot()).title === "Top 3", await snapshot());
    await reset("partial", true);
    state = await capture(`${device.name}-partial-dark`);
    check("Partial-week coverage explained", state.text.includes("Suivi depuis le"), state.text);
    for (const [scenario, expected] of [["empty", "Pas encore de manches"], ["loading", "Chargement..."], ["error", "Impossible de recuperer les stats"], ["old", "Pas encore de manches"]]) {
      await reset(scenario);
      state = await snapshot();
      check(`Handles ${scenario}`, state.text.includes(expected), state.text);
    }
    await capture(`${device.name}-old-empty`);
    await click("Fermer");
    check("Close dismisses statistics", (await snapshot()).closes === 1 && !(await snapshot()).panel, await snapshot());
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
