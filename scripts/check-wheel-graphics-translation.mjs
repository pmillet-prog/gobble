import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, lstat, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const workspace = process.cwd(), testsRoot = path.resolve(workspace, '.tmp/codex-tests');
const run = path.join(testsRoot, `wheel-graphics-translation-${Date.now()}`), profile = path.join(run, 'browser');
let server, chrome, connection;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function noLinks(directory) {
  const stat = await lstat(directory);
  if (stat.isSymbolicLink()) throw new Error(`Refusing reparse point: ${directory}`);
  if (stat.isDirectory()) for (const entry of await readdir(directory)) await noLinks(path.join(directory, entry));
}
async function cleanup() {
  if (connection?.readyState === WebSocket.OPEN) connection.close();
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    const closed = once(chrome, 'exit'); chrome.kill(); await closed;
  }
  if (server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
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
  // Keep the real dialog/controller; replace only GPU measurement with deterministic results.
  const stageId = '\0wheel-graphics-measure-fixture';
  const config = { configFile: false, logLevel: 'error', cacheDir: path.join(run, 'cache'),
    plugins: [react(), { name: 'wheel-measure-fixture', enforce: 'pre',
      resolveId(id) { if (id.endsWith('/WheelGraphicsMeasureStage.jsx')) return stageId; },
      load(id) { if (id === stageId) return `import React from 'react';
        export default function Stage({ profile, onReady, onComplete }) {
          React.useEffect(() => {
            onReady(profile);
            window.graphicsFixture.finish = (status = 'complete', fps = 30) => {
              const phase = { fps, p95: 1000 / fps, samples: 200, durationMs: 5000 };
              onComplete({ profile, status, phases: { intro: phase, spin: phase } });
            };
            return () => { delete window.graphicsFixture.finish; };
          }, [profile, onReady, onComplete]);
          return React.createElement('div', { 'data-profile': profile });
        }`; },
    }], build: { outDir: path.join(run, 'build'), copyPublicDir: false,
      rollupOptions: { input: path.join(workspace, 'scripts/fixtures/wheel-graphics-translation.html') } },
    preview: { host: '127.0.0.1', port: 0 },
  };
  await build(config);
  server = await preview(config);
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await pause(100); }
  }
  assert.ok(port, 'Dedicated test browser starts');
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
  connection = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await once(connection, 'open');
  let sequence = 0;
  const pending = new Map(), errors = [];
  connection.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.id) {
      const call = pending.get(message.id); pending.delete(message.id); clearTimeout(call?.timeout);
      if (message.error) call?.reject(message.error); else call?.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timeout }); connection.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  };
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await pause(50); }
    throw new Error(`Timed out: ${expression}; ${JSON.stringify(await evaluate('window.graphicsFixture?.errors'))}`);
  };
  const click = text => evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes(${JSON.stringify(text)})).click()`);
  // Reproduce the translator's DOM mutation: replace React's text nodes with nested fonts.
  const translate = () => evaluate(`(() => {
    const walker = document.createTreeWalker(document.querySelector('dialog'), NodeFilter.SHOW_TEXT), texts = [];
    while (walker.nextNode()) if (walker.currentNode.textContent.trim() && !walker.currentNode.parentElement.closest('font,select')) texts.push(walker.currentNode);
    for (const text of texts) {
      const outer = document.createElement('font'), inner = document.createElement('font');
      inner.textContent = '[translated] ' + text.textContent; outer.appendChild(inner); text.replaceWith(outer);
    }
    return texts.length;
  })()`);
  const open = async translated => {
    await send('Page.navigate', { url: `${origin}/scripts/fixtures/wheel-graphics-translation.html` });
    await waitFor(`!!window.graphicsFixture?.lookup && !!document.querySelector('dialog:modal')`);
    if (translated) assert.ok(await translate());
    await evaluate('graphicsFixture.lookup()');
    await waitFor(`document.querySelector('dialog')?.textContent.includes('Mesurer et choisir')`);
    if (translated) assert.ok(await translate());
    await click('Mesurer et choisir');
    await waitFor(`document.querySelector('[data-profile]')?.dataset.profile === 'detailed' && !!graphicsFixture.finish`);
  };
  const finish = async (status, nextProfile) => {
    await evaluate(`graphicsFixture.finish(${JSON.stringify(status)})`);
    await waitFor(nextProfile ? `document.querySelector('[data-profile]')?.dataset.profile === '${nextProfile}'`
      : `document.querySelector('dialog')?.textContent.includes('Continuer vers Gobble')`);
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 338, height: 659, deviceScaleFactor: 1, mobile: true });
  if (process.argv.includes('--expect-crash')) {
    await open(true); await translate(); await evaluate('graphicsFixture.finish()');
    await waitFor(`graphicsFixture.errors.length > 0`);
    const crashes = await evaluate('graphicsFixture.errors');
    assert.ok(crashes.some(error => /removeChild/.test(error.message)), JSON.stringify(crashes));
    console.log('Reproduced original removeChild crash when translated running status becomes the result paragraph.');
  } else {
    for (const translated of [false, true]) {
      await open(translated);
      if (translated) await translate();
      await finish('error', 'balanced');
      assert.equal(await evaluate(`document.querySelector('[role=status]').textContent`), 'Essai 2/3 : 3D moyenne… Le lancer se fait tout seul.');
      if (translated) await translate();
      await finish('complete');
      assert.equal(await evaluate(`document.querySelector('dialog strong').textContent`), 'Réglage conseillé : 3D moyenne.');
      if (translated) await translate();
      await click('Utiliser ce mode');
      assert.equal(await evaluate(`document.querySelector('dialog strong').textContent`), 'Mode choisi : 2D.');
      await click('Continuer vers Gobble'); await waitFor(`!!document.querySelector('#completed')`);
      assert.equal(await evaluate('graphicsFixture.result.profile'), 'flat');
      assert.deepEqual(await evaluate('graphicsFixture.errors'), []);

      await open(translated);
      for (const next of ['balanced', 'light', null]) {
        if (translated) await translate();
        await finish('timeout', next);
      }
      if (translated) await translate();
      await click('Reprendre la mesure'); await waitFor(`document.querySelector('[data-profile]')?.dataset.profile === 'detailed'`);
      if (translated) await translate();
      await click('Utiliser ce mode');
      await waitFor(`document.querySelector('dialog strong')?.textContent === 'Mode choisi : 2D.'`);
      if (translated) await translate();
      await click('Continuer vers Gobble'); await waitFor(`!!document.querySelector('#completed')`);
      assert.deepEqual(await evaluate('graphicsFixture.errors'), []);
    }
    assert.deepEqual(errors, []);
    console.log('Passed with/without translated DOM: lookup, profile change, result, manual selection, fallback, retry and closing.');
  }
} finally {
  try { await cleanup(); } catch (error) { console.error(`Cleanup failed; remaining disposable directory: ${run}`); throw error; }
}
