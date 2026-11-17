import { build, preview as createPreview } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile, lstat, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const workspace = process.cwd(), testsRoot = path.resolve('.tmp/codex-tests');
const run = path.join(testsRoot, `connection-audit-${Date.now()}`), profile = path.join(run, 'browser');
const report = path.resolve('.tmp/connection-audit-review');
let preview, browser, connection;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function noLinks(directory) {
  const stat = await lstat(directory);
  if (stat.isSymbolicLink()) throw new Error(`Refusing reparse point: ${directory}`);
  if (stat.isDirectory()) for (const child of await readdir(directory)) await noLinks(path.join(directory, child));
}
async function cleanup() {
  connection?.close();
  if (browser && browser.exitCode === null && browser.signalCode === null) {
    const exited = once(browser, 'exit'); browser.kill(); await exited;
  }
  if (preview) await new Promise((resolve, reject) => preview.httpServer.close(error => error ? reject(error) : resolve()));
  const relative = path.relative(testsRoot, path.resolve(run));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe cleanup target');
  for (const dir of [workspace, path.dirname(testsRoot), testsRoot]) if ((await lstat(dir)).isSymbolicLink()) throw new Error('Unsafe cleanup parent');
  await noLinks(run);
  await rm(run, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
try {
  await mkdir(profile, { recursive: true }); await mkdir(report, { recursive: true });
  if (!process.argv.includes('--browser-only')) {
    await build({ cacheDir: path.join(run, 'build-cache'), logLevel: 'error', build: { outDir: path.join(run, 'build'), copyPublicDir: false } });
    console.log('Production compilation passed.');
  }
  const fixtureBuild = path.join(run, 'fixture');
  await build({ configFile: false, plugins: [react()], cacheDir: path.join(run, 'fixture-cache'), logLevel: 'error',
    build: { outDir: fixtureBuild, copyPublicDir: false, rollupOptions: { input: path.resolve('scripts/fixtures/connection-audit.html') } } });
  console.log('UI fixture compilation passed.');
  preview = await createPreview({ configFile: false, plugins: [{ name: 'audit-fixture-api', configurePreviewServer(server) {
    server.middlewares.use('/api/admin', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/capabilities') return res.end(JSON.stringify({ ok: true, accountAdmin: true, contentAdmin: true }));
      const earlier = req.url.includes('before=');
      const entry = id => ({ id, userId: 17, nick: '<img src=x onerror=alert(1)>', observedAt: Date.UTC(2026, 10, 16, 9, id),
        kind: id === 10 ? 'session' : 'login', installId: '00000000-0000-4000-8000-000000000017', ip: '2001:db8::1234', ipSource: 'forwarded' });
      res.end(JSON.stringify({ ok: true, entries: earlier ? [entry(9)] : [entry(11), entry(10)], nextBefore: earlier ? null : 10, retentionDays: 180 }));
    });
  } }], logLevel: 'error', build: { outDir: fixtureBuild }, preview: { host: '127.0.0.1', port: 0 } });
  browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let port;
  for (let i = 0; i < 120; i++) { try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await pause(100); } }
  assert.ok(port, 'test browser starts');
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then(res => res.json());
  connection = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl); await once(connection, 'open');
  let sequence = 0; const pending = new Map(), errors = [];
  connection.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.id) { const call = pending.get(message.id); pending.delete(message.id); clearTimeout(call?.timer); if (message.error) call?.reject(message.error); else call?.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); connection.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (out.exceptionDetails) throw new Error(JSON.stringify(out.exceptionDetails)); return out.result?.value; };
  const waitFor = async expression => { const deadline = Date.now() + 25000; while (Date.now() < deadline) {
    if (errors.length) throw new Error(errors.join('\n')); if (await evaluate(expression)) return; await pause(100);
  } throw new Error(`Timed out: ${expression}; errors: ${errors.join('\n')}`); };
  const click = label => evaluate(`Array.from(document.querySelectorAll('button,summary')).find(node => node.textContent.trim() === ${JSON.stringify(label)}).click()`);
  const screenshot = async name => { const shot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(report, name), Buffer.from(shot.data, 'base64')); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${preview.httpServer.address().port}/scripts/fixtures/connection-audit.html` });
  await waitFor(`!!document.querySelector('.profile-admin-toggle')`);
  console.log('Admin fixture ready.');
  assert.equal(await evaluate(`!!document.querySelector('[role=dialog]')`), false, 'nothing opens automatically');
  await click('À propos'); await waitFor(`!!document.querySelector('[aria-label="À propos"]')`);
  assert.equal(await evaluate(`document.querySelectorAll('details[open]').length`), 0);
  await click('Confidentialité'); await waitFor(`document.querySelector('details[open]')?.innerText.includes('180 jours')`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 650, deviceScaleFactor: 1, mobile: true });
  const bounds = await evaluate(`(() => { const el = document.querySelector('[aria-label="À propos"]'); const r = el.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:innerHeight,overflow:getComputedStyle(el).overflowY}; })()`);
  assert.ok(bounds.top >= 15 && bounds.bottom <= bounds.height - 15, JSON.stringify(bounds));
  assert.equal(bounds.overflow, 'auto');
  await screenshot('privacy-mobile.png');
  await evaluate(`document.querySelector('[aria-label="À propos"]').scrollTop=10000`);
  assert.equal(await evaluate(`document.querySelector('details[open] a[href*="cnil.fr"]').getBoundingClientRect().bottom < innerHeight`), true);
  await evaluate(`document.querySelector('button[aria-label="Fermer"]').click()`);
  await click('Administration'); await click('Historique des connexions');
  await waitFor(`document.querySelectorAll('.connection-audit tbody tr').length === 2`);
  assert.equal(await evaluate(`document.querySelectorAll('.connection-audit img').length`), 0, 'nicknames are escaped');
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, 'mobile table scroll stays inside panel');
  await screenshot('connections-mobile.png');
  await click('Connexions plus anciennes'); await waitFor(`document.querySelectorAll('.connection-audit tbody tr').length === 3`);
  await click('Actualiser'); await waitFor(`document.querySelectorAll('.connection-audit tbody tr').length === 2`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate(`window.connectionFixture.dark(true)`); await pause(100); await screenshot('connections-desktop-dark.png');
  await evaluate(`window.connectionFixture.logout()`); await waitFor(`!document.querySelector('.profile-admin')`);
  assert.deepEqual(errors, []);
  console.log('Browser passed: manual-only privacy, mobile scrolling, admin journal, pagination, refresh, escaped text and logout cleanup.');
} finally {
  try { await cleanup(); } catch (error) { console.error(`Cleanup failed; remaining directory: ${run}`); throw error; }
}
