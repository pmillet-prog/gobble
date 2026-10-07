import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { TARGET_QUIZ_FEEDBACK_MS, TARGET_QUIZ_QUESTION_FADE_MS } from "../../shared/targetQuizTiming.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, ".tmp/target-quiz");
const origin = process.env.TARGET_QUIZ_ORIGIN || "http://127.0.0.1:8773";
const focused = process.argv.includes("--focus");
const lightsOnly = process.argv.includes("--lights");
const lightFramesOnly = process.argv.includes("--lights-frames");
const audioOnly = process.argv.includes("--audio");
const verdictFilesOnly = process.argv.includes("--verdict-files");
const integrationOnly = process.argv.includes("--integration");
const rewardsOnly = process.argv.includes("--rewards");
const avatarOnly = process.argv.includes("--avatar-flow");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
await fs.mkdir(output, { recursive: true });
const errors = [], cases = [];
let checks = 0, chrome, socket, cdp, chromeLog;
async function until(read, label, count = 150) {
  for (let index = 0; index < count; index++) {
    const value = await read();
    if (value) return value;
    await delay(25);
  }
  throw new Error(`Timeout: ${label}`);
}
function attach(ws) {
  let sequence = 0;
  const pending = new Map();
  ws.on("message", raw => {
    const message = JSON.parse(raw);
    if (!message.id) {
      if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
      return;
    }
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer);
    if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result);
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const call = (method, ...args) => evaluate(`window.targetQuizFixture[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
const snapshot = () => call("snapshot");
function check(label, condition, detail) { checks++; assert.ok(condition, `${label}: ${JSON.stringify(detail)}`); }
async function capture(label) {
  const state = await snapshot(); cases.push({ label, ...state });
  const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(output, `${label}.png`), Buffer.from(screenshot.data, "base64"));
  return state;
}
async function ready() {
  return until(async () => {
    const state = await snapshot();
    return state.session?.phase === "running" && state.choices.length === 4 && state.choices.every(choice => !choice.disabled) && state;
  }, "four available choices");
}

async function verifyAvatarFlow() {
  const clickText = text => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim().endsWith(${JSON.stringify(text)})); if (!button || button.disabled) throw new Error('Button unavailable: ' + ${JSON.stringify(text)}); button.click(); })()`);
  const read = () => evaluate("window.avatarFlowFixture.snapshot()");
  for (const [width, height] of [[1280, 900], [390, 844]]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await cdp("Page.navigate", { url: `${origin}/dev/avatar-flow/` });
    await until(() => evaluate("!!window.avatarFlowFixture"), "avatar fixture", 400);
    await clickText("Modifier mon avatar");
    await until(() => evaluate("!!document.querySelector('.avatar-face-model')"), "shortcut opens editor", 400);
    check("Home profile shortcut opens the avatar editor directly", !await evaluate("!!document.querySelector('.profile-avatar-edit')"));
    await evaluate("window.avatarFlowFixture.failNextSave()");
    await clickText("Homme");
    await until(() => evaluate("!!document.querySelector('.avatar-editor-footer [role=alert]')"), "save failure explained");
    check("Failed initial selection does not unlock purchases or lose the retry", (await read()).revision === 0 && !await evaluate("!!document.querySelector('.avatar-categories')"));
    await clickText("Homme");
    await until(async () => (await read()).revision === 1 && await evaluate("!!document.querySelector('.avatar-categories')"), "first face saved automatically");
    check("First face saves once at revision zero, keeping the editor open", (await read()).saves.length === 1 && (await read()).saves[0].expectedRevision === 0 && await evaluate("!!document.querySelector('.avatar-editor')"));
    await clickText("Femme");
    await until(() => evaluate("!!document.querySelector('dialog[open]')"), "face replacement confirmation");
    check("Replacement is not saved before confirmation", (await read()).revision === 1);
    const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await fs.writeFile(path.join(output, `avatar-confirm-${width}.png`), Buffer.from(screenshot.data, "base64"));
    await clickText("Garder mon visage");
    check("Cancelling preserves the saved and selected face", (await read()).avatar.base === "homme" && await evaluate("document.querySelector('.avatar-face-model[aria-pressed=true]').textContent.includes('Homme')"));
    await clickText("Femme"); await clickText("Confirmer ce visage");
    await until(async () => (await read()).revision === 2 && !await evaluate("!!document.querySelector('dialog[open]')"), "replacement saved");
    check("Confirmed replacement uses the new revision", (await read()).avatar.base === "femme" && (await read()).saves[1].expectedRevision === 1);
    await evaluate("document.querySelector('.avatar-skin-choice[aria-pressed=false]').click()");
    await until(() => evaluate("!!document.querySelector('dialog[open]')"), "style confirmation");
    await clickText("Confirmer ce visage");
    await until(async () => (await read()).revision === 3 && !await evaluate("!!document.querySelector('dialog[open]')"), "style saved");
    await evaluate("[...document.querySelectorAll('.avatar-categories button')].find(node => node.textContent.includes('Cheveux')).click()");
    await until(() => evaluate("!!document.querySelector('.avatar-unlock-buy')"), "paid hair choice");
    await evaluate("document.querySelector('.avatar-unlock-buy').click()");
    await until(() => evaluate("!!document.querySelector('dialog[open] .avatar-save')"), "purchase dialog");
    await evaluate("document.querySelector('dialog[open] .avatar-save').click()");
    await until(() => evaluate("[...document.querySelectorAll('dialog[open] button')].some(node => node.textContent === 'Porter maintenant' && !node.disabled)"), "purchase can be worn");
    check("Paid accessories work immediately after face validation", (await read()).purchases.length === 1 && (await read()).purchases[0].hadFace);
    await clickText("Porter maintenant");
    await until(async () => (await read()).revision === 4 && !await evaluate("!!document.querySelector('.avatar-editor')"), "full avatar worn");
    check("Wearing purchase saves with the latest face revision", !!(await read()).avatar.hair && (await read()).saves[3].expectedRevision === 3);
    check("Avatar flow has no revision conflict", !await evaluate("document.body.textContent.includes('autre appareil')"));
  }
}
function checkTransitionTiming(state) {
  const events = state.transitionEvents;
  const out = events.find(event => event.transition.includes("--out"));
  const incoming = events.find(event => event.transition.includes("--in"));
  const complete = events.find(event => incoming && event.at > incoming.at &&
    event.presenter === "question" && !event.transition.includes("--out") && !event.transition.includes("--in"));
  check("Both fade phases and completion are observed", out && incoming && complete, events);
  const timings = { out: incoming.at - out.at, incoming: complete.at - incoming.at, total: complete.at - out.at };
  check("Old question fades out for half the feedback duration", Math.abs(timings.out - TARGET_QUIZ_QUESTION_FADE_MS) < 125, timings);
  check("New question fades in for half the feedback duration", Math.abs(timings.incoming - TARGET_QUIZ_QUESTION_FADE_MS) < 125, timings);
  check("Reaction covers the full feedback duration", Math.abs(timings.total - TARGET_QUIZ_FEEDBACK_MS) < 125, timings);
}

async function verifyRewards() {
  for (const profile of [{ layout: "desktop", width: 1280, height: 900 }, { layout: "small", width: 320, height: 640 }]) {
    const mobile = profile.layout === "small";
    await cdp("Emulation.setDeviceMetricsOverride", { width: profile.width, height: profile.height, deviceScaleFactor: 1, mobile });
    await cdp("Page.navigate", { url: `${origin}/dev/target-quiz/?strict=1${mobile ? '&phone=1' : ''}` });
    await until(() => evaluate("!!window.targetQuizFixture"), "fixture", 400);
    await call("reset", { layout: profile.layout, points: { total: -300, points: 9950, cycles: 0 } });
    await ready();
    await call("answer", true); await ready();
    check("A milestone remains silent until the recap", !await call("reward"));
    await call("finishRound");
    await until(() => evaluate("!!document.querySelector('.target-quiz-recap .target-quiz-progress')"), "recap progress");
    check("Recap keeps all four round statistics", await evaluate("document.querySelectorAll('.target-quiz-recap__stats dd').length === 4"));
    await until(() => evaluate("document.querySelector('.target-quiz-recap [role=progressbar]').getAttribute('aria-valuenow') === '10000'"), "full milestone gauge");
    const reward = await until(() => call("reward"), "50 gobblars toast");
    check("Reward toast shows the earned fifty gobblars", reward.amount === 50 && reward.label === "Qui veut gagner des Gobblars", reward);
    await capture(`rewards-${profile.layout}-milestone`);
    await until(() => evaluate("document.querySelector('.target-quiz-recap [role=progressbar]')?.getAttribute('aria-valuenow') === '50'"), "surplus after wrap");
    check("Recap preserves a negative lifetime total", await evaluate("document.querySelector('.target-quiz-recap .target-quiz-progress__total').textContent.includes('−200')"));
    check("Recap card fits the viewport", await evaluate("document.querySelector('.target-quiz-recap__card').scrollHeight <= document.querySelector('.target-quiz-recap__card').clientHeight + 1"));
    await capture(`rewards-${profile.layout}-surplus`);
    await call("openProfile");
    check("Profile displays the persisted gauge and signed total", await evaluate("document.querySelector('.profile-target-quiz [role=progressbar]').getAttribute('aria-valuenow') === '50' && document.querySelector('.profile-target-quiz').textContent.includes('−200')"));
    await capture(`rewards-${profile.layout}-profile`);
    await call("reset", { layout: profile.layout, points: { total: 12000, points: 9950, cycles: 1 } });
    await ready(); await call("answer", true); await ready();
    await until(async () => !(await call("lights")), "intro ends");
    for (const pose of ["hit1", "hit2", "hit1"]) {
      await evaluate("document.querySelector('.target-quiz__presenter-hit').click()");
      await until(async () => (await snapshot()).presenter?.state === pose, "punch confirmed");
      check(`Presenter shows ${pose}`, (await snapshot()).presenter.state === pose);
      await until(() => evaluate("document.querySelector('.target-quiz__presenter-reaction')?.naturalWidth > 0"), "hit asset loaded");
      await delay(600);
      check("Another punch resets the inactivity timer", (await snapshot()).presenter.state === pose);
    }
    await until(async () => (await snapshot()).presenter?.state === "stars", "stars after no more hits");
    await until(() => evaluate("document.querySelector('.target-quiz__presenter-reaction')?.naturalWidth > 0"), "stars asset loaded");
    await capture(`rewards-${profile.layout}-stars`);
    await until(async () => (await call("integrationState")).dismissed, "quiz dismissed");
    check("Dismissal restores the solved target screen", !(await snapshot()).panel && await evaluate("!!document.querySelector('.mobile-target-hint-definition')"));
    check("Dismissal removes the dimming", !await evaluate("!!document.querySelector('.target-quiz-backdrop')"));
    const cancelled = (await call("integrationState")).summary;
    check("Knockout cancels the score and crossed reward threshold", cancelled.score === 0 && cancelled.cancelled && cancelled.progression.after.points === 9950 && cancelled.progression.after.total === 12000 && cancelled.progression.rewards.length === 0, cancelled);
    await call("reset", { layout: profile.layout, points: { total: 0, points: 0, cycles: 0 } });
    await ready(); await call("answer", false); await ready(); await call("finishRound");
    await until(() => evaluate("document.querySelector('.target-quiz-recap .target-quiz-progress__total')?.textContent.includes('−75')"), "negative progress animation");
    check("Loss at zero never produces a negative gauge or a reward", await evaluate("document.querySelector('.target-quiz-recap [role=progressbar]').getAttribute('aria-valuenow') === '0'") && !await call("reward"));
  }
}

async function verifyIntegration() {
  const mobileGeometry = () => evaluate(`(() => {
    const preview = document.querySelector('[data-game-word-preview]');
    const grid = preview.nextElementSibling.firstElementChild;
    return [document.querySelector('.mobile-target-hint'), preview, grid, grid.nextElementSibling].map(node => {
      const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height };
    });
  })()`);
  for (const profile of [{ layout: "desktop", width: 1280, height: 900 }, { layout: "small", width: 320, height: 640 }, { layout: "mobile", width: 390, height: 844 }]) {
    const mobile = profile.layout !== "desktop";
    await cdp("Emulation.setDeviceMetricsOverride", { width: profile.width, height: profile.height, deviceScaleFactor: 1, mobile });
    await cdp("Page.navigate", { url: `${origin}/dev/target-quiz/?strict=1${mobile ? '&phone=1' : ''}` });
    await until(() => evaluate("!!window.targetQuizFixture"), "fixture", 400);
    await call("reset", { layout: profile.layout, integration: true, long: false, mode: "words" });
    await delay(80);
    check("An unsolved target never requests a quiz question", !(await snapshot()).server.log.some(e => e.event === "targetQuiz:start"));
    await call("findTarget", 5000);
    await delay(80);
    check("A target found with exactly five seconds left never launches", !(await call("integrationState")).entered);
    check("Result rows retain speed order with a separate signed quiz bonus", await evaluate(`(() => {
      const text = document.querySelector('.fixture-results').textContent;
      return text.indexOf('Paul') < text.indexOf('Test') && text.indexOf('−75') < text.indexOf('+10') && text.includes('+425') && document.querySelectorAll('.fixture-results .target-quiz-bonus').length === 2;
    })()`));
    await until(() => evaluate("[...document.querySelectorAll('.fixture-results .target-quiz-bonus img')].every(img => img.complete && img.naturalWidth > 0)"), "result logos loaded");
    check("Result row logo loads locally", true);
    check("No request is sent for late discovery", !(await snapshot()).server.log.some(e => e.event === "targetQuiz:start"));
    await call("reset", { layout: profile.layout, integration: true, long: true });
    await delay(80);
    await call("findTarget");
    const before = mobile ? await mobileGeometry() : null;
    await delay(900);
    check("Gobble plays before any question request or quiz overlay", (await call("integrationState")).gobbleActive && !(await snapshot()).panel && !(await snapshot()).server.log.some(e => e.event === "targetQuiz:start") && !await evaluate("!!document.querySelector('.target-quiz-backdrop')"));
    await ready();
    check("Quiz intro starts after Gobble finishes", !(await call("integrationState")).gobbleActive && await evaluate("!!document.querySelector('.target-quiz-backdrop')"));
    if (mobile) {
      check("Mobile target, validation field, grid and feed retain their geometry", JSON.stringify(before) === JSON.stringify(await mobileGeometry()), { before, after: await mobileGeometry() });
      check("Mobile has no target word flight or duplicate target link", !await evaluate("!!document.querySelector('.target-quiz__target-link')"));
      check("Mobile score occupies the validation field and stats occupy the feed", await evaluate("!!document.querySelector('[data-game-word-preview] .target-quiz-mobile-score') && !!document.querySelector('[data-target-quiz-surface=stats] .target-quiz-mobile-stats')"));
    } else check("The desktop target word and loupe still fly together", await evaluate("!!document.querySelector('.target-quiz__target-flight svg')"));
    await until(() => evaluate("!document.querySelector('.target-quiz__target-flight')"), "target flight complete");
    await until(async () => !(await call("lights")), "lighting finished");
    await evaluate("document.querySelector('.fixture-stage').scrollIntoView({block: 'center'})");
    let state = await capture(`integration-${profile.layout}-playing`);
    check("Integration fits the viewport", state.documentWidth <= state.viewportWidth, state);
    check("All question content fits without horizontal scrolling", state.panel.scrollWidth <= state.panel.clientWidth + 1, state.panel);
    check("All question content fits without vertical scrolling", state.panel.scrollHeight <= state.panel.clientHeight + 1, state.panel);
    await evaluate(`document.querySelector('${mobile ? '.mobile-target-hint-definition' : '.target-quiz__target-link'}').click()`);
    check("The target definition remains accessible", (await call("integrationState")).definitionOpen);
    await evaluate("document.querySelector('[aria-label=\"Définition du mot cible\"] button').click()");
    await call("answer", false);
    await ready();
    check("A first wrong answer can produce a negative balance", (await snapshot()).session.score === -75);
    if (mobile) {
      check("Score and wrong count update in the original blocks", await evaluate("document.querySelector('.target-quiz-mobile-score strong').textContent === '−75' && [...document.querySelectorAll('.target-quiz-mobile-stats dd')].map(n=>n.textContent).join(',') === '0,0,0,1'"));
      await call("answer", true); await ready();
      check("Current streak and best streak update after a correct answer", await evaluate("[...document.querySelectorAll('.target-quiz-mobile-stats dd')].map(n=>n.textContent).join(',') === '1,1,1,1'"));
    }
    await evaluate("document.querySelector('.target-quiz__presenter-hit').click()");
    check("Hitting the presenter locks the answers immediately", (await snapshot()).choices.every(choice => choice.disabled));
    await until(async () => (await call("integrationState")).dismissed, "presenter dismissal", 200);
    check("Dismissal stops exposure and closes the panel", !(await snapshot()).panel && (await snapshot()).server.log.some(e => e.event === "targetQuiz:dismiss"));
    check("The dismissed mini-game cancels its score and keeps a recap", (await call("integrationState")).started && (await call("integrationState")).summary.score === 0 && (await call("integrationState")).summary.cancelled);
    check("Dismissal removes the general dimming", !await evaluate("!!document.querySelector('.target-quiz-backdrop')"));
    await call("findTarget");
    check("The mini-game stays dismissed for this round", !(await call("integrationState")).active);
    await evaluate("void window.targetQuizFixture.recap()");
    check("Recap shows the cancelled balance and four statistics", await evaluate("document.querySelector('.target-quiz-recap__score')?.textContent === '+0' && document.querySelectorAll('.target-quiz-recap__stats dd').length === 4 && document.querySelector('.target-quiz-recap__unit').textContent.includes('points annulés')"));
    await delay(350);
    await capture(`integration-${profile.layout}-recap`);
    check("Recap fits the screen", await evaluate("document.querySelector('.target-quiz-recap__card').scrollHeight <= document.querySelector('.target-quiz-recap__card').clientHeight + 1"));
    await call("reset", { layout: profile.layout, integration: true, long: false });
    check("Changing rounds cancels the recap", !await evaluate("!!document.querySelector('.target-quiz-recap')"));
    await call("findTarget", 5500, 800);
    await delay(600);
    check("A short Gobble also waits for its actual duration", (await call("integrationState")).gobbleActive && !(await snapshot()).panel);
    await ready();
    check("Eligibility stays latched when Gobble ends with less than five seconds left", (await call("integrationState")).active);
    await call("deadlineIn", 2000);
    check("An already launched quiz remains active in the final five seconds", (await call("integrationState")).active);
    await call("finishRound");
    await until(() => evaluate("!!document.querySelector('.target-quiz-recap')"), "deadline recap");
    check("A played session with no answers still gets a recap", await evaluate("document.querySelector('.target-quiz-recap__score').textContent === '+0'"));
    await call("reset", { layout: profile.layout, integration: true });
  }
}
async function verifyLights() {
  for (const profile of [
    { layout: "desktop", width: 1280, height: 900 },
    { layout: "mobile", width: 390, height: 844 },
  ]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width: profile.width, height: profile.height,
      deviceScaleFactor: 1, mobile: profile.layout === "mobile" });
    await cdp("Page.navigate", { url: `${origin}/dev/target-quiz/?strict=1` });
    await until(() => evaluate("!!window.targetQuizFixture"), "fixture", 400);
    await ready();
    await until(() => call("lights"), "initial StrictMode intro");
    check("The initial StrictMode mount starts its intro", (await snapshot()).strictPreview);
    await call("reset", { layout: profile.layout, mode: "words", long: false, dark: false, latency: 12 });
    await ready();
    let light = await until(async () => {
      const next = await call("lights");
      return next && next.progress >= 0.08 && next;
    }, "intro canvas");
    let state = await capture(`lights-${profile.layout}-start`);
    light = await call("lights", { checkPixels: true });
    check("Four light cones are configured", Number(light.spots) === 4, light);
    check("Lighting covers the viewport", light.width >= profile.width - 1 && light.height >= profile.height - 1, light);
    check("Lighting cannot intercept answer clicks", light.pointerEvents === "none", light);
    check("Question and answers are not painted over", light.protectedAlpha.every(alpha => alpha === 0), light);
    await until(async () => {
      const next = await call("lights");
      return next && next.progress >= 0.45;
    }, "lighting midpoint");
    state = await capture(`lights-${profile.layout}-middle`);
    light = await call("lights", { checkPixels: true });
    check("Question and answers remain protected during the sweep", light.protectedAlpha.every(alpha => alpha === 0), light);
    await until(async () => {
      const next = await call("lights");
      return next && next.progress >= 0.83;
    }, "lighting tail");
    await capture(`lights-${profile.layout}-tail`);
    await until(async () => !(await call("lights")), "lighting cleanup", 160);
    state = await capture(`lights-${profile.layout}-end`);
    check("Completed lighting is hidden", state.lighting?.hidden === true && state.lighting?.state === "finished", state.lighting);
    check("Four choices remain usable after the intro", state.choices.length === 4 && state.choices.every(choice => !choice.disabled), state.choices);
    await call("answer", true);
    await ready();
    check("The next question does not replay the intro", !(await call("lights")));
    await capture(`lights-${profile.layout}-next-question`);

    await call("reset", { layout: profile.layout, mode: "words", long: false });
    await until(() => call("lights"), "new session intro");
    await call("active", false);
    await delay(100);
    check("Leaving the mini-game removes the lighting canvas", !(await snapshot()).lighting);

    await call("reset", { layout: profile.layout, mode: "words", long: false, latency: 12 });
    await ready();
    await until(async () => {
      const next = await call("lights");
      return next && next.progress >= 0.05;
    }, "early answer intro");
    await call("watchLights");
    const definition = (await snapshot()).definition;
    await call("answer", true);
    await until(async () => (await snapshot()).definition !== definition, "early answer next question");
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    state = await capture(`lights-${profile.layout}-early-answer`);
    light = await call("lights", { checkPixels: true });
    check("A fast answer changes question while the same intro continues", !!light && light.progress > 0.2, light);
    check("The taller next question remains protected during the intro", light?.protectedAlpha.every(alpha => alpha === 0), light);
    await until(async () => !(await call("lights")), "early answer intro cleanup", 160);
    state = await snapshot();
    const running = state.lightingEvents.filter(event => event.state === "running");
    check("A fast answer never replaces the lighting canvas", new Set(running.map(event => event.canvas)).size === 1, running);
    check("A fast answer never resets intro progress", running.every((event, index) => !index || event.progress >= running[index - 1].progress), running);
    check("The fast-answer intro still completes", state.lighting?.hidden && state.lighting?.state === "finished", state.lighting);
  }
}
async function measureLightFrames() {
  for (const profile of [
    { layout: "desktop", width: 1280, height: 900 },
    { layout: "mobile", width: 390, height: 844 },
  ]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width: profile.width, height: profile.height,
      deviceScaleFactor: 1, mobile: profile.layout === "mobile" });
    await cdp("Page.navigate", { url: `${origin}/dev/target-quiz/?strict=1` });
    await until(() => evaluate("!!window.targetQuizFixture"), "fixture", 400);
    const intervals = await evaluate(`new Promise(resolve => {
      const samples = [];
      const started = performance.now();
      let previous = null;
      let previousState = null;
      const tick = now => {
        const state = document.querySelector('canvas.target-quiz-lighting')?.dataset.state || 'absent';
        if (previous !== null && state === previousState) samples.push({ state, elapsed: now - previous });
        previous = now; previousState = state;
        if (now - started >= 3200) resolve(samples); else requestAnimationFrame(tick);
      };
      window.targetQuizFixture.reset({ layout: ${JSON.stringify(profile.layout)}, latency: 12 });
      requestAnimationFrame(tick);
    })`);
    const summary = state => {
      const samples = intervals.filter(sample => sample.state === state).map(sample => sample.elapsed).sort((a, b) => a - b);
      return { frames: samples.length, medianMs: samples[Math.floor(samples.length / 2)],
        p95Ms: samples[Math.floor(samples.length * 0.95)], worstMs: samples.at(-1) };
    };
    const result = { profile: profile.layout, running: summary("running"), finished: summary("finished") };
    cases.push(result);
    console.log(JSON.stringify(result));
  }
}
async function clickAudioRestart() {
  const point = await evaluate(`(() => {
    const rect = document.querySelector('[data-audio-restart]').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
}
function audioSourceStopped(source, audio) {
  const context = audio.contexts.find(item => item.id === source.context);
  return source.ended || source.stopCalls.some(stop => Math.max(stop.when, stop.at) <= context.time + 0.01);
}
function quizMusicSources(audio) {
  return audio.sources.filter(source => ["target-quiz:jingle", "target-quiz:intro", "target-quiz:loop"].includes(source.key));
}
async function verifyVerdictFiles() {
  const expected = [
    { name: "correct", duration: 1.558821, bytes: 275314 },
    { name: "wrong", duration: 1.312494, bytes: 231862 },
  ];
  const fingerprint = async name => {
    const data = await fs.readFile(path.join(root, `public/sound/presenters/foukro/${name}-short.wav`));
    return { bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") };
  };
  const before = await Promise.all(expected.map(item => fingerprint(item.name)));
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: `${origin}/dev/target-quiz/?strict=1` });
  await until(() => evaluate("!!window.targetQuizFixture"), "fixture", 400);
  await ready();
  await clickAudioRestart();
  await until(async () => quizMusicSources(await call("audio")).length >= 3, "native soundtrack", 400);
  await ready();
  for (const [index, item] of expected.entries()) {
    await call("answer", item.name === "correct");
    await ready();
    const audio = await call("audio");
    const sources = audio.sources.filter(source => source.key === `target-quiz:${item.name}`);
    check(`${item.name} plays the edited buffer once at its original pitch`, sources.length === 1 &&
      Math.abs(sources[0].duration - item.duration) < 0.0001 && sources[0].playbackRate === 1, sources);
    check(`${item.name} leaves the music uninterrupted`, quizMusicSources(audio).length === 3 &&
      quizMusicSources(audio).every(source => source.stopCalls.length === 0), audio.sources);
    const after = await fingerprint(item.name);
    check(`${item.name} user asset remains intact`, after.bytes === item.bytes &&
      after.sha256 === before[index].sha256, { before: before[index], after });
    cases.push({ label: `${item.name}-edited-file`, source: sources[0], file: after });
  }
  await call("active", false);
}
async function verifyAudio() {
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: `${origin}/dev/target-quiz/?strict=1` });
  await until(() => evaluate("!!window.targetQuizFixture"), "fixture", 400);
  await ready();
  await clickAudioRestart();
  let audio = await until(async () => {
    const state = await call("audio");
    return state.sources.length >= 3 && state;
  }, "native soundtrack scheduling", 400);
  check("A native click unlocks one running AudioContext", audio.contexts.length === 1 && audio.contexts[0].state === "running", audio.contexts);
  check("StrictMode schedules one soundtrack only", audio.sources.length === 3, audio.sources);
  const [jingle, intro, loop] = audio.sources;
  check("Jingle, original intro and original loop durations are decoded", Math.abs(jingle.duration - 3.0659) < 0.01 && Math.abs(intro.duration - 1) < 0.001 && Math.abs(loop.duration - 8.00027) < 0.001, audio.sources);
  check("Jingle starts with the first lighting frame", jingle.lighting?.state === "running" && Number(jingle.lighting.progress) <= 0.1 && !jingle.lighting.hidden, jingle);
  check("Intro begins at the exact jingle boundary", Math.abs(intro.startAt - jingle.startAt - jingle.duration) < 1e-7, audio.sources);
  check("Loop begins at the exact intro boundary", Math.abs(loop.startAt - intro.startAt - intro.duration) < 1e-7, audio.sources);
  check("Loop uses native looping over the untouched complete buffer", loop.loop && loop.loopStart === 0 && loop.loopEnd === loop.duration && loop.offset === 0 && loop.playbackRate === 1, loop);
  check("Jingle and intro never loop", !jingle.loop && !intro.loop, audio.sources);
  const jingleGain = audio.gains.find(gain => gain.id === jingle.connections[0]);
  check("Jingle, intro and loop connect directly to the same gain", jingleGain &&
    audio.sources.every(source => source.connections.length === 1 && source.connections[0] === jingleGain.id), audio.sources);
  check("The direct transition adds no gain automation or fade", jingleGain?.events.length === 0 && jingleGain.value === 1, jingleGain);
  cases.push({ label: "audio-scheduled", audio });
  await ready();
  await call("answer", true); await ready();
  audio = await call("audio");
  let correct = audio.sources.filter(source => source.key === "target-quiz:correct");
  check("A good answer triggers the correct buffer exactly once", correct.length === 1, correct);
  check("The shortened correct sound retains its original pitch", correct[0].playbackRate === 1 && !correct[0].loop && correct[0].duration > 0 && correct[0].duration < 7.7, correct[0]);
  await call("answer", false); await ready();
  audio = await call("audio");
  const wrong = audio.sources.filter(source => source.key === "target-quiz:wrong");
  check("A wrong answer triggers the wrong buffer exactly once", wrong.length === 1, wrong);
  check("The shortened wrong sound retains its original pitch", wrong[0].playbackRate === 1 && !wrong[0].loop && wrong[0].duration > 0 && wrong[0].duration < 5.8, wrong[0]);
  check("Question changes and verdict effects never restart the music", quizMusicSources(audio).length === 3, audio.sources);
  check("Verdict effects overlap the uninterrupted soundtrack", quizMusicSources(audio).every(source => source.stopCalls.length === 0), audio.sources);
  cases.push({ label: "audio-verdicts", audio });
  await until(async () => (await call("audio")).contexts[0].time >= loop.startAt + 0.1, "native loop starts", 300);
  audio = await call("audio");
  check("The native loop is still playing after its scheduled start", !audioSourceStopped(audio.sources[2], audio), audio.sources[2]);
  cases.push({ label: "audio-loop", audio });

  await call("volume", 0.4);
  audio = await call("audio");
  check("Preview volume controls the real master gain", Math.abs(audio.gains[0].value - 0.4) < 1e-6, audio.gains[0]);
  await call("volume", 1);
  const beforeMutedVerdict = audio.sources.length;
  await call("answer", true);
  await until(async () => (await call("audio")).sources.length > beforeMutedVerdict, "correct sound before mute");
  await call("mute", true); await delay(80);
  audio = await call("audio");
  check("Mute stops all scheduled and playing sources", audio.sources.every(source => audioSourceStopped(source, audio)), audio.sources);
  const mutedCount = audio.sources.length;
  await call("mute", false);
  await until(async () => (await call("audio")).sources.length > mutedCount, "unmute resumes loop");
  audio = await call("audio");
  check("Unmute resumes only the loop", audio.sources.length === mutedCount + 1 && audio.sources.at(-1).loop, audio.sources);

  const interruptedCount = audio.sources.length;
  await call("audioContext", "suspended"); await delay(50);
  audio = await call("audio");
  check("A context interruption stops all sources", audio.sources.every(source => audioSourceStopped(source, audio)), audio.sources);
  await call("audioContext", "running");
  await until(async () => (await call("audio")).sources.length > interruptedCount, "context resumes loop");
  audio = await call("audio");
  check("Context recovery resumes only the loop", audio.sources.length === interruptedCount + 1 && audio.sources.at(-1).loop, audio.sources);

  await ready();
  const beforeHiddenVerdict = audio.sources.length;
  await call("answer", false);
  await until(async () => (await call("audio")).sources.length > beforeHiddenVerdict, "wrong sound before hiding");
  audio = await call("audio");
  const hiddenCount = audio.sources.length;
  const other = await cdp("Target.createTarget", { url: "about:blank", background: false });
  await cdp("Target.activateTarget", { targetId: other.targetId });
  await until(() => evaluate("document.hidden"), "actual hidden tab");
  audio = await call("audio");
  check("Hiding the tab stops the soundtrack", audio.sources.every(source => audioSourceStopped(source, audio)), audio.sources);
  await cdp("Page.bringToFront");
  await until(() => evaluate("!document.hidden"), "visible tab returns");
  await until(async () => (await call("audio")).sources.length > hiddenCount, "visible tab resumes loop");
  audio = await call("audio");
  check("Returning to the tab resumes only the loop", audio.sources.length === hiddenCount + 1 && audio.sources.at(-1).loop, audio.sources);
  await cdp("Target.closeTarget", { targetId: other.targetId });

  await ready();
  const beforeFinalVerdict = audio.sources.length;
  await call("answer", true);
  await until(async () => (await call("audio")).sources.length > beforeFinalVerdict, "active verdict before timeout");
  await call("deadlineIn", 200);
  await until(async () => (await snapshot()).session.phase === "finished", "round ends");
  await until(async () => (await call("audio")).sources.some(source => source.key === "target-quiz:out-of-time"), "natural timeout sound");
  audio = await call("audio");
  let endings = audio.sources.filter(source => source.key === "target-quiz:out-of-time");
  const ending = endings[0];
  check("A natural deadline plays the original timeout sound exactly once", endings.length === 1 && ending.playbackRate === 1 && !ending.loop && Math.abs(ending.duration - 4.6498) < 0.01, endings);
  check("Timeout stops music and verdict while its final cue plays", audio.sources.filter(source => source.id !== ending.id).every(source => audioSourceStopped(source, audio)) && !audioSourceStopped(ending, audio), audio.sources);
  await call("active", false); await delay(100);
  audio = await call("audio");
  check("Leaving after the deadline lets the timeout cue continue", !audioSourceStopped(audio.sources.find(source => source.id === ending.id), audio), audio.sources);
  await until(async () => (await call("audio")).sources.find(source => source.id === ending.id)?.ended, "timeout finishes naturally", 240);
  audio = await call("audio");
  check("The timeout cue ends naturally without replay", audio.sources.filter(source => source.key === "target-quiz:out-of-time").length === 1, audio.sources);
  cases.push({ label: "audio-natural-timeout", audio });
  const finishedCount = audio.sources.length;
  await clickAudioRestart();
  await until(async () => (await call("audio")).sources.length >= finishedCount + 3, "new session soundtrack");
  audio = await call("audio");
  check("Restart creates exactly one new three-part soundtrack", audio.sources.length === finishedCount + 3, audio.sources);
  await call("finishRound");
  await until(async () => (await call("audio")).sources.filter(source => source.key === "target-quiz:out-of-time").length === 2, "timeout before mute");
  await call("active", false);
  await call("mute", true); await delay(80);
  audio = await call("audio");
  check("Mute stops a timeout retained after the quiz closes", audio.sources.every(source => audioSourceStopped(source, audio)), audio.sources);
  const mutedEndingCount = audio.sources.length;
  await call("mute", false); await delay(80);
  check("Unmuting cannot replay the completed-session cue", (await call("audio")).sources.length === mutedEndingCount);

  await clickAudioRestart();
  await ready();
  await call("finishRound");
  await until(async () => (await call("audio")).sources.filter(source => source.key === "target-quiz:out-of-time").length === 3, "timeout before hiding");
  await call("active", false);
  const hiddenEndingTab = await cdp("Target.createTarget", { url: "about:blank", background: false });
  await cdp("Target.activateTarget", { targetId: hiddenEndingTab.targetId });
  await until(() => evaluate("document.hidden"), "timeout tab hidden");
  audio = await call("audio");
  check("Hiding the page stops a retained timeout cue", audio.sources.every(source => audioSourceStopped(source, audio)), audio.sources);
  const hiddenEndingCount = audio.sources.length;
  await cdp("Page.bringToFront");
  await until(() => evaluate("!document.hidden"), "timeout tab returns");
  await cdp("Target.closeTarget", { targetId: hiddenEndingTab.targetId });
  check("Returning cannot replay the timeout cue", (await call("audio")).sources.length === hiddenEndingCount);

  await clickAudioRestart(); await ready();
  await call("finishRound");
  await until(async () => (await call("audio")).sources.filter(source => source.key === "target-quiz:out-of-time").length === 4, "timeout before reset");
  audio = await call("audio");
  const beforeReset = audio.sources.length;
  await clickAudioRestart();
  await until(async () => (await call("audio")).sources.length >= beforeReset + 3, "reset soundtrack");
  audio = await call("audio");
  check("Reset cancels the old timeout and starts a new soundtrack", audio.sources.length === beforeReset + 3 && audio.sources.slice(0, beforeReset).every(source => audioSourceStopped(source, audio)), audio.sources);
  await call("deadlineIn", 200);
  await call("active", false); await delay(350);
  audio = await call("audio");
  check("Leaving before the deadline produces no ending cue", audio.sources.filter(source => source.key === "target-quiz:out-of-time").length === 4, audio.sources);
  check("Closing early releases every source", audio.sources.every(source => audioSourceStopped(source, audio)), audio.sources);
  check("All sessions reuse the one context", audio.contexts.length === 1, audio.contexts);
  cases.push({ label: "audio-stopped", audio });
}
try {
  let executable;
  for (const candidate of [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean)) {
    try { await fs.access(candidate); executable = candidate; break; } catch {}
  }
  assert.ok(executable, "Chromium executable required");
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  chromeLog = await fs.open(path.join(output, "browser.log"), "w");
  chrome = spawn(executable, ["--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(output, `chrome-${Date.now()}`)}`, "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "about:blank"],
    { windowsHide: true, stdio: ["ignore", chromeLog.fd, chromeLog.fd] });
  const target = await until(async () => {
    try { return (await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json())).find(p => p.type === "page"); }
    catch { return false; }
  }, "Chromium");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  cdp = attach(socket);
  await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");
  await cdp("Network.setBlockedURLs", { urls: ["https://gobble.fr/*", "http://gobble.fr/*"] });
  if (avatarOnly) {
    await verifyAvatarFlow();
  } else if (rewardsOnly) {
    await verifyRewards();
  } else if (integrationOnly) {
    await verifyIntegration();
  } else if (verdictFilesOnly) {
    await verifyVerdictFiles();
  } else if (audioOnly) {
    await verifyAudio();
  } else if (lightFramesOnly) {
    await measureLightFrames();
  } else if (lightsOnly) {
    await verifyLights();
  } else {
  const profiles = (focused ? [] : [
    { layout: "desktop", width: 1280, height: 900 },
    { layout: "small", width: 320, height: 700 },
    { layout: "mobile", width: 390, height: 844 },
  ]).concat({ layout: "square", width: 700, height: 900 });
  for (const profile of profiles) {
    await cdp("Emulation.setDeviceMetricsOverride", { width: profile.width, height: profile.height,
      deviceScaleFactor: 1, mobile: profile.layout === "small" || profile.layout === "mobile" });
    await cdp("Page.navigate", { url: `${origin}/dev/target-quiz/` });
    await until(() => evaluate("!!window.targetQuizFixture"), "fixture", 400);
    await call("reset", { layout: profile.layout, mode: "words", long: true, dark: false });
    let state = await ready();
    await capture(`${profile.layout}-normal`);
    check("Question stays within viewport", state.documentWidth <= state.viewportWidth, state);
    check("Question panel does not scroll sideways", state.panel.scrollWidth <= state.panel.clientWidth + 1, state.panel);
    check("Question and four choices fit without vertical scrolling", state.panel.scrollHeight <= state.panel.clientHeight + 1, state.panel);
    check("Answers do not overflow", state.choices.every(choice => choice.scrollWidth <= choice.width + 1), state.choices);
    if (focused) {
      for (const pose of [1, 3, 2, 6, 5, 4, 7]) {
        await until(async () => (await snapshot()).presenter?.frame === String(pose - 1), `pose ${pose}`);
        state = await capture(`pose-${pose}`);
        check(`Pose ${pose} is captured in the requested order`, state.presenter.frame === String(pose - 1), state.presenter);
      }
    } else {
      await delay(500);
      await capture(`${profile.layout}-talking`);
    }
    await until(async () => (await snapshot()).presenter?.frame === "6", "serious final posture", 180);
    state = await capture(`${profile.layout}-serious`);
    check("Presenter settles after animation", state.presenter.state === "question" && state.presenter.frame === "6", state.presenter);
  }

  await call("reset", { layout: "square", mode: "spellings", long: false, dark: true });
  let state = await ready();
  const firstDefinition = state.definition;
  await capture("spellings-dark");
  await call("watchTransition");
  await call("answer", true);
  await until(async () => (await snapshot()).session.phase === "feedback", "correct reaction");
  state = await capture("correct-fade-out");
  check("Correct answer displays victory pose", state.presenter.state === "victory", state.presenter);
  check("Answers lock for feedback", state.choices.every(choice => choice.disabled), state.choices);
  await call("answer", false);
  check("Extra click during cooldown is ignored", (await snapshot()).server.log.filter(event => event.event === "targetQuiz:answer").length === 1);
  await until(async () => (await snapshot()).definition !== firstDefinition, "next question fades in");
  state = await capture("correct-fade-in");
  check("Prepared question appears while victory remains", state.presenter.state === "victory" && state.definition !== firstDefinition, state);
  await ready();
  state = await snapshot();
  checkTransitionTiming(state);
  check("Good answer updates score", state.session.score === 100 && state.session.correctCount === 1, state.session);
  check("Next question is used without another start request", state.server.log.filter(event => event.event === "targetQuiz:start").length === 1, state.server.log);
  check("A new question restarts the presenter", state.presenter.state === "question" && state.presenter.frame !== "6", state.presenter);
  await call("watchTransition");
  await call("answer", false);
  await until(async () => (await snapshot()).session.phase === "feedback", "wrong reaction");
  state = await capture("wrong-fade-out");
  check("Wrong answer displays defeat pose", state.presenter.state === "defeat", state.presenter);
  await ready();
  state = await snapshot();
  checkTransitionTiming(state);
  check("Wrong answer retains the scoring rule", state.session.score === 25 && state.session.streak === 0 && state.session.wrongCount === 1, state.session);

  if (focused) {
    await call("reset", { layout: "square", mode: "words", long: false, dark: false, latency: 600 });
    await ready();
    await call("watchTransition");
    await call("answer", true);
    await until(async () => (await snapshot()).session.phase === "feedback", "delayed answer feedback");
    await capture("latency-600-victory");
    await ready();
    state = await snapshot();
    checkTransitionTiming(state);
    check("Delayed acknowledgment still advances the question", state.session.correctCount === 1, state.session);
  }

  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await call("reset", { layout: "square", mode: "spellings", long: true, dark: false, latency: 12 });
  await ready();
  state = await capture("reduced-motion");
  check("Reduced motion uses the still serious pose", state.presenter.frame === "6", state.presenter);
  await call("answer", true); await ready();
  check("Reduced motion still advances questions", (await snapshot()).session.correctCount === 1);
  }
  check("No browser exceptions", errors.length === 0, errors);
  console.log(JSON.stringify({ checks, captures: cases.length, output, errors }));
} catch (error) {
  process.exitCode = 1;
  console.error(error.stack);
} finally {
  await fs.writeFile(path.join(output, avatarOnly ? "avatar-flow-verification.json" : rewardsOnly ? "rewards-verification.json" : integrationOnly ? "integration-verification.json" : verdictFilesOnly ? "verdict-files-verification.json" : audioOnly ? "audio-verification.json" : lightFramesOnly ? "lights-frames.json" : lightsOnly ? "lights-verification.json" : "verification.json"), JSON.stringify({ checks, cases, errors }, null, 2));
  if (cdp) await cdp("Browser.close").catch(() => {});
  socket?.close(); if (chrome?.exitCode === null) chrome.kill();
  await chromeLog?.close();
}
