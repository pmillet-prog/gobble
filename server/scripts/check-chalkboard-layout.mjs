// Headless Chrome layout checks against the actual React feature and CSS.
// Only the fixture's API and physical orientation sensor are simulated.
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
const output = path.join(root, ".Tmp/chalkboard-layout-review");
const profile = await mkdtemp(path.join(tmpdir(), "gobble-chalkboard-layout-"));
const vite = await createServer({ root, configFile: false, logLevel: "error",
  optimizeDeps: { entries: [path.join(root, "dev/chalkboard-layout/index.html")] },
  server: { host: "127.0.0.1", port: 0 } });
let chrome, socket, closeBrowser;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await read(); if (value) return value; await sleep(50); }
  throw new Error("Layout browser timed out");
}
try {
  await vite.listen(); await mkdir(output, { recursive: true });
  chrome = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  chrome.on("error", error => { console.error(error); });
  const port = await until(() => readFile(path.join(profile, "DevToolsActivePort"), "utf8").then(text => Number(text.split("\n")[0])).catch(() => null));
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl); await once(socket, "open");
  let nextId = 0; const pending = new Map(), errors = [], measurements = [];
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text + " " + (message.params.exceptionDetails.exception?.description || ""));
    const task = pending.get(message.id);
    if (task) { pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method} ${params.expression?.slice(0, 150) || ""}; browser errors: ${errors.join("; ")}`)); }, 30000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  closeBrowser = () => send("Browser.close").catch(() => {});
  const evaluate = async expression => {
    let result;
    try { result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); }
    catch (error) {
      const screenshot = await send("Page.captureScreenshot", { format: "png" }).catch(() => null);
      if (screenshot) await writeFile(path.join(output, "failure.png"), Buffer.from(screenshot.data, "base64"));
      throw error;
    }
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || "Evaluation failed");
    return result.result.value;
  };
  const settle = () => evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
  const navigate = async url => {
    const result = await send("Page.navigate", { url });
    if (result.errorText) throw new Error(result.errorText);
    await until(() => evaluate("!!document.querySelector('.chalkboard-write:not(:disabled)')"), 60000);
  };
  const capture = async name => {
    await settle();
    const size = await evaluate(`(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; };
      const scroll = document.querySelector('.chalkboard-scroll');
      return { screen: rect('.chalkboard-viewport'), app: rect('.chalkboard-app'), frame: rect('.chalkboard-frame'),
        header: rect('.chalkboard-header'), footer: rect('.chalkboard-tray, .chalkboard-composer'), world: rect('.chalkboard-world'), boardHeight: scroll.clientHeight,
        compact: getComputedStyle(document.querySelector('.chalkboard-app')).display === 'grid',
        dedicated: !!document.querySelector('.chalkboard-composer') && getComputedStyle(document.querySelector('.chalkboard-composer')).position === 'absolute',
        boardVisible: getComputedStyle(document.querySelector('.chalkboard-frame')).visibility === 'visible',
        composing: !!document.querySelector('.chalkboard-composer'),
        viewport: { x: visualViewport.offsetLeft, y: visualViewport.offsetTop, width: visualViewport.width, height: visualViewport.height },
        slider: !!document.querySelector('[aria-label="Zoom du tableau"]') };
    })()`);
    assert.equal(size.slider, false);
    for (const key of ["x", "y", "width", "height"]) assert.ok(Math.abs(size.screen[key] - size.viewport[key]) < 1, `${name}: viewport ${key}`);
    assert.equal(size.world.height, size.boardHeight, `${name}: board fills height`);
    if (!size.dedicated) assert.ok(size.boardHeight > 50, `${name}: usable canvas`);
    assert.ok(size.footer.bottom <= size.screen.bottom + 1, `${name}: footer in screen`);
    if (size.dedicated) {
      assert.equal(size.boardVisible, false, `${name}: typing replaces the tiny preview`);
      assert.ok(Math.abs(size.footer.y - size.app.y) < 1 && Math.abs(size.footer.height - size.app.height) < 1,
        `${name}: composer owns available height`);
    } else if (size.compact) {
      assert.ok(size.footer.bottom <= size.frame.y + 1, `${name}: tools above the board`);
      if (size.header.height) {
        assert.ok(Math.abs(size.header.y - size.footer.y) < 1, `${name}: navigation and tools share one row`);
        assert.ok(size.header.x + size.header.width <= size.footer.x + 1, `${name}: navigation does not overlap tools`);
      }
      assert.ok(size.boardHeight >= size.app.height - (size.composing ? 100 : 76), `${name}: most height reserved for the board`);
      const tray = await evaluate(`(() => {
        const node = document.querySelector('.chalkboard-tray');
        if (!node) return null;
        const controls = [...node.querySelectorAll('button, input')].filter(el => el.getBoundingClientRect().height);
        const reachable = controls.every(el => {
          el.scrollIntoView({block:'nearest', inline:'nearest'});
          const r=el.getBoundingClientRect(), t=node.getBoundingClientRect();
          return r.left >= t.left - 1 && r.right <= t.right + 1 && r.top >= t.top - 1 && r.bottom <= t.bottom + 1;
        });
        node.scrollLeft=0;
        return {reachable, height:node.clientHeight, contentHeight:node.scrollHeight};
      })()`);
      if (tray) {
        assert.ok(tray.reachable, `${name}: every toolbar control can be reached by horizontal scrolling`);
        assert.ok(tray.contentHeight <= tray.height + 1, `${name}: no second row or vertical clipping`);
      }
    } else {
      assert.ok(size.frame.bottom <= size.footer.y + 1, `${name}: no overlap`);
    }
    if (size.composing) {
      const fields=await evaluate(`['.chalkboard-text-style','textarea','.chalkboard-composer-actions'].map(selector=>{
        const r=document.querySelector(selector).getBoundingClientRect();return {selector,top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};
      })`);
      for(const field of fields)assert.ok(field.top>=size.footer.y&&field.bottom<=size.footer.bottom+1&&field.left>=size.footer.x&&field.right<=size.footer.x+size.footer.width+1,`${name}: ${field.selector} fully visible`);
      if (size.dedicated) assert.ok(fields[1].height >= Math.min(70, size.app.height - 65), `${name}: useful typing height`);
    }
    measurements.push({ name, ...size });
    console.log(`${name}: screen ${size.screen.width}×${size.screen.height}, board ${size.boardHeight}px`);
    const screenshot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(output, `${name}.png`), Buffer.from(screenshot.data, "base64"));
  };
  const writeColoredText = async () => {
    await send("Input.insertText", { text: "Bonjour à tous,\nà vous la craie !" });
    await evaluate(`(() => {
      const input=document.querySelector('[aria-label="Couleur du texte"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'#81d4fa');
      input.dispatchEvent(new Event('input',{bubbles:true}));
      const font=document.querySelector('[aria-label="Police du texte"]');
      if(font.options.length!==3)throw new Error('Missing font choices');
      font.value='chalk';font.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await settle();
    const before=await evaluate("document.querySelector('.chalkboard-canvas').toDataURL()");
    await evaluate("const font=document.querySelector('[aria-label=\"Police du texte\"]');font.value='white-chalk';font.dispatchEvent(new Event('change',{bubbles:true}));");
    await settle();
    const after=await evaluate("document.querySelector('.chalkboard-canvas').toDataURL()");
    assert.notEqual(before,after,'changing typeface updates the board preview');
    const state=await evaluate(`(() => {
      const canvas=document.querySelector('.chalkboard-canvas'), pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let blue=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>100&&pixels[i+2]>pixels[i]+40&&pixels[i+1]>pixels[i]+25)blue++;
      return {blue,text:document.querySelector('textarea').value,color:document.querySelector('input[type=color]').value};
    })()`);
    assert.equal(state.text,"Bonjour à tous,\nà vous la craie !");
    assert.equal(state.color,"#81d4fa");
    assert.ok(state.blue>100,'the canvas contains blue chalk text');
  };
  await send("Runtime.enable"); await send("Page.enable");
  for (const [width, height] of [[1280, 800], [393, 852], [852, 393], [915, 412], [667, 375], [568, 320], [1024, 600]]) {
    console.log(`Checking ${width}×${height}`);
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
    await navigate(`http://127.0.0.1:${vite.httpServer.address().port}/dev/chalkboard-layout/index.html`);
    await until(() => evaluate("!!document.querySelector('.chalkboard-write:not(:disabled)')"));
    await capture(`${width}x${height}-read`);
    await evaluate("document.querySelector('.chalkboard-draw').click()"); await capture(`${width}x${height}-draw`);
    await evaluate("document.querySelector('.chalkboard-write').click()"); await settle();
    await writeColoredText(); await capture(`${width}x${height}-text`);
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 915, height: 412, deviceScaleFactor: 1, mobile: true });
  await evaluate("window.composingInput = document.querySelector('textarea'); composingInput.focus(); composingInput.setSelectionRange(2,5)");
  for (const [width, height, offsetTop] of [[915, 212, 40], [915, 140, 20], [568, 160, 0], [393, 200, 0]]) {
    await evaluate(`window.setLayoutViewport({ width: ${width}, height: ${height}, offsetTop: ${offsetTop}, offsetLeft: 0 })`);
    await capture(`keyboard-${width}x${height}`);
    assert.deepEqual(await evaluate("[composingInput === document.querySelector('textarea'), document.activeElement === composingInput, composingInput.selectionStart, composingInput.selectionEnd]"), [true, true, 2, 5], "keyboard resize preserves input, focus and selection");
  }
  assert.equal(await evaluate("document.querySelector('textarea').value"), "Bonjour à tous,\nà vous la craie !");
  await evaluate("document.querySelector('.chalkboard-composer').requestSubmit()");
  await evaluate("window.setLayoutViewport({})");
  await capture("landscape-keyboard-closed");
  assert.equal(await evaluate("!!document.querySelector('.chalkboard-composer')"), false);
  assert.equal(await evaluate("!!document.querySelector('.chalkboard-publish:not(:disabled)')"), true, "text is a draft ready for placement, not published");
  await evaluate("document.querySelector('.chalkboard-viewport').style.padding = '0px 44px 21px'");
  await capture("landscape-safe-areas");
  await evaluate("window.confirm = () => true; document.querySelector('.chalkboard-back').click()"); await settle();
  const orientationCalls = await evaluate("window.layoutOrientationCalls");
  assert.equal(orientationCalls.at(-1), "portrait", "leaving the board restores portrait");
  assert.ok(orientationCalls.length >= 2 && orientationCalls.slice(0, -1).every(mode => mode === "any"),
    "board keeps landscape allowed, including focus/visibility refreshes");

  // Real settings component, persisted preference and orientation/layout satellite.
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36" });
  const rotate = async (width, height, type) => {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true,
      screenOrientation: { type, angle: type.startsWith("landscape") ? 90 : 0 } });
    await settle();
  };
  const settingsUrl = `http://127.0.0.1:${vite.httpServer.address().port}/dev/chalkboard-layout/index.html?settings=1`;
  const settings = async () => {
    await evaluate("window.layoutFixture = null");
    await send("Page.navigate", { url: settingsUrl });
    await until(() => evaluate("!!window.layoutFixture && !!document.querySelector('[role=switch]')")); await settle();
  };
  const toggle = async () => { await evaluate("document.querySelector('[role=switch]').click()"); await settle(); };
  const mode = () => evaluate("document.querySelector('[data-layout-mode]').dataset.layoutMode");
  await rotate(915, 412, "landscapePrimary");
  await settings();
  assert.equal(await mode(), "mobile");
  assert.equal(await evaluate("document.querySelector('[role=switch]').getAttribute('aria-checked')"), "false");
  const warning = await evaluate("document.getElementById(document.querySelector('[role=switch]').getAttribute('aria-describedby')).textContent");
  assert.match(warning, /plus petits/); assert.match(warning, /ralentir/);
  await toggle();
  assert.equal(await mode(), "desktop");
  assert.equal(await evaluate("window.layoutOrientationCalls.at(-1)"), "any");
  await settings();
  assert.equal(await mode(), "desktop", "preference survives reload");
  await evaluate("document.querySelector('[role=switch]').scrollIntoView({block:'center'})");
  const settingsShot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(output, "settings-landscape-desktop.png"), Buffer.from(settingsShot.data, "base64"));
  await rotate(393, 852, "portraitPrimary");
  assert.equal(await mode(), "mobile");
  await rotate(393, 210, "portraitPrimary");
  await toggle(); await toggle();
  assert.equal(await mode(), "mobile", "portrait with keyboard is still mobile after toggling");
  await rotate(915, 412, "landscapePrimary");
  assert.equal(await mode(), "desktop");
  await toggle();
  assert.equal(await mode(), "mobile", "disabling the option restores mobile while already in landscape");
  assert.equal(await evaluate("window.layoutOrientationCalls.at(-1)"), "portrait");
  await evaluate("window.layoutFixture.commands.navigation.go('chalkboard')"); await settle();
  assert.equal(await evaluate("window.layoutOrientationCalls.at(-1)"), "any", "board rotation remains independent of the preference");
  console.log("Landscape setting: default off, warning, persistence, rotation, keyboard and board policies passed.");
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "measurements.json"), JSON.stringify(measurements, null, 2));
  console.log(`${measurements.length} viewport/mode checks passed; screenshots in .Tmp/chalkboard-layout-review/`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) await closeBrowser?.();
  socket?.close();
  if (chrome && chrome.exitCode === null) chrome.kill(); // Only this isolated headless test browser.
  await vite.close();
  // The target is a unique temporary profile, never the user's Chrome profile.
  if (path.dirname(profile) === path.resolve(tmpdir()) && path.basename(profile).startsWith("gobble-chalkboard-layout-")) {
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
  }
}
