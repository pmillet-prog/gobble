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
    try {
      if (await session.evaluate(expression)) { checks.push(label); console.log(label); return; }
    } catch (error) {
      // A successful native reload replaces the execution context mid-poll.
      if (!/Execution context|Cannot find context|context.*destroyed|Inspected target navigated/i.test(error.message)) throw error;
    }
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
async function touchPosition(selector, verticalFraction = 0.5) {
  return session.evaluate(`(() => {
    const element=document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Touch target missing');
    const r=element.getBoundingClientRect();
    return {x:Math.max(24,Math.min(innerWidth-24,r.x+r.width/2)),
      y:Math.max(24,Math.min(innerHeight-180,r.y+r.height*${verticalFraction}))};
  })()`);
}
async function tapElement(expression) {
  // Button taps use the real center, without the swipe's reserved bottom space.
  const center = await session.evaluate(`(() => { const r=(${expression}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await session.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[center]});
  await session.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
}
const tap = selector => tapElement(`document.querySelector(${JSON.stringify(selector)})`);
async function swipe(selector, dx, dy, { armed = false, verticalFraction = 0.5 } = {}) {
  const start = await touchPosition(selector, verticalFraction);
  await session.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[start]});
  try {
    for (let step = 1; step <= 8; step++) {
      await session.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x:start.x+dx*step/8,y:start.y+dy*step/8}]});
      await delay(24);
    }
    if (armed) assert.equal(await session.evaluate('document.querySelector("[data-native-pull-refresh]")?.textContent'), 'Relâche pour actualiser');
  } finally {
    await session.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
  }
}
async function checkNoReload(label, swipeAction) {
  const timeOrigin = await session.evaluate('performance.timeOrigin');
  await swipeAction(); await delay(400);
  assert.equal(await session.evaluate('performance.timeOrigin'), timeOrigin, label);
  assert.equal(await session.evaluate('!!document.querySelector("[data-native-pull-refresh]")'), false, `${label}: no leftover indicator`);
  checks.push(label); console.log(label);
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
  await waitFor('!!document.querySelector(".home-lobby-stage-complete")', 'home intro complete before gestures');
  assert.equal(await session.evaluate('typeof GobbleNative.reload'), 'function');
  await checkNoReload('short home pull does not reload', () => swipe('.home-title', 0, 55));
  await checkNoReload('horizontal home swipe does not reload', () => swipe('.home-title', 100, 12));
  await tap('.home-icon-button[aria-label="Chat"]');
  await waitFor('!!document.querySelector("[data-chat-panel]")', 'home chat modal mounted');
  // A fresh guest sees the chat rules above the drawer. Dismiss that extra
  // dialog before testing gestures on the actual chat surface underneath.
  const rulesDialog = '[...document.querySelectorAll("[role=dialog]")].find(dialog => dialog.textContent.includes("Règles du chat"))';
  if (await session.evaluate(`!!(${rulesDialog})`)) {
    await tapElement(`(${rulesDialog}).querySelector('button')`);
    await waitFor(`!(${rulesDialog})`, 'initial chat rules dismissed');
  }
  await checkNoReload('pull in home chat modal does not reload', () => swipe('[data-chat-panel]', 0, 130, {verticalFraction:0.15}));
  await tap('[data-chat-panel] .chat-content-header button:last-child');
  await waitFor('!document.querySelector("[data-chat-panel]")', 'chat close control returns home');
  const beforePull = await session.evaluate('performance.timeOrigin');
  await swipe('.home-title', 0, 130, {armed:true});
  await waitFor(`performance.timeOrigin !== ${beforePull} && !!document.querySelector(".home-lobby-stage-complete")`, 'vertical home pull reloads the native WebView');
  assert.equal(await session.evaluate('!!document.querySelector("[data-native-pull-refresh]")'), false);
  await session.evaluate('window.__hybridOriginalTimeOrigin = performance.timeOrigin');
  await tap('.home-chalkboard-button');
  await waitFor('!document.querySelector(".home-play") && screen.orientation.type.startsWith("landscape")', 'board landscape');
  await checkSafeAreas('landscape board');
  await waitFor('!!document.querySelector(".chalkboard-scroll")', 'board surface mounted');
  await checkNoReload('pull on chalkboard does not reload', () => swipe('.chalkboard-scroll', 0, 130, {verticalFraction:0.1}));
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
