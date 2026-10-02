import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adb, connectWebView, delay, packageName, serial } from './webview-session.mjs';
import { chalkboardFontCatalog } from '../../server/chalkboard/chalkboardFontCatalog.js';

if (!serial.startsWith('emulator-')) throw new Error('Use a disposable emulator');
const manifest = JSON.parse(await readFile('dist/native-assets.json', 'utf8'));
const seed = JSON.parse(await readFile('android-hybrid/app/build/generated/web-assets/bundle-manifest.json', 'utf8'));
const requests = [], checks = [], mediaChecks = [];
const chalkFonts = chalkboardFontCatalog.getFonts();
const avatarCatalog = JSON.parse(await readFile('public/avatars/v1/catalog.json', 'utf8'));
const soundSource = await readFile('src/audio/audioAssets.js', 'utf8');
const soundVersion = soundSource.match(/export const SOUND_ASSET_VERSION\s*=\s*"([^"]+)"/)?.[1];
assert.ok(soundVersion, 'Use the runtime audio cachebuster');
const versionedSound = `/sound/game/invalide.mp3?v=${encodeURIComponent(soundVersion)}`;
const bundledMediaUrls = [
  '/chalkboard/surface/patinee-v2.webp',
  ...chalkFonts.map(font => font.src),
  ...Object.keys(manifest.files).filter(url => url.startsWith('/buttons/')),
];
const onDemandMediaUrls = [
  '/textures/jeans.jpg', '/textures/marbre.jpg', '/textures/beton.jpg',
  `/avatars/v1/${avatarCatalog.bases[0].file}`,
  '/sound/music/ruisseauforet.mp3', versionedSound,
];
assert.ok(chalkFonts.length >= 12, 'Exercise every currently selectable chalk font');
assert.ok(bundledMediaUrls.includes('/buttons/grand-tableau-v2.webp'));
for (const url of [...bundledMediaUrls, ...onDemandMediaUrls]) {
  const pathname = decodeURIComponent(new URL(url, 'https://gobble.fr').pathname);
  assert.ok(manifest.files[pathname], `Missing runtime media in web manifest: ${url}`);
  assert.equal(Boolean(seed.files[pathname]), bundledMediaUrls.includes(url), `Wrong APK media selection: ${url}`);
}
let version = 1, maintenance = false, missingManifest = false, invalidManifest = false, game = false;
const replacement = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="blue"/></svg>');
function currentManifest() {
  const value = structuredClone(manifest);
  if (version === 2) value.files['/icon.svg'] = { bytes: replacement.length, mime: 'image/svg+xml', sha256: createHash('sha256').update(replacement).digest('hex') };
  if (invalidManifest) value.files['/app.js'] = { ...value.files['/icon.svg'] };
  value.version = createHash('sha256').update(JSON.stringify(value.files)).digest('hex').slice(0, 16);
  return value;
}
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.wav':'audio/wav', '.mp3':'audio/mpeg', '.m4a':'audio/mp4', '.ogg':'audio/ogg', '.ttf':'font/ttf', '.otf':'font/otf', '.woff':'font/woff', '.woff2':'font/woff2', '.txt':'text/plain' };
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  requests.push({ version, path: pathname });
  const reply = (status, type, data) => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control':'no-store' }); res.end(data); };
  if (pathname === '/native-assets.json') return reply(missingManifest ? 404 : 200, 'application/json', JSON.stringify(currentManifest()));
  if (!game) {
    if (pathname === '/') return reply(maintenance ? 503 : 200, 'text/html', maintenance ? '<h1>Gobble se refait une beauté</h1>' : `<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"><h1>Version web ${version}</h1><input id="draft"><script src="/app.js"></script>`);
    if (pathname === '/app.css') return reply(200, 'text/css', `body{background:${version === 1 ? 'rgb(10, 20, 30)' : 'rgb(30, 40, 50)'};color:white}`);
    if (pathname === '/app.js') return reply(200, 'text/javascript', `window.webVersion=${version}; window.loadedAt=performance.timeOrigin; window.readAsset=async function(url,range){const r=await fetch(url,range?{headers:{Range:range}}:{});return {status:r.status,source:r.headers.get('x-gobble-asset'),body:await r.text()}};window.readMedia=async function(url,range){const r=await fetch(url,range?{headers:{Range:range}}:{});const data=await r.arrayBuffer();const hash=await crypto.subtle.digest('SHA-256',data);return {status:r.status,source:r.headers.get('x-gobble-asset'),mime:r.headers.get('content-type'),bytes:data.byteLength,sha256:Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')}};window.fixtureReady=true;`);
    if (pathname === '/api/test.png') return reply(200, 'text/plain', 'API response');
    if (pathname === '/icon.svg' && version === 2) return reply(200, 'image/svg+xml', replacement);
  }
  if (pathname === '/api/chalkboard/fonts') return reply(200, 'application/json', JSON.stringify({ok:true,fonts:chalkFonts}));
  if (pathname === '/api/chalkboard/access') return reply(200, 'application/json', JSON.stringify({ok:true,canAccess:true}));
  if (pathname.startsWith('/api/') || pathname.startsWith('/socket.io/')) return reply(200, 'application/json', JSON.stringify({ok:true,user:null,maintenanceMode:false,rooms:[]}));
  const root = path.resolve(game ? 'dist' : 'public');
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) return reply(400, 'text/plain', 'Bad path');
  try { return reply(200, mime[path.extname(file)] || 'application/octet-stream', await readFile(file)); }
  catch { return reply(404, 'text/plain', 'Missing fixture file'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await adb('reverse', `tcp:${port}`, `tcp:${port}`);
let session;
const origin = `http://127.0.0.1:${port}`;
async function launch() {
  session?.close();
  await adb('shell', 'am', 'force-stop', packageName);
  await adb('shell', 'am', 'start', '-n', `${packageName}/fr.gobble.hybrid.MainActivity`, '--es', 'fixtureOrigin', origin);
  session = await connectWebView();
  await session.send('Page.enable');
}
async function waitFor(expression) {
  for (let i = 0; i < 100; i++) {
    try { if (await session.evaluate(expression)) return; } catch { }
    await delay(150);
  }
  throw new Error(`Timed out: ${expression}`);
}
function pass(label) { checks.push(label); console.log(label); }
function assertMedia(result, expected, url) {
  assert.equal(result.status, 200, url);
  assert.equal(result.bytes, expected.bytes, url);
  assert.equal(result.sha256, expected.sha256, url);
  assert.ok(result.mime?.startsWith(expected.mime), `${url}: ${result.mime}`);
}
try {
  await launch(); await waitFor('window.fixtureReady');
  assert.equal(await session.evaluate('webVersion'), 1);
  assert.equal(await session.evaluate('getComputedStyle(document.body).backgroundColor'), 'rgb(10, 20, 30)');
  const initial = await session.evaluate("readAsset('/icon.svg')");
  assert.equal(initial.source, 'bundled');
  assert.equal(requests.filter(r => r.path === '/icon.svg').length, 0);
  pass('Web release 1 loads over the network; unchanged media comes from the APK without downloading.');
  for (const url of bundledMediaUrls) {
    const pathname = decodeURIComponent(new URL(url, 'https://gobble.fr').pathname);
    const expected = manifest.files[pathname];
    const result = await session.evaluate(`readMedia(${JSON.stringify(url)})`);
    assertMedia(result, expected, url);
    assert.equal(result.source, 'bundled', url);
    assert.equal(requests.filter(r => r.path === pathname).length, 0, `${url} must not be downloaded`);
    mediaChecks.push({url,...result});
  }
  pass('Grand Tableau background and all chalk fonts, plus every button, load entirely from the small APK seed with matching file hashes.');
  for (const url of onDemandMediaUrls) {
    const pathname = decodeURIComponent(new URL(url, 'https://gobble.fr').pathname);
    const expected = manifest.files[pathname];
    const before = requests.filter(r => r.path === pathname).length;
    const first = await session.evaluate(`readMedia(${JSON.stringify(url)})`);
    assertMedia(first, expected, url);
    assert.ok(['download', 'cache'].includes(first.source), `${url} must use the on-demand store, not the APK`);
    const after = requests.filter(r => r.path === pathname).length;
    assert.equal(after - before, first.source === 'download' ? 1 : 0, url);
    const cached = await session.evaluate(`readMedia(${JSON.stringify(url)})`);
    assertMedia(cached, expected, url);
    assert.equal(cached.source, 'cache', url);
    assert.equal(requests.filter(r => r.path === pathname).length, after, `${url} must not download again`);
    mediaChecks.push({url, first, cached});
  }
  pass('JPEG textures, avatar layers, music and gameplay audio stay outside the APK, retain their exact file hashes and are cached after first use.');
  const soundRequests = requests.filter(r => r.path === '/sound/game/invalide.mp3').length;
  const versionedRange = await session.evaluate(`readMedia(${JSON.stringify(versionedSound)},'bytes=0-31')`);
  assert.equal(versionedRange.status, 206); assert.equal(versionedRange.source, 'cache'); assert.equal(versionedRange.bytes, 32);
  assert.equal(requests.filter(r => r.path === '/sound/game/invalide.mp3').length, soundRequests);
  pass('Runtime audio cachebusters retain byte-range support from the on-demand disk cache.');
  const range = await session.evaluate("readAsset('/sound/ui/click.wav','bytes=0-15')");
  assert.equal(range.status, 206); assert.equal(range.source, 'bundled');
  // Older WebViews surface HTTP 416 as a rejected fetch (network range error).
  assert.equal(await session.evaluate("readAsset('/sound/ui/click.wav','bytes=999999999-').then(r=>r.status===416).catch(e=>e instanceof TypeError)"), true);
  pass('Native media retains byte-range support.');
  const timeOrigin = await session.evaluate("document.querySelector('#draft').value='Brouillon conservé';performance.timeOrigin");
  await adb('shell', 'am', 'start', '-a', 'android.settings.SETTINGS'); await delay(500);
  await adb('shell', 'am', 'start', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-n', `${packageName}/fr.gobble.hybrid.MainActivity`);
  await waitFor("document.visibilityState==='visible'");
  assert.equal(await session.evaluate('performance.timeOrigin'), timeOrigin);
  assert.equal(await session.evaluate("document.querySelector('#draft').value"), 'Brouillon conservé');
  pass('Switching to Android Settings and back preserves the document and input.');
  version = 2;
  await session.send('Page.reload', { ignoreCache:true }); await waitFor('window.fixtureReady && webVersion===2');
  assert.equal(await session.evaluate('getComputedStyle(document.body).backgroundColor'), 'rgb(30, 40, 50)');
  const updated = await session.evaluate("readAsset('/icon.svg')");
  assert.equal(updated.body, replacement.toString()); assert.ok(['download','cache'].includes(updated.source));
  const requestsAfterUpdate = requests.filter(r => r.path === '/icon.svg').length;
  assert.equal((await session.evaluate("readAsset('/icon.svg')")).source, 'cache');
  assert.equal(requests.filter(r => r.path === '/icon.svg').length, requestsAfterUpdate);
  pass('The SAME installed APK loads new HTML, JS, CSS and a changed same-name image; further image reads are local.');
  await launch(); await waitFor('window.fixtureReady && webVersion===2');
  assert.equal((await session.evaluate("readAsset('/icon.svg')")).source, 'cache');
  assert.equal(requests.filter(r => r.path === '/icon.svg').length, requestsAfterUpdate);
  pass('The updated image survives process restart without a download or APK replacement.');
  assert.equal((await session.evaluate("readAsset('/icon.svg?v=another')")).source, null);
  assert.equal((await session.evaluate("readMedia('/sound/game/invalide.mp3?preview=1')")).source, null);
  assert.equal((await session.evaluate("readAsset('/api/test.png')")).source, null);
  invalidManifest = true;
  await session.send('Page.reload', {ignoreCache:true}); await waitFor('window.fixtureReady');
  assert.equal((await session.evaluate("readAsset('/icon.svg')")).source, null);
  invalidManifest = false; missingManifest = true;
  await session.send('Page.reload', {ignoreCache:true}); await waitFor('window.fixtureReady');
  assert.equal((await session.evaluate("readAsset('/icon.svg')")).body, replacement.toString());
  assert.equal((await session.evaluate("readAsset('/icon.svg')")).source, null);
  pass('Unrecognized query URLs, APIs and missing/invalid manifests fall back to the website, never stale APK contents.');
  missingManifest = false; maintenance = true;
  await session.send('Page.reload', {ignoreCache:true}); await waitFor("document.body.innerText.includes('Gobble se refait')");
  pass('A web maintenance response is displayed instead of an embedded app.');
  maintenance = false; game = true; version = 1;
  await launch(); await waitFor("!!document.querySelector('.home-play')");
  assert.equal(await session.evaluate('!!navigator.serviceWorker.controller'), false);
  pass('The actual freshly built Gobble client mounts from the local web deployment.');
  await mkdir('.tmp/hybrid-measurements', { recursive:true });
  await writeFile('.tmp/hybrid-measurements/web-updates.json', JSON.stringify({ checks, mediaChecks, native:await session.evaluate('GobbleNative.getDiagnostics()'), requests }, null, 2));
  // Run the existing real-game lifecycle/rotation checks against this local web
  // deployment. No game server or production account is involved.
  session.close(); session = null;
  process.env.GOBBLE_ANDROID_FIXTURE_ORIGIN = origin;
  await import('./verify-hybrid-runtime.mjs');
} finally {
  session?.close();
  await adb('shell', 'am', 'force-stop', packageName).catch(() => {});
  await adb('reverse', '--remove', `tcp:${port}`).catch(() => {});
  await new Promise(resolve => server.close(resolve));
}
