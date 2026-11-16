import { build, createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile, lstat, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const workspace = process.cwd();
const testsRoot = path.resolve(workspace, '.tmp/codex-tests');
const run = path.join(testsRoot, `wheel-vote-${Date.now()}`);
const profile = path.join(run, 'browser');
const reportDir = path.resolve(workspace, '.tmp/wheel-vote-review');
let preview, chrome, connection;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function noLinks(directory) {
  const stat = await lstat(directory);
  if (stat.isSymbolicLink()) throw new Error(`Refusing reparse point: ${directory}`);
  if (stat.isDirectory()) for (const entry of await readdir(directory)) await noLinks(path.join(directory, entry));
}
async function cleanup() {
  if (connection?.readyState === WebSocket.OPEN) connection.close();
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    // Only the dedicated headless test browser process created by this runner.
    const closed = once(chrome, 'exit'); chrome.kill(); await closed;
  }
  await preview?.close();
  const relative = path.relative(testsRoot, path.resolve(run));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe cleanup path');
  for (const directory of [workspace, path.dirname(testsRoot), testsRoot]) {
    if ((await lstat(directory)).isSymbolicLink()) throw new Error(`Refusing reparse point: ${directory}`);
  }
  await noLinks(run);
  await rm(run, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
try {
  await mkdir(profile, { recursive: true });
  await mkdir(reportDir, { recursive: true });
  if (!process.argv.includes('--browser-only')) {
    await build({ cacheDir: path.join(run, 'build-cache'), logLevel: 'error',
      build: { outDir: path.join(run, 'build'), copyPublicDir: false } });
    console.log('Production compilation passed.');
  }
  const votes = new Map([[2, { userId: 2, nick: 'Bob', status: 'skipped', choices: [], suggestion: '' }]]);
  preview = await createServer({ configFile: false, plugins: [react(), { name: 'vote-test-api', configureServer(server) {
    server.middlewares.use('/api', (request, response) => {
      const id = Number(/vote_fixture=(\d+)/.exec(request.headers.cookie || '')?.[1] || 1);
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/dev/infortune/votes') return response.end(JSON.stringify({ ok: true, entries: [...votes.values()] }));
      if (request.method === 'POST') {
        let body = ''; request.on('data', chunk => { body += chunk; }); request.on('end', () => {
          const vote = { userId: id, nick: 'Alice', ...JSON.parse(body) }; votes.set(id, vote);
          response.end(JSON.stringify({ ok: true, vote }));
        }); return;
      }
      response.end(JSON.stringify({ ok: true, eligible: id !== 3, vote: votes.get(id) || null }));
    });
  } }], cacheDir: path.join(run, 'vite-cache'), logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
    optimizeDeps: { entries: ['scripts/fixtures/wheel-vote.html'] } });
  await preview.listen();
  const origin = `http://127.0.0.1:${preview.httpServer.address().port}`;
  chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let port;
  for (let attempt = 0; attempt < 120; attempt++) {
    try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await pause(100); }
  }
  assert.ok(port, 'The dedicated test browser starts');
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
  connection = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await once(connection, 'open');
  let sequence = 0;
  const pending = new Map(), errors = [];
  connection.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.id) { const call = pending.get(message.id); pending.delete(message.id); if (message.error) call?.reject(message.error); else call?.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); connection.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  };
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 150; attempt++) { if (await evaluate(expression)) return; await pause(100); }
    throw new Error(`Timed out: ${expression}`);
  };
  const click = text => evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)}).click()`);
  const screenshot = async name => { const value = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(reportDir, name), Buffer.from(value.data, 'base64')); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${origin}/scripts/fixtures/wheel-vote.html` });
  await waitFor(`document.querySelector('.wheel-vote__proposals li:last-child')?.textContent.includes('Suggérer')`);
  assert.equal(await evaluate(`!!document.querySelector('dialog:modal')`), true, 'Welcome uses a modal dialog before keyboard input');
  console.log('Welcome opened.');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate(`!!document.querySelector('dialog:modal')`), true,
    `Escape cannot dismiss the welcome: ${await evaluate(`JSON.stringify({open:document.querySelector('dialog')?.open,html:document.querySelector('dialog')?.outerHTML.slice(0,500)})`)}`);
  await screenshot('welcome-desktop.png');
  await click('Je vote');
  await waitFor(`document.querySelectorAll('input[type=checkbox]').length === 8`);
  await evaluate(`document.querySelectorAll('input[type=checkbox]')[7].click()`);
  await waitFor(`!!document.querySelector('textarea')`);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Valider mon vote').disabled`), true);
  await evaluate(`(() => { const input = document.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Une roue le dimanche, avec une énigme collective.'); input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelectorAll('input[type=checkbox]')[2].click(); })()`);
  await waitFor(`!Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Valider mon vote').disabled`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await screenshot('choices-mobile.png');
  assert.equal(await evaluate(`document.querySelector('dialog').getBoundingClientRect().right <= innerWidth`), true);
  await click('Valider mon vote'); await waitFor(`document.querySelector('h2')?.textContent === 'Confirmer ton vote ?'`);
  assert.equal(votes.has(1), false, 'Selecting choices does not save before confirmation');
  await click('Confirmer'); await waitFor(`!document.querySelector('dialog')`);
  assert.deepEqual(votes.get(1).choices, [3, 8]);
  await click('Modifier mon vote'); await waitFor(`document.querySelectorAll('input[type=checkbox]:checked').length === 2`);
  await click('Passer'); await waitFor(`document.querySelector('h2')?.textContent === 'Confirmer que tu passes ?'`);
  await click('Confirmer'); await waitFor(`!document.querySelector('dialog')`);
  assert.equal(votes.get(1).status, 'skipped');
  // Restore a suggestion for the admin selection check.
  votes.set(1, { userId: 1, nick: 'Alice', status: 'voted', choices: [3, 8], suggestion: 'Une roue le dimanche.' });
  await click('Résultats du vote sur la roue'); await waitFor(`document.querySelectorAll('tbody tr').length === 8`);
  await evaluate(`Array.from(document.querySelectorAll('.wheel-vote__voters button')).find(button => button.textContent.includes('Alice')).click()`);
  await waitFor(`document.querySelector('caption')?.textContent.includes('Alice')`);
  assert.equal(await evaluate(`document.querySelector('.wheel-vote__suggestion').textContent`), 'Une roue le dimanche.');
  await screenshot('results-mobile.png');
  await click('Tous les votes'); await waitFor(`document.querySelector('caption')?.textContent === 'Tous les votes'`);
  await evaluate(`document.querySelector('button[aria-label=Fermer]').click()`);
  await evaluate(`window.voteFixture.account(3)`); await pause(250);
  assert.equal(await evaluate(`!!document.querySelector('dialog')`), false, 'No mandatory ballot below 100 rounds');
  await evaluate(`window.voteFixture.rewards()`); await waitFor(`!!document.querySelector('.gobble-reward__gain')`); await pause(800);
  const bounds = await evaluate(`(() => { const gain = document.querySelector('.gobble-reward__gain').getBoundingClientRect(); const panel = document.querySelector('.vocab-progress-panel').getBoundingClientRect(); return { gainBottom: gain.bottom, panelTop: panel.top, z: +getComputedStyle(document.querySelector('.currency-layer')).zIndex }; })()`);
  assert.ok(bounds.gainBottom < bounds.panelTop, JSON.stringify(bounds));
  assert.ok(bounds.z > 12040);
  await screenshot('rewards-mobile.png');
  await evaluate(`window.voteFixture.settings()`); await pause(100);
  assert.equal(await evaluate(`+getComputedStyle(document.querySelector('.settings-menu-frame')).zIndex > +getComputedStyle(document.querySelector('.currency-layer')).zIndex`), true);
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: compulsory welcome, eight choices, suggestion, confirmation, editing, admin filter, eligibility and reward/menu layers.');
} catch (error) {
  console.error('Browser/build check failed:', error);
  throw error;
} finally {
  try { await cleanup(); } catch (error) { console.error(`Cleanup failed; remaining disposable directory: ${run}`); throw error; }
}
