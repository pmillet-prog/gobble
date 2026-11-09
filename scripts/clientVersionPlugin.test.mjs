import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { stampClientVersion, clientVersionPlugin } from './clientVersionPlugin.mjs';
import { clientVersionFromHtml } from '../shared/clientVersion.js';
import { createRunDirectory } from '../server/tests/helpers/createRunDirectory.js';
import vm from 'node:vm';

test('the deployment identity follows the built entry and stays stable across rebuilds', () => {
  const html = '<html><head>\n  <script type="module" src="/assets/game-one.js"></script>\n  </head></html>';
  const first = stampClientVersion(html);
  assert.equal(clientVersionFromHtml(first.html), first.version);
  assert.deepEqual(stampClientVersion(html), first);
  assert.deepEqual(stampClientVersion(first.html), first);
  assert.notEqual(stampClientVersion(html.replace('game-one', 'game-two')).version, first.version);
});

test('the build publishes matching HTML and a small uncached manifest next to the app', async () => {
  const run = await createRunDirectory('client-version');
  try {
    const output = path.join(run.directory, 'dist'); await mkdir(output);
    await writeFile(path.join(output, 'index.html'), '<html><head><script src="/assets/game.js"></script></head></html>');
    const plugin = clientVersionPlugin(); plugin.configResolved({ root: run.directory, build: { outDir: 'dist' } });
    await plugin.writeBundle();
    const html = await readFile(path.join(output, 'index.html'), 'utf8');
    const manifest = JSON.parse(await readFile(path.join(output, 'client-version'), 'utf8'));
    assert.deepEqual(manifest, { schema: 1, version: clientVersionFromHtml(html) });
    await plugin.writeBundle();
    assert.equal((JSON.parse(await readFile(path.join(output, 'client-version'), 'utf8'))).version, manifest.version);
  } finally { await run.cleanup(); }
});

test('the existing service worker never intercepts or caches the live version manifest', async () => {
  const handlers = new Map();
  vm.runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    URL, self: { location: { origin: 'https://gobble.test' }, addEventListener: (name, callback) => handlers.set(name, callback) },
  });
  let intercepted = false;
  handlers.get('fetch')({ request: { method: 'GET', url: 'https://gobble.test/client-version?check=1',
    destination: '', mode: 'cors', headers: new Headers() }, respondWith() { intercepted = true; } });
  assert.equal(intercepted, false);
});

test('a real Vite build stamps the final hashed entry, without a backend or deployment', async () => {
  const run = await createRunDirectory('client-version-build');
  try {
    await writeFile(path.join(run.directory, 'index.html'), '<html><head><script type="module" src="/entry.js"></script></head></html>');
    await writeFile(path.join(run.directory, 'entry.js'), 'window.fixtureVersion = 1;');
    const { build } = await import('vite');
    await build({ configFile: false, root: run.directory, publicDir: false, logLevel: 'silent',
      plugins: [clientVersionPlugin()], build: { minify: false } });
    const html = await readFile(path.join(run.directory, 'dist/index.html'), 'utf8');
    const manifest = JSON.parse(await readFile(path.join(run.directory, 'dist/client-version'), 'utf8'));
    assert.match(html, /\/assets\/index-[^" ]+\.js/);
    assert.equal(clientVersionFromHtml(html), manifest.version);
  } finally { await run.cleanup(); }
});
