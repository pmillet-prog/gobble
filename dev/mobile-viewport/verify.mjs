import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, ".tmp/mobile-viewport-review");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const origin = process.env.MOBILE_VIEWPORT_ORIGIN || "http://127.0.0.1:5186";
const fontOnly = process.argv.includes("--font-only");
const salonOnly = process.argv.includes("--salon-only");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
await fs.mkdir(output, { recursive: true });
const processes = [];
const logHandles = [];
const cases = [];
const failures = [];
const errors = [];
let checks = 0;
let socket;
let cdp;

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function startProcess(command, args, label) {
  const log = await fs.open(path.join(output, `${label}-${stamp}.log`), "w");
  logHandles.push(log);
  const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: ["ignore", log.fd, log.fd] });
  processes.push(child);
  child.on("error", error => errors.push(`${label}: ${error.message}`));
  return child;
}
async function waitFor(read, description) {
  let latest;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const value = await read(); if (value) return value; } catch (error) { latest = error; }
    await delay(150);
  }
  throw new Error(`Timed out: ${description}${latest ? ` (${latest.message})` : ""}`);
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
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function call(method, ...args) {
  return evaluate(`window.mobileViewportFixture[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
}
async function measure(name, screenshot = true) {
  await delay(440);
  const values = await evaluate(`(() => {
    const rect = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
    };
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
    const style = getComputedStyle(probe);
    const safe = Object.fromEntries(['Top','Right','Bottom','Left'].map(side => [side.toLowerCase(), parseFloat(style['padding' + side]) || 0]));
    probe.remove();
    const vv = window.visualViewport;
    const sendButton = document.querySelector('.chat-content-send');
    const sendRect = sendButton?.getBoundingClientRect();
    const sendHit = sendRect ? document.elementFromPoint(sendRect.x + sendRect.width / 2, sendRect.y + sendRect.height / 2) : null;
    return {
      view: window.mobileViewportFixture.getView(),
      inner: { width: innerWidth, height: innerHeight },
      visual: { width: vv.width, height: vv.height, offsetTop: vv.offsetTop, offsetLeft: vv.offsetLeft },
      safe, scrollY, rootScrollHeight: document.documentElement.scrollHeight,
      bodyPosition: getComputedStyle(document.body).position,
      rootPosition: getComputedStyle(document.documentElement).position,
      home: rect('.home-lobby-screen'), homeBottom: rect('.home-bottom-nav'), homeTutorial: rect('.home-tutorial-button'),
      salon: rect('.live-salon-scene'), salonStage: rect('.live-salon-stage'), salonReady: rect('.live-salon-ready'),
      salonTop: rect('.live-salon-top'), salonUtilities: rect('.live-salon-utilities'),
      backdrop: rect('.live-salon-backdrop'), board: rect('.mobile-game-viewport'), boardGrid: rect('[data-fixture-grid]'), header: rect('[data-fixture-header]'),
      panel: rect('[data-chat-panel]'), composer: rect('.chat-content-compose'), input: rect('textarea'),
      inputFont: document.querySelector('textarea') ? getComputedStyle(document.querySelector('textarea')).fontSize : null,
      activeInput: document.activeElement?.tagName === 'TEXTAREA',
      sendHit: sendButton ? { unobstructed: sendButton === sendHit || sendButton.contains(sendHit), hitTag: sendHit?.tagName, hitClass: sendHit?.className, hitText: sendHit?.textContent?.slice(0, 80) } : null,
      draft: window.mobileViewportFixture.getInput(),
    };
  })()`);
  cases.push({ name, ...values });
  if (screenshot) {
    const result = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(result.data, "base64"));
  }
  return values;
}
function check(name, condition, detail) {
  checks++;
  if (!condition) failures.push({ name, detail });
}
function sameRect(a, b, tolerance = 1) {
  return a && b && ["x", "y", "width", "height"].every(key => Math.abs(a[key] - b[key]) <= tolerance);
}
function screenRect(rect, viewport) {
  return rect && { ...rect, x: rect.x - viewport.offsetLeft, y: rect.y - viewport.offsetTop };
}
async function metrics(width, height, safe) {
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: height });
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await cdp("Emulation.setSafeAreaInsetsOverride", { insets: { ...safe, topMax: safe.top, bottomMax: safe.bottom, leftMax: safe.left, rightMax: safe.right } });
}
async function navigate(view) {
  await cdp("Page.navigate", { url: `${origin}/dev/mobile-viewport/?view=${view}` });
  await waitFor(() => evaluate(`document.documentElement.dataset.fixtureReady === ${JSON.stringify(view)} && !!window.mobileViewportFixture`), `fixture ${view}`);
  await delay(700);
}

try {
  if (!process.env.MOBILE_VIEWPORT_ORIGIN) {
    const vite = await startProcess(process.execPath, [...process.execArgv, "node_modules/vite/bin/vite.js", "--config", "dev/mobile-viewport/vite.config.mjs"], "vite");
    await waitFor(async () => {
      if (vite.exitCode !== null) throw new Error(`Fixture Vite exited: ${vite.exitCode}`);
      return (await fetch(`${origin}/dev/mobile-viewport/`)).ok;
    }, "fixture Vite");
  }
  const chromePaths = [process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].filter(Boolean);
  let chromePath;
  for (const candidate of chromePaths) { try { await fs.access(candidate); chromePath = candidate; break; } catch {} }
  assert.ok(chromePath, "Set CHROME_PATH to a Chromium browser executable");
  const port = await freePort();
  await startProcess(chromePath, ["--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(output, `chrome-${stamp}`)}`, "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "about:blank"], "chrome");
  const target = await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json())).find(page => page.type === "page"), "dedicated Chrome");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  cdp = attach(socket);
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  // Match production icon fonts; all game-origin requests remain forbidden.
  await cdp("Network.setBlockedURLs", { urls: ["https://gobble.fr/*", "http://gobble.fr/*"] });

  if (fontOnly) {
    await metrics(440, 956, { top: 62, bottom: 34, left: 0, right: 0 });
    await navigate("board");
    await call("openChat");
    await delay(440);
    const fonts = await evaluate(`(() => {
      const input = document.querySelector('textarea');
      const classes = input.className;
      const fixedFont = getComputedStyle(input).fontSize;
      let previousFont;
      try { input.classList.add('text-sm'); previousFont = getComputedStyle(input).fontSize; }
      finally { input.className = classes; }
      return { fixedFont, previousFont, restoredFont: getComputedStyle(input).fontSize, className: input.className };
    })()`);
    cases.push({ name: "production-font-cascade", ...fonts });
    check("Corrected input font is at least 16px", parseFloat(fonts.fixedFont) >= 16, fonts);
    check("Old text-sm class reproduces undersized input", parseFloat(fonts.previousFont) < 16, fonts);
    check("Temporary diagnostic fully restored", fonts.fixedFont === fonts.restoredFont && !fonts.className.split(/\s+/).includes("text-sm"), fonts);
  }
  for (const profile of (fontOnly || salonOnly ? [] : [
    { name: "iphone-like", width: 440, height: 956, safe: { top: 62, bottom: 34, left: 0, right: 0 } },
    { name: "iphone-reserved-status", width: 440, height: 894, safe: { top: 0, bottom: 34, left: 0, right: 0 } },
    { name: "android", width: 412, height: 915, safe: { top: 0, bottom: 24, left: 0, right: 0 } },
  ])) {
    const { name, width, height, safe } = profile;
    await metrics(width, height, safe);
    await navigate("home");
    let home = await measure(`${name}-home`);
    check(`${name}: home fits`, Math.abs(home.home.height - height) <= 1 && home.rootScrollHeight <= height + 1, home);
    check(`${name}: bottom buttons safe`, home.homeBottom.bottom <= height - safe.bottom + 1, home.homeBottom);
    await call("openChat");
    await call("focusComposer");
    await call("setInput", "Brouillon conservé à é è !");
    await call("setViewport", { width, height: 500, offsetTop: 36, offsetLeft: 0, scale: 1 });
    const homeKeyboard = await measure(`${name}-home-chat-keyboard`);
    check(`${name}: home stable while typing`, sameRect(screenRect(home.home, home.visual), screenRect(homeKeyboard.home, homeKeyboard.visual)), { before: home.home, after: homeKeyboard.home });
    check(`${name}: chat composer above keyboard`, homeKeyboard.input?.bottom <= 537 && homeKeyboard.input?.y >= 36, homeKeyboard.input);
    check(`${name}: chat focus and draft`, homeKeyboard.activeInput && homeKeyboard.draft === "Brouillon conservé à é è !", homeKeyboard);
    await call("setViewport", {});
    await evaluate("document.activeElement?.blur()");
    await call("closeChat");
    const homeRestored = await measure(`${name}-home-restored`, false);
    check(`${name}: chat restores underlying home lock`, homeRestored.bodyPosition === home.bodyPosition && homeRestored.rootPosition === home.rootPosition, homeRestored);
    for (let iteration = 0; iteration < 2; iteration++) {
      await metrics(width, height - 58, safe);
      await cdp("Page.reload", { ignoreCache: true });
      await waitFor(() => evaluate("!!window.mobileViewportFixture && document.documentElement.dataset.fixtureReady === 'home'"), "home reload");
      home = await measure(`${name}-reload-${iteration}`, iteration === 0);
      check(`${name}: reload ${iteration} smaller viewport fits`, home.home.height <= height - 57 && home.rootScrollHeight <= height - 57, home);
      await metrics(width, height, safe);
      await measure(`${name}-resize-restored-${iteration}`, false);
    }

    await navigate("salon");
    const salon = await measure(`${name}-salon`);
    check(`${name}: salon ready below safe area`, salon.salonReady.y >= safe.top - 1, salon.salonReady);
    await call("focusComposer");
    await call("setViewport", { width, height: 500, offsetTop: 48, offsetLeft: 0, scale: 1 });
    const salonKeyboard = await measure(`${name}-salon-keyboard`);
    check(`${name}: salon background stable`, sameRect(screenRect(salon.backdrop, salon.visual), screenRect(salonKeyboard.backdrop, salonKeyboard.visual)), { before: salon.backdrop, after: salonKeyboard.backdrop });
    check(`${name}: salon composer above keyboard`, salonKeyboard.input?.bottom <= 549 && salonKeyboard.input?.y >= 48, salonKeyboard.input);
    await call("setViewport", {});
    await evaluate("document.activeElement?.blur()");
    const salonRestored = await measure(`${name}-salon-restored`, false);
    check(`${name}: salon restores`, sameRect(salon.backdrop, salonRestored.backdrop), salonRestored);

    await navigate("board");
    const board = await measure(`${name}-board`);
    check(`${name}: game header below safe area`, board.header.y >= safe.top - 1, board.header);
    await call("openChat");
    await call("focusComposer");
    await call("setViewport", { width, height: 480, offsetTop: 48, offsetLeft: 0, scale: 1 });
    const boardKeyboard = await measure(`${name}-board-chat-keyboard`);
    check(`${name}: board stable`, sameRect(screenRect(board.boardGrid, board.visual), screenRect(boardKeyboard.boardGrid, boardKeyboard.visual)), { before: board.boardGrid, after: boardKeyboard.boardGrid });
    check(`${name}: header stable`, sameRect(screenRect(board.header, board.visual), screenRect(boardKeyboard.header, boardKeyboard.visual)), { before: board.header, after: boardKeyboard.header });
    check(`${name}: board chat composer visible`, boardKeyboard.input?.bottom <= 529 && boardKeyboard.input?.y >= 48, boardKeyboard.input);
    check(`${name}: input avoids small-font focus zoom`, parseFloat(boardKeyboard.inputFont) >= 16, boardKeyboard.inputFont);
    await call("setViewport", {});
    await evaluate("document.activeElement?.blur()");
    await call("closeChat");
    const boardRestored = await measure(`${name}-board-restored`, false);
    check(`${name}: nested game lock retained`, boardRestored.bodyPosition === "fixed", boardRestored);
    check(`${name}: game and header restore`, sameRect(board.boardGrid, boardRestored.boardGrid) && sameRect(board.header, boardRestored.header), boardRestored);
    for (let cycle = 0; cycle < 3; cycle++) {
      await call("openChat");
      await delay(80);
      await call("focusComposer");
      await call("setInput", `Cycle ${cycle}: é è à !`);
      await call("setViewport", { width, height: 430 + cycle * 25, offsetTop: 36 + cycle * 12, offsetLeft: 0, scale: 1 });
      const cycleState = await measure(`${name}-game-cycle-${cycle}`, false);
      check(`${name}: game cycle ${cycle} stable`, sameRect(screenRect(board.boardGrid, board.visual), screenRect(cycleState.boardGrid, cycleState.visual)) && sameRect(screenRect(board.header, board.visual), screenRect(cycleState.header, cycleState.visual)), cycleState);
      check(`${name}: game cycle ${cycle} focus and draft`, cycleState.activeInput && cycleState.draft === `Cycle ${cycle}: é è à !`, cycleState);
      await call("setViewport", {});
      await evaluate("document.activeElement?.blur()");
      await call("closeChat");
      await delay(800);
      const cycleRestored = await measure(`${name}-game-cycle-${cycle}-restored`, false);
      check(`${name}: game cycle ${cycle} restored`, sameRect(board.boardGrid, cycleRestored.boardGrid) && sameRect(board.header, cycleRestored.header), cycleRestored);
    }
    await call("openChat");
    await delay(80);
    await call("focusComposer");
    await metrics(width, height - 380, safe);
    const resizedKeyboard = await measure(`${name}-game-layout-resized-keyboard`);
    check(`${name}: layout-resizing keyboard keeps game stable`, sameRect(board.boardGrid, resizedKeyboard.boardGrid) && sameRect(board.header, resizedKeyboard.header), resizedKeyboard);
    check(`${name}: layout-resizing keyboard composer visible`, resizedKeyboard.input?.bottom <= height - 379 && resizedKeyboard.input?.y >= 0, resizedKeyboard.input);
    await metrics(width, height, safe);
    await evaluate("document.activeElement?.blur()");
    await call("closeChat");
    await delay(800);
    const resizedRestored = await measure(`${name}-game-layout-restored`, false);
    check(`${name}: layout-resizing keyboard restores game`, sameRect(board.boardGrid, resizedRestored.boardGrid) && sameRect(board.header, resizedRestored.header), resizedRestored);
    await call("show", "idle");
    const exited = await measure(`${name}-board-exit`, false);
    check(`${name}: game lock released`, exited.bodyPosition !== "fixed" && exited.rootPosition !== "fixed", exited);
  }
  if (!fontOnly) {
  await metrics(956, 440, { top: 0, bottom: 21, left: 62, right: 62 });
  await navigate("salon");
  const landscape = await measure("landscape-salon");
  check("landscape: navigation clear of left notch", landscape.salonTop?.x >= 62, landscape.salonTop);
  check("landscape: utilities clear of right notch", landscape.salonUtilities?.right <= 894, landscape.salonUtilities);
  await call("focusComposer");
  await call("setInput", "Message de vérification du bouton Envoyer");
  await call("setViewport", { width: 956, height: 220, offsetTop: 0, offsetLeft: 0, scale: 1 });
  const landscapeKeyboard = await measure("landscape-salon-keyboard");
  check("landscape: composer above keyboard", landscapeKeyboard.input?.bottom <= 221 && landscapeKeyboard.input?.y >= 0, landscapeKeyboard);
  check("landscape: composer clear of side notches", landscapeKeyboard.composer?.x >= 62 && landscapeKeyboard.composer?.right <= 894, landscapeKeyboard.composer);
  check("landscape: send button unobstructed", landscapeKeyboard.sendHit?.unobstructed, landscapeKeyboard.sendHit);
  await call("setViewport", {});
  await evaluate("document.activeElement?.blur()");
  await delay(800);
  const landscapeRestored = await measure("landscape-salon-restored", false);
  check("landscape: restored background", sameRect(landscape.backdrop, landscapeRestored.backdrop), landscapeRestored);
  }
  check("No browser exceptions", errors.length === 0, errors);
} catch (error) {
  failures.push({ name: "Browser verification aborted", detail: error.stack });
} finally {
  await fs.writeFile(path.join(output, fontOnly ? "font-cascade.json" : salonOnly ? "salon-hit-test.json" : "measurements.json"), JSON.stringify({
    measuredAt: new Date().toISOString(),
    limitations: "Desktop Chromium with CSS safe-area overrides and synthetic visualViewport events. Not iOS Safari, installed iOS PWA, real software keyboard, or live multiplayer verification.",
    checks, cases, failures, errors,
  }, null, 2));
  if (cdp) await cdp("Browser.close").catch(() => {});
  socket?.close();
  for (const child of processes.reverse()) { if (child.exitCode === null) child.kill(); }
  for (const log of logHandles) await log.close();
}
console.log(JSON.stringify({ checks, cases: cases.length, failures, errors, output }, null, 2));
if (failures.length) process.exitCode = 1;
