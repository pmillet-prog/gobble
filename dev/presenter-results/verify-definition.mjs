import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, ".tmp/presenter-results/definitions");
const origin = process.env.PRESENTER_REVIEW_ORIGIN || "http://127.0.0.1:8771";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
await fs.mkdir(output, { recursive: true });
const errors = [], cases = [];
let chrome, socket, cdp, checks = 0;
async function waitFor(read, label) {
  let lastError;
  for (let i = 0; i < 100; i++) {
    try { const result = await read(); if (result) return result; }
    catch (error) { lastError = error; }
    await delay(150);
  }
  throw new Error(`${label}: ${lastError?.message || "timeout"}`);
}
function check(condition, message) { checks++; assert.ok(condition, message); }
function connect(ws) {
  let seq = 0;
  const pending = new Map();
  ws.on("message", data => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id); clearTimeout(item.timeout);
    if (message.error) item.reject(new Error(JSON.stringify(message.error)));
    else item.resolve(message.result);
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method}: timeout`)); }, 15000);
    pending.set(id, { resolve, reject, timeout });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function screenshot(name) {
  const result = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(result.data, "base64"));
}
try {
  let chromePath;
  for (const candidate of [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean)) {
    try { await fs.access(candidate); chromePath = candidate; break; } catch {}
  }
  assert.ok(chromePath, "Chromium executable unavailable");
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  chrome = spawn(chromePath, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(output, `chrome-${stamp}`)}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "about:blank"], { cwd: root, windowsHide: true, stdio: "ignore" });
  const target = await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json())).find(page => page.type === "page"), "Chrome");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  cdp = connect(socket);
  await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");
  await cdp("Network.setBlockedURLs", { urls: ["https://gobble.fr/*", "http://gobble.fr/*"] });
  for (const profile of [{ name: "desktop", width: 1280, height: 900, mobile: false }, { name: "mobile", width: 390, height: 844, mobile: true }]) {
    await cdp("Emulation.setDeviceMetricsOverride", { ...profile, deviceScaleFactor: 1, screenWidth: profile.width, screenHeight: profile.height });
    for (const dark of [false, true]) {
      const name = `${profile.name}-${dark ? "dark" : "light"}`;
      await cdp("Page.navigate", { url: `${origin}/dev/presenter-results/definition.html${dark ? "?dark" : ""}` });
      await waitFor(() => evaluate("window.definitionReview?.ready && [...document.images].every(image => image.complete)"), `${name}: ready`);
      const panel = await evaluate(`(() => {
        const image = document.querySelector('img[alt="QPUC"]');
        const button = image?.closest('button');
        const rect = button?.getBoundingClientRect();
        return { artwork: image?.naturalWidth > 0, label: button?.textContent, rect: rect?.toJSON(), overflow: document.documentElement.scrollWidth > innerWidth };
      })()`);
      check(panel.artwork, `${name}: QPUC artwork loaded`);
      check(panel.label.includes("BANC"), `${name}: answer word visible`);
      check(!panel.overflow && panel.rect.right <= profile.width, `${name}: panel fits viewport`);
      await screenshot(`${name}-bilan`);
      await evaluate("document.querySelector('img[alt=\"QPUC\"]').closest('button').click()");
      await waitFor(() => evaluate("!!document.querySelector('[role=dialog] mark')"), `${name}: definition loaded`);
      const modal = await evaluate(`(() => {
        const dialog = document.querySelector('[role=dialog]');
        const rect = dialog.getBoundingClientRect();
        const meanings = [...dialog.querySelectorAll('ol > li')];
        const vault = dialog.querySelector('[aria-label="Ajouter au coffre fort"]');
        const vaultRect = vault?.getBoundingClientRect();
        return { selectedIndex: meanings.findIndex(item => !!item.querySelector('mark')), selectedText: dialog.querySelector('mark')?.textContent, count: meanings.length, rect: rect.toJSON(), vaultRect: vaultRect?.toJSON(), source: !!dialog.querySelector('a[href="https://fr.wiktionary.org/wiki/banc"]') };
      })()`);
      check(modal.count === 3 && modal.selectedIndex === 1, `${name}: only second meaning highlighted`);
      check(modal.selectedText.includes("Groupe de poissons"), `${name}: question matches selected meaning`);
      check(modal.rect.left >= 0 && modal.rect.right <= profile.width && modal.rect.top >= 0 && modal.rect.bottom <= profile.height, `${name}: dialog fully visible`);
      check(modal.vaultRect?.bottom <= profile.height && modal.vaultRect?.left >= 0, `${name}: vault action visible`);
      check(modal.source, `${name}: usual source link present`);
      await screenshot(`${name}-definition`);
      await evaluate("document.querySelector('[aria-label=\"Ajouter au coffre fort\"]').click()");
      await waitFor(() => evaluate("!!document.querySelector('[aria-label=\"Mot déjà ajouté au coffre fort\"]')"), `${name}: vault action works`);
      checks++;
      cases.push({ name, panel, modal });
    }
  }
  check(errors.length === 0, "No browser exceptions");
} finally {
  await fs.writeFile(path.join(output, "verification.json"), JSON.stringify({ checks, cases, errors, limitation: "Real UI components with fixture data in Chromium; no game backend or physical iPhone involved." }, null, 2));
  if (cdp) await cdp("Browser.close").catch(() => {});
  socket?.close();
  if (chrome && chrome.exitCode === null) chrome.kill();
}
console.log(JSON.stringify({ checks, cases: cases.length, errors, output }, null, 2));
