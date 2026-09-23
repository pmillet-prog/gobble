// Local Chrome regression checks. These simulate iOS geometry, not WebKit itself.
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
const output = path.join(root, ".Tmp/ios-chat-layout-review");
const profile = await mkdtemp(path.join(tmpdir(), "gobble-ios-chat-layout-"));
const vite = await createServer({ root, configFile: false, logLevel: "error",
  optimizeDeps: { entries: [path.join(root, "dev/ios-chat-layout/index.html")] },
  server: { host: "127.0.0.1", port: 0 } });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await read(); if (value) return value; await sleep(50); }
  throw new Error("Layout browser timed out");
}
let chrome, socket, send;
try {
  await vite.listen(); await mkdir(output, { recursive: true });
  chrome = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  const port = await until(() => readFile(path.join(profile, "DevToolsActivePort"), "utf8").then(text => Number(text.split("\n")[0])).catch(() => null));
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl); await once(socket, "open");
  let id = 0; const pending = new Map(), errors = [], measurements = [];
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    const task = pending.get(message.id);
    if (task) { pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }
  });
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(requestId, { resolve, reject, timer }); socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || "Evaluation failed");
    return result.result.value;
  };
  const settle = () => evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
  const capture = async (name, { safeTop, homeHeight }) => {
    await settle();
    const size = await evaluate(`(() => {
      const rect = node => { const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}; };
      const header=document.querySelector('.chat-content-header');
      const close=[...header.querySelectorAll('button')].find(el=>el.textContent==='Fermer');
      const r=close.getBoundingClientRect();
      return {home:rect(document.querySelector('.home-lobby-screen')), header:rect(header), input:rect(document.querySelector('textarea')),
        viewport:{height:visualViewport.height,top:visualViewport.offsetTop,width:visualViewport.width,innerHeight,clientHeight:document.documentElement.clientHeight},
        sheetHeight:document.querySelector('.chat-content').getBoundingClientRect().height,
        closeHit:close.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
    })()`);
    assert.ok(size.header.top >= safeTop, `${name}: header below status bar`);
    assert.ok(size.input.bottom <= size.viewport.top + size.viewport.height, `${name}: input above keyboard`);
    assert.equal(size.closeHit, true, `${name}: close button receives taps`);
    assert.equal(size.home.height, homeHeight, `${name}: home height stays stable`);
    measurements.push({ name, ...size });
    const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path.join(output, `${name}.png`), Buffer.from(screenshot.data, "base64"));
    console.log(`${name}: ${JSON.stringify(size)}`);
  };
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 Version/26.6 Mobile/15E148 Safari/604.1" });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34, left: 0, right: 0 } });
  await send("Page.navigate", { url: `http://127.0.0.1:${vite.httpServer.address().port}/dev/ios-chat-layout/index.html` });
  await until(async () => { assert.deepEqual(errors, []); return evaluate("!!document.querySelector('.chat-content-header')"); });
  await send("Emulation.setSmallViewportHeightDifferenceOverride", { difference: 47 });
  assert.equal(await evaluate("!!document.querySelector('.home-lobby-ios-standalone')"), true);
  await evaluate("window.setLayoutViewport({height:797,offsetTop:0})");
  await capture("iphone13-installed", { safeTop: 47, homeHeight: 844 });
  await evaluate("document.querySelector('textarea').focus({preventScroll:true})");
  for (const [height, offsetTop] of [[700, 0], [478, 0], [478, 42], [320, 80]]) {
    await evaluate(`window.setLayoutViewport({height:${height},offsetTop:${offsetTop}})`);
    await capture(`keyboard-${height}-${offsetTop}`, { safeTop: 47, homeHeight: 844 });
  }
  await evaluate("document.querySelector('textarea').blur(); window.setLayoutViewport({height:797,offsetTop:0})");
  await settle();
  assert.equal(await evaluate("!!document.querySelector('.chat-content-header')"), false, "keyboard dismissal still closes the chat");
  await evaluate("window.openLayoutChat()");
  await capture("iphone13-reopened", { safeTop: 47, homeHeight: 844 });
  await evaluate(`document.querySelector('.chat-content-header button:last-child').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
  await settle();
  assert.equal(await evaluate("!!document.querySelector('.chat-content-header')"), false, "close still works");
  await send("Page.navigate", { url: `http://127.0.0.1:${vite.httpServer.address().port}/dev/ios-chat-layout/index.html?mode=browser` });
  await until(async () => { assert.deepEqual(errors, []); return evaluate("!!document.querySelector('.chat-content-header')"); });
  await send("Emulation.setSmallViewportHeightDifferenceOverride", { difference: 47 });
  await send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 0, left: 0, right: 0 } });
  await evaluate("window.setLayoutViewport({height:797,offsetTop:0})");
  await capture("browser", { safeTop: 0, homeHeight: 797 });
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "measurements.json"), JSON.stringify(measurements, null, 2));
  console.log(`${measurements.length} layout checks passed (simulated geometry, not a physical iPhone).`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) await send?.("Browser.close").catch(() => {});
  socket?.close();
  if (chrome && chrome.exitCode === null) chrome.kill(); // Only this isolated headless browser.
  await vite.close();
  if (path.dirname(profile) === path.resolve(tmpdir()) && path.basename(profile).startsWith("gobble-ios-chat-layout-")) {
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
  }
}
