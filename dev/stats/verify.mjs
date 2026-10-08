import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, ".tmp/stats-verification");
const origin = process.env.STATS_ORIGIN || "http://127.0.0.1:8774";
const menusOnly = process.argv.includes("--menus-only");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
await fs.mkdir(output, { recursive: true });
const errors = [], cases = [];
let checks = 0, chrome, socket, cdp;
async function until(read, label) {
  for (let index = 0; index < 160; index++) {
    try { const value = await read(); if (value) return value; } catch {}
    await delay(75);
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
    const item = pending.get(message.id); if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer);
    if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result);
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const call = (method, ...args) => evaluate(`window.statsFixture[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
const snapshot = () => call("snapshot");
function check(label, condition, detail) { checks++; assert.ok(condition, `${label}: ${JSON.stringify(detail)}`); }
const settle = () => delay(120);
async function reset(options = {}) { await call("reset", options); await settle(); }
async function openMenu(label) {
  await evaluate(`(() => {
    const el = [...document.querySelectorAll('.stats-panel button[role="combobox"]')].find(el => el.getAttribute("aria-label") === ${JSON.stringify(label)});
    if (!el) throw new Error("Missing combobox: " + ${JSON.stringify(label)});
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    el.focus();
    if (el.getAttribute("aria-expanded") !== "true") el.click();
  })()`);
  await settle();
}
async function select(label, value) {
  await openMenu(label);
  await evaluate(`(() => {
    const el = [...document.querySelectorAll('.stats-panel button[role="combobox"]')].find(el => el.getAttribute("aria-label") === ${JSON.stringify(label)});
    const menu = document.getElementById(el.getAttribute("aria-controls"));
    const option = [...(menu?.querySelectorAll('[role="option"]') || [])].find(option => option.dataset.value === ${JSON.stringify(value)});
    if (!option) throw new Error("Missing option: " + ${JSON.stringify(value)});
    option.scrollIntoView({ block: "nearest", inline: "nearest" });
    option.click();
  })()`);
  await settle();
}
async function key(name) {
  const virtualKey = { ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27 }[name];
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: name, code: name, windowsVirtualKeyCode: virtualKey });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: name, windowsVirtualKeyCode: virtualKey });
  await settle();
}
async function clickElement(selector) {
  const point = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("Missing click target: " + ${JSON.stringify(selector)});
    const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
  await settle();
}
async function click(text) {
  await evaluate(`(() => { const el = [...document.querySelectorAll("button")].find(el => el.textContent.trim() === ${JSON.stringify(text)} || el.getAttribute("aria-label") === ${JSON.stringify(text)}); if (!el) throw new Error("Missing button: " + ${JSON.stringify(text)}); el.scrollIntoView({ block: "nearest", inline: "nearest" }); el.click(); })()`);
  await settle();
}
async function showBoard() {
  await evaluate(`document.querySelector("#stats-board-title")?.scrollIntoView({ block: "start", inline: "nearest" })`);
  await settle();
}
async function swipe(dx, dy = 0, selector = "#stats-board-title", synthetic = false) {
  const point = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("Missing swipe target: " + ${JSON.stringify(selector)});
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (synthetic) {
    return evaluate(`(() => {
      const target = document.querySelector(${JSON.stringify(selector)});
      const touch = (x, y) => new Touch({ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y });
      const send = (type, x, y, ended = false) => target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true,
        touches: ended ? [] : [touch(x, y)], targetTouches: ended ? [] : [touch(x, y)], changedTouches: [touch(x, y)] }));
      const accepted = [send("touchstart", ${point.x}, ${point.y}), send("touchmove", ${point.x + dx}, ${point.y + dy}), send("touchend", ${point.x + dx}, ${point.y + dy}, true)];
      return accepted.every(Boolean);
    })()`);
  }
  await cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: point.x, y: point.y }] });
  for (let step = 1; step <= 4; step++) {
    await delay(35);
    await cdp("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x + dx * step / 4, y: point.y + dy * step / 4 }] });
  }
  await cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await settle();
}
async function capture(label) {
  const state = await snapshot(); cases.push({ label, ...state });
  const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(output, `${label}.png`), Buffer.from(screenshot.data, "base64"));
  return state;
}
async function assertLayout(device) {
  const state = await snapshot();
  check("Panel stays in viewport", state.panel.x >= 0 && state.panel.right <= device.width + 1 && state.panel.y >= 0 && state.panel.bottom <= device.height + 1, state.panel);
  check("Only current leaderboard is mounted", state.mountedLists === 1, state);
  check("Leaderboard has usable vertical space", state.scroll.height >= 80, state.scroll);
  check("No horizontal overflow", state.scrollWidth <= state.scrollClientWidth + 1 && state.documentWidth <= device.width + 1, state);
  check("Nicknames wrap without clipping or truncation", state.rows.every(row => !row.clipped && !row.nickTruncated && row.nick?.right <= state.scroll.right + 1), state.rows);
  check("Scores occupy a separate right-hand column", state.rows.every(row => row.valueIsSibling && row.value?.x >= row.body?.right - 1 && row.value.right <= row.rect.right + 1), state.rows);
  check("Scores are right-aligned", state.rows.every(row => row.valueTextAlign === "right" && Math.abs(row.number?.right - row.value?.right) <= 1), state.rows);
  check("Scores share the nickname first line", state.rows.every(row => row.nickFirstLine && row.valueFirstLine && row.nickFirstLine.y < row.valueFirstLine.bottom && row.valueFirstLine.y < row.nickFirstLine.bottom), state.rows);
  check("Scores finish on a common vertical edge", state.rows.length > 0 && Math.max(...state.rows.map(row => row.number.right)) - Math.min(...state.rows.map(row => row.number.right)) <= 1, state.rows);
  check("Binder tab labels fit their tabs", state.tabs.every(tab => tab.label && tab.label.x >= tab.rect.x - 1 && tab.label.right <= tab.rect.right + 1), state.tabs);
  check("Period selector precedes category tabs", state.periods && state.categories && state.periods.bottom <= state.categories.y + 1, { periods: state.periods, categories: state.categories });
  check("Ranking menus remain visible within the sheet", state.selects.every(select => select.visible && select.rect.width > 0 && select.rect.height > 0 && select.rect.x >= state.scroll.x - 1 && select.rect.right <= state.scroll.right + 1 && select.options.some(option => option.key === select.value)), state.selects);
  check("Tab titles have varied slight angles", state.tabs.every(tab => tab.labelTransform !== "none") && new Set(state.tabs.map(tab => tab.labelTransform)).size > 1, state.tabs);
  check("Typewriter font is loaded", state.typewriterLoaded, state.chromeFonts);
  check("Titles, periods and categories use the typewriter font", state.chromeFonts.length >= 6 && state.chromeFonts.every(element => element.fontFamily.includes("GobbleRegisterTypewriter")), state.chromeFonts);
  check("No cursive font remains in the binder", state.cursiveElements.length === 0, state.cursiveElements);
  check("Statistical names and figures share the typewriter font", state.rows.every(row => row.nickFont?.includes("GobbleRegisterTypewriter") && row.valueFont?.includes("GobbleRegisterTypewriter")), state.rows);
  check("Typewriter irregularities affect only a small share of letters", state.typedEffects.faded > 0 && state.typedEffects.doubled > 0 && (state.typedEffects.faded + state.typedEffects.doubled) / state.typedEffects.letters < 0.15, state.typedEffects);
  check("Binder has no active animations", state.activeAnimations.length === 0, state.activeAnimations);
}

async function assertOpenMenu(label, device) {
  const state = await snapshot();
  const picker = state.selects.find(item => item.label === label);
  const menu = state.menus.find(item => item.id === picker?.controls);
  check("Combobox opens one associated listbox", picker?.expanded && state.menus.length === 1 && !!menu, { picker, menus: state.menus });
  check("Menu is portaled outside the scrolling sheet", menu.portal, menu);
  check("Menu stays inside the viewport", menu.rect.x >= 0 && menu.rect.y >= 0 && menu.rect.right <= device.width + 1 && menu.rect.bottom <= device.height + 1, menu.rect);
  check("Menu contains the fixture navigation choices", JSON.stringify(menu.options.map(option => option.key)) === JSON.stringify(picker.options.map(option => option.key)), { picker, menu });
  check("Selected option and button caption match", menu.options.some(option => option.key === picker.value && option.selected && picker.caption.includes(option.text)), { picker, menu });
  check("Menu has a styled paper background", menu.backgroundImage !== "none" || !["transparent", "rgba(0, 0, 0, 0)"].includes(menu.backgroundColor), menu);
  check("Menu and every option use the typewriter font", menu.fontFamily.includes("GobbleRegisterTypewriter") && menu.options.every(option => option.fontFamily.includes("GobbleRegisterTypewriter")), menu);
  return { state, picker, menu };
}

async function verifyMenus(device) {
  await reset({ category: "rounds", boardKey: "bestSpecial3Score" });
  await openMenu("Classement");
  let { picker, menu } = await assertOpenMenu("Classement", device);
  check("Seven round rankings are available", menu.options.length === 7, menu.options);
  await capture(`${device.name}-menu-rankings`);
  if (device.name !== "desktop") {
    const gestureAllowed = await swipe(-95, 0, '[role="listbox"] [role="option"]', true);
    await settle();
    const gestureState = await snapshot();
    check("Horizontal touch gesture on a menu option preserves the ranking", gestureAllowed && gestureState.boardKey === picker.value && gestureState.menus.length === 1, gestureState);
  }
  await key("ArrowDown");
  let state = await snapshot();
  check("Arrow down moves to next option without changing board", state.menus[0]?.options[1]?.active && state.boardKey === picker.value, state);
  await key("ArrowUp");
  state = await snapshot();
  check("Arrow up returns to the previous option", state.menus[0]?.options[0]?.active && state.boardKey === picker.value, state);
  await key("ArrowDown");
  await key("Enter");
  state = await snapshot();
  check("Enter commits the ranking and closes its menu", state.boardKey === picker.options[1].key && state.menus.length === 0 && !state.selects.find(item => item.label === "Classement")?.expanded, state);
  check("Ranking selection keeps statistics open", !!state.panel && state.closes === 0, state);
  await openMenu("Classement");
  await key("ArrowDown");
  await key("Escape");
  state = await snapshot();
  check("Escape closes only the menu and preserves selection", state.menus.length === 0 && state.boardKey === picker.options[1].key && !!state.panel && state.closes === 0, state);
  check("Escape returns focus to the combobox", state.selects.find(item => item.label === "Classement")?.focused, state.selects);
  await openMenu("Classement");
  await clickElement(".stats-binder-name strong");
  state = await snapshot();
  check("Click outside dismisses the menu without closing statistics", state.menus.length === 0 && !!state.panel && state.closes === 0 && state.boardKey === picker.options[1].key, state);

  await select("Classement", "top3");
  state = await snapshot();
  check("Ranking menu changes to Top 3", state.boardKey === "top3" && state.selects.some(item => item.label === "Type de manche"), state);
  await openMenu("Type de manche");
  ({ picker, menu } = await assertOpenMenu("Type de manche", device));
  check("All eleven round types are available", menu.options.length === 11, menu.options);
  await capture(`${device.name}-menu-round-types`);
  await key("ArrowDown");
  await key("Enter");
  state = await snapshot();
  check("Round-type keyboard selection changes the dataset", state.selects.find(item => item.label === "Type de manche")?.value === picker.options[1].key && state.text.includes("9 top 3 / 16 manches") && state.menus.length === 0, state);
  await openMenu("Type de manche");
  ({ menu } = await assertOpenMenu("Type de manche", device));
  if (device.name === "small-mobile") {
    check("Eleven-option menu scrolls on a small screen", menu.scrollHeight > menu.clientHeight + 1 && ["auto", "scroll"].includes(menu.overflowY), menu);
    await cdp("Input.dispatchMouseEvent", { type: "mouseWheel", x: menu.rect.x + menu.rect.width / 2, y: menu.rect.y + menu.rect.height / 2,
      deltaX: 0, deltaY: menu.scrollHeight });
    await settle();
    ({ menu } = await assertOpenMenu("Type de manche", device));
    check("Scrolling reaches the last round type", menu.scrollTop > 0 && menu.options.at(-1).rect.bottom <= menu.rect.bottom + 1 && menu.options.at(-1).rect.y >= menu.rect.y - 1, menu);
    await capture(`${device.name}-menu-round-types-scrolled`);
  }
  await select("Type de manche", picker.options.at(-1).key);
  state = await snapshot();
  check("Last round type is selectable and changes dataset", state.selects.find(item => item.label === "Type de manche")?.value === picker.options.at(-1).key && state.text.includes("18 top 3 / 25 manches") && state.menus.length === 0, state);
  await openMenu("Type de manche");
  await key("Escape");
  state = await snapshot();
  check("Type-menu Escape leaves the statistics and chosen type intact", state.menus.length === 0 && !!state.panel && state.closes === 0 && state.selects.find(item => item.label === "Type de manche")?.value === picker.options.at(-1).key, state);
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
  chrome = spawn(executable, ["--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(output, `chrome-${Date.now()}`)}`, "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "about:blank"],
    { windowsHide: true, stdio: "ignore" });
  const target = await until(async () => (await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json())).find(p => p.type === "page"), "Chromium");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  cdp = attach(socket); await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");
  await cdp("Network.setBlockedURLs", { urls: ["https://gobble.fr/*", "http://gobble.fr/*", "*/api/*"] });
  for (const device of [{ name: "desktop", width: 1280, height: 900 }, { name: "mobile", width: 390, height: 844 }, { name: "small-mobile", width: 320, height: 568 }]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width: device.width, height: device.height, deviceScaleFactor: 1, mobile: device.name !== "desktop" });
    await cdp("Emulation.setTouchEmulationEnabled", { enabled: device.name !== "desktop" });
    await cdp("Page.navigate", { url: `${origin}/dev/stats/` });
    await until(() => evaluate("!!window.statsFixture"), "fixture");
    await reset();
    await evaluate("document.fonts.ready.then(() => true)");
    await verifyMenus(device);
    if (menusOnly) continue;
    await reset();
    let state = await capture(`${device.name}-home`);
    check("Weekly vocabulary is landing page", state.tab === "weekly" && state.boardKey === "weeklyVocab" && state.title === "Vocabulaire de la semaine", state);
    await assertLayout(device);
    check("Long nickname retained", state.text.includes("AlexandreLeCollectionneurDeMotsTrèsLongs"), state.text);
    await click("Voir le profil de AlexandreLeCollectionneurDeMotsTrèsLongs");
    check("Profile action retained", (await snapshot()).profile?.userId === 9100, await snapshot());

    await click("Manches");
    check("Round category opens 3-word board", (await snapshot()).boardKey === "bestSpecial3Score", await snapshot());
    const titleBelowControls = await evaluate(`(() => { const select = document.querySelector('[role="combobox"][aria-label="Classement"]'); return document.querySelector('#stats-board-title').getBoundingClientRect().top >= select.getBoundingClientRect().bottom; })()`);
    check("Board title follows period and category controls", titleBelowControls);
    check("All round rankings are available in the menu", (await snapshot()).selects.find(select => select.label === "Classement")?.options.length === 7, await snapshot());
    await capture(`${device.name}-round-choices`);
    await select("Classement", "bestTimeTargetLong");
    await showBoard();
    state = await capture(`${device.name}-target`);
    check("Target record displays readable time", state.text.includes("2.35s"), state.text);
    await click("Voir la définition de ANTICONSTITUTIONNELLEMENT");
    check("Word definition action retained", (await snapshot()).definition === "ANTICONSTITUTIONNELLEMENT", await snapshot());
    await assertLayout(device);
    await select("Classement", "top3");
    const options = (await snapshot()).selects.find(select => select.label === "Type de manche")?.options.map(option => option.key) || [];
    check("All 11 Top3 round types retained", options.length === 11, options);
    await evaluate(`document.querySelector('[role="combobox"][aria-label="Type de manche"]').scrollIntoView({ block: "start", inline: "nearest" })`);
    await settle();
    await capture(`${device.name}-round-type-choices`);
    for (let index = 0; index < options.length; index++) {
      await select("Type de manche", options[index]);
      state = await snapshot();
      check("Top3 round type changes dataset", state.text.includes(`${8 + index} top 3 / ${15 + index} manches`), state.text);
    }
    await assertLayout(device);
    await showBoard();
    await capture(`${device.name}-top3`);

    await click("Mots");
    check("Word category opens longest word", (await snapshot()).boardKey === "longestWord", await snapshot());
    await select("Classement", "mostGobbles");
    await click("Depuis toujours");
    state = await snapshot();
    check("Period retains related Gobble category", state.tab === "season" && state.boardKey === "gobbles", state);
    await select("Classement", "doubleGobbles");
    check("Lifetime double gobbles available", (await snapshot()).text.includes("28"), await snapshot());

    await click("Présentateurs");
    check("Lifetime QPUG available", (await snapshot()).text.includes("142") && (await snapshot()).boardKey === "qpugAnswers", await snapshot());
    await select("Classement", "targetQuizPoints");
    await showBoard();
    state = await capture(`${device.name}-signed-points`);
    check("Positive and negative quiz points retained", state.text.includes("+4") && state.text.includes("-175"), state.text);
    await assertLayout(device);
    await click("Cette semaine");
    check("Quiz selection persists across periods", (await snapshot()).boardKey === "targetQuizPoints" && (await snapshot()).tab === "weekly", await snapshot());
    await select("Classement", "presenterHits");
    await showBoard();
    state = await capture(`${device.name}-hits`);
    check("All six presenters ordered by hits", state.rows.length === 6 && state.rows[0].text.includes("Jean-Bière FouKro"), state.rows);
    check("Partial tracking date explained", state.text.includes("Suivi depuis le"), state.text);
    await assertLayout(device);

    if (device.name !== "desktop") {
      await reset({ category: "rounds", boardKey: "bestSpecial3Score" });
      await swipe(-95);
      state = await snapshot();
      check("Swipe left opens the next ranking", state.boardKey === "bestTimeTargetLong" && state.tab === "weekly", state);
      await swipe(95);
      check("Swipe right returns to the previous ranking", (await snapshot()).boardKey === "bestSpecial3Score", await snapshot());
      await swipe(95);
      state = await snapshot();
      check("Swipe crosses to the previous category without changing period", state.category === "vocabulary" && state.boardKey === "weeklyVocab" && state.tab === "weekly", state);
      await swipe(-95);
      check("Swipe crosses to the next category", (await snapshot()).category === "rounds" && (await snapshot()).boardKey === "bestSpecial3Score", await snapshot());
      await swipe(5, -100);
      check("Vertical scroll preserves the current ranking", (await snapshot()).boardKey === "bestSpecial3Score", await snapshot());
      const selectAllowed = await swipe(-95, 0, '[role="combobox"][aria-label="Classement"]', true);
      await settle();
      check("Gesture on a select is not intercepted", selectAllowed && (await snapshot()).boardKey === "bestSpecial3Score", await snapshot());
      const profileAllowed = await swipe(-95, 0, '.stats-nick', true);
      await settle();
      check("Gesture on profile action is not intercepted", profileAllowed && (await snapshot()).boardKey === "bestSpecial3Score", await snapshot());
      await select("Classement", "bestTimeTargetLong");
      const definitionAllowed = await swipe(-95, 0, 'button[aria-label="Voir la définition de ANTICONSTITUTIONNELLEMENT"]', true);
      await settle();
      check("Gesture on definition action is not intercepted", definitionAllowed && (await snapshot()).boardKey === "bestTimeTargetLong", await snapshot());
      await reset({ tab: "season", category: "words", boardKey: "doubleGobbles" });
      await swipe(-95);
      state = await snapshot();
      check("Lifetime swipe stays in its period across category boundary", state.tab === "season" && state.category === "presenters" && state.boardKey === "qpugAnswers", state);
      await swipe(95);
      check("Lifetime swipe returns to the previous category's last board", (await snapshot()).boardKey === "doubleGobbles" && (await snapshot()).category === "words", await snapshot());
      await reset({ category: "presenters", boardKey: "targetQuizPoints" });
      await swipe(-95);
      check("Swipe clamps at the last ranking", (await snapshot()).boardKey === "targetQuizPoints" && (await snapshot()).tab === "weekly", await snapshot());
      await reset();
      await swipe(95);
      check("Swipe clamps at the first ranking", (await snapshot()).boardKey === "weeklyVocab" && (await snapshot()).tab === "weekly", await snapshot());
    }

    for (const [scenario, expected] of [["empty", "Pas encore"], ["loading", "Chargement…"], ["error", "Réessayer"], ["old", "Pas encore"]]) {
      await reset({ scenario, category: "presenters", boardKey: "presenterHits" });
      check(`Handles ${scenario}`, (await snapshot()).text.includes(expected), await snapshot());
    }
    await reset();
    await click("Depuis toujours");
    await select("Classement", "vocab_personal");
    check("Personal vocabulary progression retained", (await snapshot()).text.includes("12 981"), await snapshot());
    await click("Fermer");
    check("Close dismisses statistics", (await snapshot()).closes === 1 && !(await snapshot()).panel, await snapshot());

    await call("recap"); await settle();
    const recap = await evaluate(`(() => {
      const panel = document.querySelector('[role="dialog"]');
      const section = document.querySelector('section[aria-label="Tête à claques"]');
      section.scrollIntoView({ block: 'end' });
      return { text: section.innerText, rows: section.querySelectorAll('li').length,
        overflow: panel.scrollWidth > panel.clientWidth + 1,
        bottom: panel.getBoundingClientRect().bottom,
        canContinue: !![...panel.querySelectorAll('button')].find(el => el.textContent.trim() === 'Suivant') };
    })()`);
    check("Weekly recap contains all presenters", recap.rows === 6 && recap.text.includes("Jean-Bière FouKro"), recap);
    check("Recap fits and remains navigable", !recap.overflow && recap.bottom <= device.height + 1 && recap.canContinue, recap);
    await capture(`${device.name}-recap`);
    await click("Suivant"); await click("Fermer");
  }
  check("No uncaught browser exceptions", errors.length === 0, errors);
  console.log(JSON.stringify({ mode: menusOnly ? "menus-only" : "full", checks, screenshots: cases.length, errors }));
} catch (error) {
  process.exitCode = 1; console.error(error.stack);
} finally {
  await fs.writeFile(path.join(output, menusOnly ? "verification-menus.json" : "verification.json"), JSON.stringify({ checks, cases, errors }, null, 2));
  if (cdp) await cdp("Browser.close").catch(() => {});
  socket?.close(); if (chrome?.exitCode === null) chrome.kill();
}
