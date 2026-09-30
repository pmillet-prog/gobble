import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { adb, connectWebView, delay, serial } from './webview-session.mjs';

if (!serial.startsWith('emulator-')) throw new Error('Use a disposable emulator for this layout check');
const recordOnly = process.argv.includes('--record-only');
const session = await connectWebView();
const measures = [];
async function waitFor(expression, label) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await session.evaluate(expression)) return;
    await delay(300);
  }
  throw new Error(`Timed out: ${label}`);
}
async function measure(label) {
  const value = await session.evaluate(`(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.append(probe);
    const css = getComputedStyle(probe);
    const safe = ['paddingTop','paddingRight','paddingBottom','paddingLeft'].map(key => parseFloat(css[key]));
    probe.remove();
    const game = document.querySelector('.mobile-game-viewport') || [...document.querySelectorAll('div')]
      .find(node => node.style.position === 'fixed' && node.style.paddingTop === 'env(safe-area-inset-top)');
    return {safe, headerTop:game?.firstElementChild?.getBoundingClientRect().top,
      gamePadding:game ? getComputedStyle(game).paddingTop : null,
      height:innerHeight, visualHeight:visualViewport.height, orientation:screen.orientation.type};
  })()`);
  measures.push({ label, ...value });
  console.log(label, JSON.stringify(value));
  if (!recordOnly) {
    assert.deepEqual(value.safe, [0, 0, 0, 0], 'native padding must not be repeated in CSS');
    if (value.headerTop !== undefined) assert.equal(value.headerTop, 0, 'game header must touch the top of the WebView');
  }
  return value;
}

try {
  const userAgent = await session.evaluate('navigator.userAgent');
  assert.ok(Number(userAgent.match(/Chrome\/(\d+)/)?.[1]) >= 144, 'reproduction requires modern WebView inset support');
  await waitFor('!!document.querySelector(".home-tutorial-button, .mobile-game-viewport")', 'home');
  await measure('initial');
  if (await session.evaluate('!!document.querySelector(".home-tutorial-button")')) {
    await session.evaluate('document.querySelector(".home-tutorial-button").click()');
    await waitFor('!!document.querySelector(".tutorial-main-action")', 'tutorial welcome');
    await session.evaluate(`(() => {
      const restart = [...document.querySelectorAll('.tutorial-menu button')].find(button => button.textContent.includes('Rejouer les bases'));
      (restart || document.querySelector('.tutorial-main-action')).click();
    })()`);
  }
  await waitFor('!!document.querySelector(".mobile-game-viewport")', 'real game scene in local tutorial');
  await delay(800);
  const playing = await measure('playing');
  const directory = '.tmp/hybrid-measurements';
  await mkdir(directory, { recursive: true });
  const label = recordOnly ? 'before' : 'after';
  const screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${directory}/insets-${label}.png`, Buffer.from(screenshot.data, 'base64'));
  if (!recordOnly) {
    const oldSetting = await adb('shell', 'settings', 'get', 'secure', 'show_ime_with_hard_keyboard');
    try {
      await adb('shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1');
      const position = await session.evaluate(`(() => {
        const input = document.createElement('input'); input.id = 'hybrid-keyboard-probe';
        input.style.cssText = 'position:fixed;top:40%;left:10%;width:80%;height:50px;z-index:2147483647;background:white;color:black';
        document.body.append(input); const r=input.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};
      })()`);
      await session.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[position] });
      await session.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
      await waitFor(`visualViewport.height < ${playing.visualHeight - 100}`, 'keyboard shrinks visible viewport');
      await measure('keyboard shown');
      await adb('shell', 'input', 'keyevent', '4');
      await waitFor(`Math.abs(visualViewport.height - ${playing.visualHeight}) < 2`, 'keyboard closes without leftover gap');
      await measure('keyboard hidden');
    } finally {
      await session.evaluate('document.getElementById("hybrid-keyboard-probe")?.remove()');
      if (oldSetting === 'null') await adb('shell', 'settings', 'delete', 'secure', 'show_ime_with_hard_keyboard');
      else await adb('shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', oldSetting);
    }
    // Reach the real results screen through the local tutorial's skip controls.
    for (let step = 0; step < 12; step++) {
      const current = await session.evaluate('document.querySelector("[data-tutorial-step]")?.dataset.tutorialStep');
      if (current === 'vocabulary') break;
      await waitFor('!!document.querySelector(".tutorial-card-footer button:last-child")', 'tutorial skip control');
      await session.evaluate('document.querySelector(".tutorial-card-footer button:last-child").click()');
      await waitFor(`document.querySelector('[data-tutorial-step]')?.dataset.tutorialStep !== ${JSON.stringify(current)}`, 'next tutorial step');
    }
    await waitFor('!!document.querySelector("[data-results-heading]")', 'real results screen');
    await measure('results');
    const resultsScreenshot = await session.send('Page.captureScreenshot', { format:'png' });
    await writeFile(`${directory}/insets-results-${label}.png`, Buffer.from(resultsScreenshot.data, 'base64'));
  }
  await writeFile(`${directory}/insets-${label}.json`, JSON.stringify({ userAgent, native:await session.evaluate('GobbleNative.getDiagnostics()'), measures }, null, 2));
} finally { session.close(); }
