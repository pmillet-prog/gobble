import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { adb, connectWebView, delay, packageName, serial } from './webview-session.mjs';

if (!serial.startsWith('emulator-')) throw new Error('Sensor simulation checks require an Android emulator');

await adb('shell', 'am', 'force-stop', packageName);
await adb('shell', 'am', 'start', '-n', `${packageName}/fr.gobble.hybrid.MainActivity`,
  ...(process.env.GOBBLE_ANDROID_FIXTURE_ORIGIN ? ['--es','fixtureOrigin',process.env.GOBBLE_ANDROID_FIXTURE_ORIGIN] : []));
const session = await connectWebView();
const checks = [];
async function waitFor(expression, label) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await session.evaluate(expression)) { checks.push(label); console.log(label); return; }
    await delay(400);
  }
  throw new Error(`Timed out: ${label}`);
}
async function checkSafeAreas(label) {
  const padding = await session.evaluate(`(() => {
    const probe=document.createElement('div');
    probe.style.padding='env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.append(probe); const css=getComputedStyle(probe);
    const values=['paddingTop','paddingRight','paddingBottom','paddingLeft'].map(key=>parseFloat(css[key]));
    probe.remove(); return values;
  })()`);
  assert.deepEqual(padding, [0,0,0,0], `${label}: system bars must only be reserved by Android`);
  checks.push(`${label}: no duplicated web safe area`);
}
try {
  await waitFor('!!document.querySelector(".home-play")', 'home mounted');
  await adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '1');
  await adb('emu', 'sensor', 'set', 'acceleration', '9.776:0:0');
  await delay(1000);
  assert.equal(await session.evaluate('screen.orientation.type'), 'portrait-primary');
  assert.equal(await session.evaluate('!!document.fullscreenElement || !!document.querySelector(".home-display-mode-button")'), false);
  checks.push('home portrait with landscape sensor, no fullscreen');
  await checkSafeAreas('portrait home');
  await session.evaluate('window.__hybridOriginalTimeOrigin = performance.timeOrigin');
  const position = await session.evaluate('(() => { const r=document.querySelector(".home-chalkboard-button").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}; })()');
  await session.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[position]});
  await session.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
  await waitFor('!document.querySelector(".home-play") && screen.orientation.type.startsWith("landscape")', 'board landscape');
  await checkSafeAreas('landscape board');
  await adb('shell', 'input', 'keyevent', '4');
  await waitFor('!!document.querySelector(".home-play") && screen.orientation.type.startsWith("portrait")', 'Android Back returns home in portrait');
  await checkSafeAreas('portrait after Back');
  assert.equal(await session.evaluate('window.__hybridOriginalTimeOrigin === performance.timeOrigin'), true);
  checks.push('rotation and Back preserve the React document');
  await adb('shell', 'input', 'keyevent', '3');
  await delay(700);
  await adb('shell', 'am', 'start', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-n', `${packageName}/fr.gobble.hybrid.MainActivity`);
  await waitFor('document.visibilityState === "visible"', 'foreground resumed');
  assert.equal(await session.evaluate('window.__hybridOriginalTimeOrigin === performance.timeOrigin'), true);
  assert.equal(await session.evaluate('screen.orientation.type'), 'portrait-primary');
  checks.push('launcher resume preserves document and portrait');
  const audio = await session.evaluate(`(async()=>{
    const response=await fetch('/sound/ui/click.wav',{headers:{Range:'bytes=0-15'}});
    return {status:response.status,bytes:(await response.arrayBuffer()).byteLength,source:response.headers.get('x-gobble-asset')};
  })()`);
  assert.equal(audio.status, 206); assert.equal(audio.bytes, 16);
  if (process.env.GOBBLE_ANDROID_FIXTURE_ORIGIN) assert.ok(['bundled','cache','download'].includes(audio.source));
  checks.push('audio supports byte ranges');
  const results = {checks, native:await session.evaluate('GobbleNative.getDiagnostics()'), browser:await session.evaluate('navigator.userAgent')};
  await mkdir('.tmp/hybrid-measurements', {recursive:true});
  await writeFile('.tmp/hybrid-measurements/runtime-checks.json', JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
} finally { session.close(); }
