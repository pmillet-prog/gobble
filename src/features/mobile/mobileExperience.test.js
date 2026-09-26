import test from "node:test";
import assert from "node:assert/strict";
import { createScreenWakeLock } from "./createScreenWakeLock.js";
import { createMobileNavigation, MOBILE_HISTORY_KEY } from "./createMobileNavigation.js";
import { createMobileBackRegistry } from "./mobileBackRegistry.js";
import { isMobileExperienceEnabled, isMobileRoundActive, getMobileBackTargets } from "./mobileExperiencePolicy.js";

const flush = () => new Promise(resolve => setImmediate(resolve));
test("mobile back and wake protection survive selecting a desktop presentation on a phone", () => {
  assert.equal(isMobileExperienceEnabled({ enabled: false, mobileDevice: true }), true);
  assert.equal(isMobileExperienceEnabled({ enabled: true, mobileDevice: false }), true);
  assert.equal(isMobileExperienceEnabled({ enabled: false, mobileDevice: false }), false);
});
function eventTarget(extra = {}) {
  const listeners = new Map();
  return Object.assign({
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, event = {}) { for (const fn of [...(listeners.get(type) || [])]) fn(event); },
    count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  }, extra);
}
function wakeHarness(requestOverride) {
  const documentTarget = eventTarget({ visibilityState: "visible" });
  const windowTarget = eventTarget();
  const locks = [];
  let requests = 0;
  const navigatorTarget = { wakeLock: { request: async type => {
    assert.equal(type, "screen");
    requests++;
    if (requestOverride) return requestOverride();
    const sentinel = eventTarget({ released: false, release() { this.released = true; this.emit("release"); return Promise.resolve(); } });
    locks.push(sentinel);
    return sentinel;
  } } };
  return { documentTarget, windowTarget, locks, requests: () => requests,
    controller: createScreenWakeLock({ documentTarget, windowTarget, navigatorTarget }) };
}
test("wake lock only during a visible round; foreground reacquires; cleanup releases", async () => {
  const h = wakeHarness();
  h.controller.start();
  await flush();
  assert.equal(h.requests(), 0);
  h.controller.setEnabled(true);
  await flush();
  assert.equal(h.requests(), 1);
  h.controller.setEnabled(true);
  await flush();
  assert.equal(h.requests(), 1);
  h.documentTarget.visibilityState = "hidden";
  h.documentTarget.emit("visibilitychange");
  assert.equal(h.locks[0].released, true);
  h.documentTarget.visibilityState = "visible";
  h.documentTarget.emit("visibilitychange");
  await flush();
  assert.equal(h.requests(), 2);
  h.windowTarget.emit("pagehide");
  assert.equal(h.locks[1].released, true);
  h.windowTarget.emit("pageshow");
  await flush();
  h.controller.setEnabled(false);
  assert.equal(h.locks[2].released, true);
  h.controller.stop();
  assert.equal(h.documentTarget.count() + h.windowTarget.count(), 0);
  for (const lock of h.locks) assert.equal(lock.count(), 0);
});
test("late wake-lock grants are released after leaving the round", async () => {
  let resolve;
  const sentinel = { released: false, release() { this.released = true; } };
  const h = wakeHarness(() => new Promise(done => { resolve = done; }));
  h.controller.start();
  h.controller.setEnabled(true);
  await flush();
  h.controller.setEnabled(false);
  resolve(sentinel);
  await flush();
  assert.equal(sentinel.released, true);
  h.controller.stop();
});
test("wake lock refusal is not retried on every render", async () => {
  const h = wakeHarness(() => Promise.reject(new Error("battery saver")));
  h.controller.start();
  h.controller.setEnabled(true);
  await flush();
  for (let i = 0; i < 50; i++) h.controller.setEnabled(true);
  await flush();
  assert.equal(h.requests(), 1);
  h.controller.stop();
});
test("wake lock recovers when a pending grant overlaps background/foreground", async () => {
  const grants = [];
  const h = wakeHarness(() => new Promise(resolve => grants.push(resolve)));
  h.controller.start(); h.controller.setEnabled(true);
  await flush();
  h.documentTarget.visibilityState = "hidden"; h.documentTarget.emit("visibilitychange");
  h.documentTarget.visibilityState = "visible"; h.documentTarget.emit("visibilitychange");
  const stale = { released: false, release() { this.released = true; } };
  grants[0](stale);
  await flush();
  assert.equal(stale.released, true);
  assert.equal(grants.length, 2);
  h.controller.stop();
  const late = { released: false, release() { this.released = true; } };
  grants[1](late);
  await flush();
  assert.equal(late.released, true);
});
function navigationHarness() {
  const windowTarget = eventTarget({ location: { href: "https://gobble.test/" }, Event });
  const entries = [{ external: true }, { application: "preserve" }];
  let index = 1, pendingPop = false;
  const history = {
    get state() { return entries[index]; },
    pushState(state) { entries.splice(index + 1); entries.push(state); index++; },
    back() {
      if (index === 0 || pendingPop) return;
      pendingPop = true;
      queueMicrotask(() => { index--; pendingPop = false; windowTarget.emit("popstate", { state: entries[index] }); });
    },
  };
  windowTarget.history = history;
  const registry = createMobileBackRegistry();
  const documentTarget = { querySelector: () => null };
  const controller = createMobileNavigation({ windowTarget, documentTarget, registry });
  let config = { enabled: true, targets: [] };
  const configure = changes => { config = { ...config, ...changes }; controller.configure(config); };
  controller.configure(config); controller.start();
  return { windowTarget, history, registry, controller, configure, entries, documentTarget, index: () => index };
}
test("back closes the latest panel first, then asks before abandoning a round", async () => {
  const h = navigationHarness(), closed = [];
  h.configure({ protectExit: true, requestExit: () => closed.push("confirm"),
    targets: [{ id: "settings", open: true, onBack: () => closed.push("settings") }] });
  h.configure({ targets: [
    { id: "settings", open: true, onBack: () => closed.push("settings") },
    { id: "sound", open: true, onBack: () => closed.push("sound") },
  ] });
  h.history.back(); await flush();
  assert.deepEqual(closed, ["sound"]);
  h.configure({ targets: [{ id: "settings", open: true, onBack: () => closed.push("settings") }] });
  h.history.back(); await flush();
  h.configure({ targets: [] });
  h.history.back(); await flush();
  assert.deepEqual(closed, ["sound", "settings", "confirm"]);
  assert.equal(h.entries.length, 3);
  assert.equal(h.history.state.application, "preserve");
  h.configure({ confirming: true, cancelExit: () => closed.push("stay") });
  h.history.back(); await flush();
  assert.equal(closed.at(-1), "stay");
  h.controller.stop(); await flush();
  assert.equal(h.index(), 1);
  assert.equal(h.windowTarget.count(), 0);
});
test("repeated opening and UI closing never traps the player at home", async () => {
  const h = navigationHarness();
  for (let i = 0; i < 50; i++) {
    h.configure({ onBack() {} });
    assert.equal(h.history.state[MOBILE_HISTORY_KEY], true);
    h.configure({ onBack: null });
    await flush();
    assert.equal(h.index(), 1);
    assert.equal(h.entries.length, 3);
  }
  h.history.back(); await flush();
  assert.equal(h.index(), 0);
  h.controller.stop();
});
test("local editors and native purchase dialogs keep their own cancel behavior", async () => {
  const h = navigationHarness(), calls = [];
  h.configure({ onBack: () => calls.push("home") });
  const unregister = h.registry.register(() => calls.push("editor"));
  h.history.back(); await flush();
  assert.deepEqual(calls, ["editor"]);
  h.documentTarget.querySelector = () => ({ requestClose: () => calls.push("purchase") });
  h.history.back(); await flush();
  assert.deepEqual(calls, ["editor", "purchase"]);
  h.documentTarget.querySelector = () => null;
  unregister();
  h.history.back(); await flush();
  assert.equal(calls.at(-1), "home");
  h.controller.stop(); await flush();
});
test("StrictMode cleanup/restart and rapid closing/reopening keep one guard", async () => {
  const h = navigationHarness();
  h.configure({ onBack() {} });
  h.controller.stop();
  h.controller.start();
  await flush();
  assert.equal(h.index(), 2);
  assert.equal(h.entries.length, 3);
  h.configure({ onBack: null });
  h.configure({ onBack() {} });
  await flush();
  assert.equal(h.index(), 2);
  h.configure({ enabled: false });
  await flush();
  assert.equal(h.index(), 1);
  h.controller.stop();
  assert.equal(h.windowTarget.count(), 0);
});
test("desktop browser navigation is untouched and beforeunload exists only during mobile play", () => {
  const h = navigationHarness();
  h.configure({ enabled: false, protectExit: true, onBack() {} });
  assert.equal(h.index(), 1);
  let prevented = 0;
  h.windowTarget.emit("beforeunload", { preventDefault: () => prevented++ });
  assert.equal(prevented, 0);
  h.configure({ enabled: true, protectExit: true });
  h.windowTarget.emit("beforeunload", { preventDefault: () => prevented++ });
  assert.equal(prevented, 1);
  h.configure({ protectExit: false });
  h.windowTarget.emit("beforeunload", { preventDefault: () => prevented++ });
  assert.equal(prevented, 1);
  h.controller.stop();
});
test("play policy covers live, daily and training, but stops at results/home or desktop", () => {
  for (const view of ["live", "daily_play", "training"]) {
    assert.equal(isMobileRoundActive({ enabled: true, view, phase: "playing", loggedIn: true }), true);
    assert.equal(isMobileRoundActive({ enabled: true, view, phase: "results", loggedIn: true }), false);
  }
  assert.equal(isMobileRoundActive({ enabled: true, view: "daily_play", phase: "playing", loggedIn: false }), true);
  assert.equal(isMobileRoundActive({ enabled: true, view: "home", phase: "playing", loggedIn: true }), false);
  assert.equal(isMobileRoundActive({ enabled: false, view: "live", phase: "playing", loggedIn: true }), false);
});
test("panel back uses domain cleanup and prevents closing a busy training confirmation", () => {
  const feature = (state = {}) => ({ store: { getState: () => state }, set: (key, value) => { state[key] = value; } });
  const features = { overlays: feature({ settingsOpen: true, trainingConfirm: {}, trainingBusy: true }),
    preferences: feature(), chat: feature(), daily: feature(), admin: feature() };
  let closed = 0;
  const targets = getMobileBackTargets(features, { settingsOpen: () => closed++ });
  targets.find(t => t.id === "settingsOpen").onBack();
  assert.equal(closed, 1);
  targets.find(t => t.id === "trainingConfirm").onBack();
  assert.ok(features.overlays.store.getState().trainingConfirm);
});
