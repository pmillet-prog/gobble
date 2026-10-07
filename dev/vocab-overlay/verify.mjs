import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const root = fileURLToPath(new URL("../../", import.meta.url));
const mode = process.argv.includes("--baseline") ? "baseline" : "current";
const quick = process.argv.includes("--quick");
const smallOnly = process.argv.includes("--small-only");
const supplement = smallOnly || process.argv.includes("--supplement");
const output = path.join(root, ".tmp/vocab-overlay", `${mode}${smallOnly ? "-small" : supplement ? "-supplement" : ""}`);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const origin = process.env.VOCAB_OVERLAY_ORIGIN || "http://127.0.0.1:5187";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
await fs.mkdir(output, { recursive: true });
const processes = [], logs = [], errors = [], cases = [], failures = [];
let socket, cdp, checks = 0;
async function start(command, args, name) {
  const log = await fs.open(path.join(output, `${name}-${stamp}.log`), "w");
  logs.push(log);
  const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: ["ignore", log.fd, log.fd] });
  processes.push(child);
  child.on("error", error => errors.push(`${name}: ${error.message}`));
  return child;
}
async function waitFor(read, description) {
  let latest;
  for (let i = 0; i < 120; i++) {
    try { const value = await read(); if (value) return value; } catch (error) { latest = error; }
    await delay(200);
  }
  throw new Error(`Timed out: ${description}; ${latest?.message || ""}`);
}
function attach(ws) {
  let sequence = 0;
  const pending = new Map();
  ws.on("message", raw => {
    const message = JSON.parse(raw);
    if (!message.id) {
      if (message.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(message.params.exceptionDetails));
      return;
    }
    const item = pending.get(message.id);
    if (!item) return;
    clearTimeout(item.timer); pending.delete(message.id);
    if (message.error) item.reject(new Error(JSON.stringify(message.error)));
    else item.resolve(message.result);
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const call = (method, ...args) => evaluate(`window.vocabOverlayFixture[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
function check(name, condition, detail) { checks++; if (!condition) failures.push({ name, detail }); }
async function screenshot(name) {
  const result = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(result.data, "base64"));
}
async function navigate(profile) {
  await cdp("Emulation.setDeviceMetricsOverride", { width: profile.width, height: profile.height, deviceScaleFactor: 1, mobile: profile.mobile, screenWidth: profile.width, screenHeight: profile.height });
  await cdp("Page.navigate", { url: `${origin}/dev/vocab-overlay/${mode === "baseline" ? "?baseline" : ""}` });
  await waitFor(() => evaluate("!!window.vocabOverlayFixture"), "fixture ready");
  await delay(500);
}
function checkRun(name, result, payload, capture, profile) {
  check(`${name}: all weekly words rendered`, result.ticks.length === payload.words.length, result.ticks.length);
  check(`${name}: each word beep once`, result.ticks.every((tick, i) => tick.index === i + 1), result.ticks.map(tick => tick.index));
  check(`${name}: season beeps match`, result.ticks.filter(tick => tick.season).length === payload.seasonWords.length, result.ticks);
  check(`${name}: panel within viewport`, capture.panel && capture.panel.x >= -1 && capture.panel.y >= -1 && capture.panel.right <= profile.width + 1 && capture.panel.bottom <= profile.height + 1, capture.panel);
  check(`${name}: rank artwork loaded`, capture.images.every(image => image.loaded), capture.images);
  const weeklyTotal = `${payload.weeklyTargetCount} cette semaine`;
  check(`${name}: final weekly total visible`, capture.text.includes(weeklyTotal), capture.text);
  const seasonTotal = payload.targetCount.toLocaleString("fr-FR");
  check(`${name}: final unique total visible`, capture.text.replace(/\s/g, "").includes(seasonTotal.replace(/\s/g, "")), capture.text);
  if (name.includes("levelup")) check(`${name}: confetti for level up`, result.confetti === 1, result.confetti);
  if (mode === "current") {
    const bar = capture.progressbars[0];
    check(`${name}: accessible unique progression`, bar && Number(bar.value) === payload.targetCount, bar);
    if (bar) {
      const [newFill, baseFill] = bar.fills;
      const expectedWidth = bar.rect.width * (Number(bar.value) - Number(bar.min)) / (Number(bar.max) - Number(bar.min));
      check(`${name}: fills anchored to the same track`, Math.abs(newFill.rect.x - bar.rect.x) < 1 && Math.abs(baseFill.rect.x - bar.rect.x) < 1, bar);
      check(`${name}: fill matches progression`, Math.abs(newFill.rect.width - expectedWidth) < 1, { expectedWidth, bar });
      check(`${name}: fills stay inside track`, bar.fills.every(fill => fill.rect.x >= bar.rect.x - 1 && fill.rect.right <= bar.rect.right + 1), bar);
    }
  }
}
try {
  if (!process.env.VOCAB_OVERLAY_ORIGIN) {
    await start(process.execPath, [...process.execArgv, "node_modules/vite/bin/vite.js", "--config", "dev/vocab-overlay/vite.config.mjs"], "vite");
    await waitFor(async () => (await fetch(`${origin}/dev/vocab-overlay/`)).ok, "fixture Vite");
  }
  let chromePath;
  for (const candidate of [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean)) {
    try { await fs.access(candidate); chromePath = candidate; break; } catch {}
  }
  assert.ok(chromePath, "Chromium executable unavailable");
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  await start(chromePath, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(output, `chrome-${stamp}`)}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "about:blank"], "chrome");
  const target = await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json())).find(page => page.type === "page"), "Chrome");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  cdp = attach(socket);
  await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");
  await cdp("Network.setBlockedURLs", { urls: ["https://gobble.fr/*", "http://gobble.fr/*"] });
  for (const profile of (smallOnly ? [
    { name: "small", width: 320, height: 568, mobile: true },
  ] : supplement ? [
    { name: "desktop", width: 1280, height: 900, mobile: false },
    { name: "portrait", width: 390, height: 844, mobile: true },
    { name: "small", width: 320, height: 568, mobile: true },
  ] : [
    { name: "desktop", width: 1280, height: 900, mobile: false },
    { name: "mobile", width: 390, height: 750, mobile: true },
  ])) {
    await navigate(profile);
    if (supplement && profile.name === "desktop") {
      const payload = await call("start", "normal", { mobile: false });
      await delay(300);
      const before = await call("result");
      await call("noise", 100);
      const after = await call("result");
      const noise = { viewRenders: after.viewRenders - before.viewRenders, commits: after.commitCount - before.commitCount, renderMs: after.renderTotalMs - before.renderTotalMs };
      check("Parent noise reaches wrapper", noise.commits === 100, noise);
      if (mode === "current") check("Parent noise does not render view", noise.viewRenders === 0, noise);
      else check("Baseline reproduces parent renders", noise.viewRenders === 100, noise);
      const imageBefore = await call("snapshot");
      await call("changeImageUrl"); await delay(200);
      const imageAfter = await call("snapshot");
      check("Real asset URL changes propagate", imageBefore.images[0]?.src !== imageAfter.images[0]?.src && imageAfter.images[0]?.loaded, { before: imageBefore.images, after: imageAfter.images });
      await waitFor(async () => (await call("result")).ticks.length === payload.words.length, "Latest callbacks");
      const result = await call("end");
      check("Latest callback used for every word", result.callbackVersions.length === payload.words.length && result.callbackVersions.every(version => version === 100), result.callbackVersions);
      cases.push({ name: "parent-noise", noise, ...result });
      console.log(JSON.stringify({ name: "parent-noise", ...noise }));
      await call("stop"); await delay(300);
    }
    for (const scenario of (supplement ? (profile.name === "desktop" ? [] : ["normal", "firstlevel"]) : quick ? ["normal"] : ["zero", "normal", "many", "levelup"])) {
      const name = `${profile.name}-${scenario}`;
      const payload = await call("start", scenario, { mobile: profile.mobile, darkMode: profile.mobile });
      // Count duration is deliberately not sped up: verify the actual animation cadence.
      await waitFor(async () => (await call("result")).ticks.length === payload.words.length, `${name} word sequence`);
      await delay(scenario === "zero" ? 3000 : 700);
      const capture = await call("snapshot");
      const result = await call("end");
      checkRun(name, result, payload, capture, profile);
      await screenshot(name);
      cases.push({ name, profile, capture, ...result });
      await call("stop"); await delay(300);
      console.log(JSON.stringify({ name, commits: result.commitCount, renderMs: result.renderTotalMs, rectReads: result.rectReads, offsetReads: result.offsetReads, resizeCallbacks: result.resizeCallbacks, gapsOver50ms: result.gapsOver50ms, maxFrameGapMs: result.maxFrameGapMs, ticks: result.ticks.length }));
    }
    if (!quick && !supplement) {
      await call("start", "many", { mobile: profile.mobile });
      await delay(2400);
      await call("skip"); await delay(450);
      const afterSkip = await call("snapshot");
      const atSkip = await call("result");
      await delay(350);
      const skipped = await call("end");
      check(`${profile.name}: skip closes`, !afterSkip.open, afterSkip);
      check(`${profile.name}: skip cancels beeps`, skipped.ticks.length === atSkip.ticks.length, { before: atSkip.ticks.length, after: skipped.ticks.length });
      cases.push({ name: `${profile.name}-skip`, ...skipped });
      await call("start", "many", { mobile: profile.mobile });
      await delay(2400);
      await call("start", "zero", { mobile: profile.mobile, replace: true });
      const replaced = await call("result");
      await delay(3000);
      const replacement = await call("snapshot");
      const afterReplacement = await call("end");
      check(`${profile.name}: replacement cancels old beeps`, afterReplacement.ticks.length === replaced.ticks.length, { before: replaced.ticks.length, after: afterReplacement.ticks.length });
      check(`${profile.name}: replacement shows zero gain`, replacement.text.includes("+0"), replacement.text);
      cases.push({ name: `${profile.name}-replacement`, capture: replacement, ...afterReplacement });
      await call("stop"); await delay(300);
    }
  }
  check("No browser exceptions", errors.length === 0, errors);
} catch (error) { failures.push({ name: "Browser verification aborted", detail: error.stack }); }
finally {
  await fs.writeFile(path.join(output, "measurements.json"), JSON.stringify({ measuredAt: new Date().toISOString(), mode, limitations: "Development React profiler in desktop Chromium, synthetic dimensions. No real iPhone/GPU/software keyboard measurements; sounds and confetti callbacks counted but their engines are not run; screenshots taken after metric window.", checks, cases, failures, errors }, null, 2));
  if (cdp) await cdp("Browser.close").catch(() => {});
  socket?.close();
  for (const child of processes.reverse()) if (child.exitCode === null) child.kill();
  for (const log of logs) await log.close();
}
console.log(JSON.stringify({ mode, checks, cases: cases.length, failures, errors, output }, null, 2));
if (failures.length) process.exitCode = 1;
