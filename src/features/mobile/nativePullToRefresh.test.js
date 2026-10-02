import test from "node:test";
import assert from "node:assert/strict";
import { canNativePullToRefresh, isPullToRefreshSurfaceAtTop } from "./nativePullToRefreshPolicy.js";
import { createNativePullToRefresh } from "./createNativePullToRefresh.js";

function homeState() {
  return { navigation: { view: "home" }, boot: { ready: true, overlayVisible: false },
    session: { isLoggedIn: false }, game: { phase: "lobby" } };
}

test("native refresh is restricted to a ready idle home, outside active games and navigation", () => {
  assert.equal(canNativePullToRefresh(homeState()), true);
  for (const view of ["live", "training", "daily", "daily_play", "daily_results", "duel", "vault", "chalkboard"]) {
    assert.equal(canNativePullToRefresh({ ...homeState(), navigation: { view } }), false, view);
  }
  for (const patch of [
    { game: { phase: "playing" } }, { session: { isLoggedIn: true } },
    { session: { isConnecting: true } }, { session: { resumePending: true } },
    { boot: { ready: false, overlayVisible: false } }, { boot: { ready: true, overlayVisible: true } },
  ]) assert.equal(canNativePullToRefresh({ ...homeState(), ...patch }), false);
  assert.equal(canNativePullToRefresh(homeState(), undefined, true), false);
});

test("menus, feature dialogs and locally registered dialogs prevent refresh", () => {
  for (const [name, state] of [
    ["overlays", { settingsOpen: true }], ["overlays", { playerProfileModal: { open: true } }],
    ["overlays", { authModalMode: "login" }], ["overlays", { trainingConfirm: {} }],
    ["chat", { homeChatOpen: true }], ["chat", { userMenu: { open: true } }],
    ["preferences", { themeMenuOpen: true }], ["admin", { devMenuOpen: true }],
    ["daily", { launchDialog: {} }], ["duel", { popup: { mode: "welcome" } }], ["stats", { open: true }],
  ]) assert.equal(canNativePullToRefresh(homeState(), feature => feature === name ? state : {}), false, name);
  assert.equal(canNativePullToRefresh(homeState(), () => ({ settingsOpen: false, playerProfileModal: { open: false } })), true);
});

function element({ parent = null, home = false, field = false, scrollTop = 0 } = {}) {
  return { parentElement: parent, home, field, scrollTop,
    closest(selector) {
      for (let node = this; node; node = node.parentElement) {
        if (selector === ".home-lobby-screen" ? node.home : node.field) return node;
      }
      return null;
    },
  };
}

function fixture() {
  const window = new EventTarget();
  Object.assign(window, { scrollY: 0, visualViewport: { scale: 1 }, getComputedStyle: () => ({ visibility: "visible" }) });
  const document = new EventTarget();
  document.activeElement = null;
  document.querySelectorAll = () => [];
  const root = element({ home: true }), target = element({ parent: root });
  let allowed = true, reloads = 0, hides = 0;
  const feedback = [], timers = new Map();
  const controller = createNativePullToRefresh({
    document, window, canRefresh: () => allowed, reload: () => { reloads += 1; },
    feedback: { show: (...args) => feedback.push(args), hide: () => { hides += 1; } },
    setTimeout: callback => { const id = Symbol(); timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
  });
  function touch(type, x = 0, y = 0, extra = {}) {
    const event = new Event(type, { cancelable: true });
    const touches = type === "touchend" || type === "touchcancel" ? [] : [{ identifier: 1, clientX: x, clientY: y }];
    Object.defineProperties(event, Object.fromEntries(Object.entries({ target, touches, ...extra }).map(([key, value]) => [key, { value }])));
    document.dispatchEvent(event);
    return event;
  }
  return { document, window, root, target, controller, touch, feedback, timers,
    get reloads() { return reloads; }, get hides() { return hides; }, set allowed(value) { allowed = value; } };
}

test("surface requires the home, no editable field or visible dialog, and every scroller at top", () => {
  const f = fixture();
  const eligible = () => isPullToRefreshSurfaceAtTop(f.target, f.document, f.window);
  assert.equal(eligible(), true);
  f.root.scrollTop = 20; assert.equal(eligible(), false); f.root.scrollTop = 0;
  f.window.scrollY = 10; assert.equal(eligible(), false); f.window.scrollY = 0;
  f.window.visualViewport.scale = 2; assert.equal(eligible(), false); f.window.visualViewport.scale = 1;
  f.document.activeElement = element({ field: true }); assert.equal(eligible(), false); f.document.activeElement = null;
  f.target.field = true; assert.equal(eligible(), false); f.target.field = false;
  f.document.querySelectorAll = () => [{ getClientRects: () => [1] }]; assert.equal(eligible(), false);
  f.document.querySelectorAll = () => [{ getClientRects: () => [] }]; assert.equal(eligible(), true);
  f.root.home = false; assert.equal(eligible(), false);
});

test("downward pull reloads once only after release, with feedback and cleanup", async () => {
  const f = fixture(); f.controller.start(); f.controller.start();
  f.touch("touchstart", 100, 100);
  assert.equal(f.touch("touchmove", 103, 106).defaultPrevented, false);
  assert.equal(f.touch("touchmove", 105, 205).defaultPrevented, true);
  assert.equal(f.reloads, 0);
  assert.equal(f.touch("touchend").defaultPrevented, true); await Promise.resolve();
  assert.equal(f.reloads, 1);
  assert.deepEqual(f.feedback.at(-1), [1, true]);
  f.touch("touchstart"); f.touch("touchmove", 0, 150); f.touch("touchend"); await Promise.resolve();
  assert.equal(f.reloads, 1);
  f.controller.stop(); assert.equal(f.timers.size, 0);
  const hides = f.hides;
  f.touch("touchstart"); f.touch("touchmove", 0, 150); f.touch("touchend"); await Promise.resolve();
  assert.equal(f.reloads, 1); assert.equal(f.hides, hides);
});

test("short, reversed, horizontal, multitouch and cancelled gestures never reload", async () => {
  for (const moves of [
    f => f.touch("touchmove", 0, 95),
    f => { f.touch("touchmove", 0, 120); f.touch("touchmove", 0, 30); },
    f => { f.touch("touchmove", 50, 10); f.touch("touchmove", 0, 150); },
    f => { f.touch("touchmove", 0, -20); f.touch("touchmove", 0, 150); },
    f => { f.touch("touchmove", 0, 120); f.touch("touchstart", 0, 120, { touches: [{}, {}] }); },
    f => { f.touch("touchmove", 0, 120); f.touch("touchcancel"); },
    f => { f.touch("touchmove", 0, 120); f.document.dispatchEvent(new Event("focusin")); },
  ]) {
    const f = fixture(); f.controller.start(); f.touch("touchstart"); moves(f); f.touch("touchend");
    await Promise.resolve(); assert.equal(f.reloads, 0); f.controller.stop();
  }
});

test("route/modal state and scroller position are rechecked until release", async () => {
  for (const change of [
    f => { f.allowed = false; }, f => { f.root.scrollTop = 40; },
    f => { f.document.querySelectorAll = () => [{ getClientRects: () => [1] }]; },
    f => { f.document.activeElement = element({ field: true }); },
  ]) {
    const f = fixture(); f.controller.start(); f.touch("touchstart"); f.touch("touchmove", 0, 130);
    change(f); f.touch("touchend"); await Promise.resolve();
    assert.equal(f.reloads, 0); f.controller.stop();
  }
});

test("a navigation or unmount triggered by another release handler cancels the queued reload", async () => {
  for (const change of [f => { f.allowed = false; }, f => f.controller.stop()]) {
    const f = fixture(); f.controller.start(); f.touch("touchstart"); f.touch("touchmove", 0, 130);
    f.touch("touchend"); change(f); await Promise.resolve();
    assert.equal(f.reloads, 0); assert.equal(f.timers.size, 0); f.controller.stop();
  }
});
