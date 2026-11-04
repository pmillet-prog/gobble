import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "vite";
import WebSocket from "ws";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, ".tmp/round-intro-ui");
await fs.mkdir(output, { recursive: true });
const server = await createServer({
  configFile: false, root, cacheDir: path.join(output, "vite-cache"), logLevel: "error",
  optimizeDeps: { entries: ["dev/round-intro/index.html"], include: ["react", "react-dom/client"] },
  server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.tmp/**", "**/.Tmp/**", "**/public/**"] } },
});
const errors = [], cases = [];
let browser, ws, cdp;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, label) {
  for (let i = 0; i < 100; i++) { try { if (await read()) return; } catch {} await delay(100); }
  throw new Error(`Timeout: ${label}`);
}
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const profile = path.join(output, `chrome-${Date.now()}`);
  browser = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "about:blank"], { windowsHide: true, stdio: "ignore" });
  let port;
  await until(async () => { port = (await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; return port; }, "Chrome port");
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
  ws = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await new Promise(resolve => ws.once("open", resolve));
  let sequence = 0;
  const pending = new Map();
  ws.on("message", raw => {
    const message = JSON.parse(raw);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
    const task = pending.get(message.id); if (!task) return;
    pending.delete(message.id); clearTimeout(task.timer);
    message.error ? task.reject(message.error) : task.resolve(message.result);
  });
  cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10_000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const show = options => evaluate(`roundIntroFixture.show(${JSON.stringify(options)})`);
  await cdp("Runtime.enable"); await cdp("Page.enable"); await cdp("Network.enable");
  await cdp("Network.setBlockedURLs", { urls: ["https://*", "http://gobble*", "wss://*"] });
  await cdp("Page.navigate", { url: `${origin}/dev/round-intro/` });
  await until(() => evaluate("!!window.roundIntroFixture"), "fixture mounted");
  for (const [width, height] of [[320, 568], [390, 844], [667, 375], [1440, 900]]) {
    const mobile = width < 700;
    await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    for (const type of ["target_long", "target_score"]) for (const kind of ["gotus", "quiz"]) {
      await show({ kind, type, mobile, stage: "title", training: false });
      await until(() => evaluate(`document.querySelector('.round-intro-bonus__logo--${kind}')?.complete && document.querySelector('.round-intro-bonus__logo--${kind}')?.naturalWidth > 0`), "bonus logo loaded");
      await delay(70);
      const layout = await evaluate(`(() => {
        const card = document.querySelector('.round-intro-title'), grid = document.querySelector('[data-grid]'), bonus = document.querySelector('.round-intro-bonus');
        return { card: card.getBoundingClientRect().toJSON(), grid: grid.getBoundingClientRect().toJSON(),
          children: [...card.querySelectorAll('div,p,img')].map(node => ({ text: node.textContent, rect: node.getBoundingClientRect().toJSON() })),
          src: bonus.querySelector('img').getAttribute('src'), text: bonus.textContent,
          descriptionColor: getComputedStyle(card.querySelector('.round-intro-title__description')).color,
          scrollWidth: document.documentElement.scrollWidth };
      })()`);
      assert.ok(Math.abs(layout.card.width - layout.grid.width) <= 2 && Math.abs(layout.card.height - layout.grid.height) <= 2);
      assert.ok(layout.card.left >= 0 && layout.card.right <= width && layout.card.top >= 0 && layout.card.bottom <= height);
      assert.ok(layout.children.every(({ rect }) => rect.top >= layout.card.top && rect.bottom <= layout.card.bottom + 1 && rect.left >= layout.card.left && rect.right <= layout.card.right + 1), JSON.stringify({ width, height, type, kind, layout }));
      assert.ok(layout.text.includes(kind === "gotus" ? "Gotus" : "Qui veut gagner des Gobblars"));
      assert.equal(layout.descriptionColor, "rgba(255, 255, 255, 0.82)");
      assert.ok(layout.scrollWidth <= width);
      const label = `${width}-${height}-${type}-${kind}`;
      cases.push({ label, layout });
      if (type === "target_long") {
        const image = await cdp("Page.captureScreenshot", { format: "png" });
        await fs.writeFile(path.join(output, `${label}.png`), Buffer.from(image.data, "base64"));
      }
    }
  }
  for (const options of [{ stage: "countdown" }, { stage: "idle" }, { stage: "title", type: "ocid" }, { type: "normal" }, { type: "target_long", training: true }, { training: false, kind: null }]) {
    await show(options);
    await until(() => evaluate("!document.querySelector('.round-intro-bonus')"), "bonus absent outside eligible title");
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, "measurements.json"), JSON.stringify({ cases, errors }, null, 2));
  console.log(JSON.stringify({ titleCases: cases.length, otherStageAndModeChecks: 6, fits: true, consoleErrors: errors.length, output }));
} finally {
  if (cdp) await cdp("Browser.close").catch(() => {});
  ws?.close(); browser?.kill(); await server.close();
}
