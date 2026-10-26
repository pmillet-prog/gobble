import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createMaintenanceRecovery } from "./createMaintenanceRecovery.js";
import { MAINTENANCE_RESPONSE_EVENT } from "./maintenanceResponse.js";

const maintenance = readFileSync(new URL("../../../ops/maintenance/index.html", import.meta.url), "utf8");
function harness(response = { status: 503, text: async () => maintenance }) {
  const socket = new EventEmitter(); socket.connected = true; socket.active = true;
  const browser = new EventTarget(), document = new EventTarget();
  let time = 10000, nextId = 0, reloads = 0;
  const timers = new Map(), requests = [];
  browser.navigator = { onLine: true };
  browser.location = { href: "https://gobble.invalid/", reload: () => reloads++ };
  document.hidden = false;
  const feature = createMaintenanceRecovery({ socket, windowObject: browser, documentObject: document,
    now: () => time, setTimeoutFn: (callback, ms) => { timers.set(++nextId, { callback, ms }); return nextId; }, clearTimeoutFn: id => timers.delete(id),
    fetchFn: async (...args) => { requests.push(args); if (response instanceof Error) throw response; return response; },
  });
  feature.start();
  const run = async () => {
    const [id, task] = [...timers][0]; timers.delete(id); time += task.ms; await task.callback();
  };
  return { feature, socket, browser, document, timers, requests, run, reloads: () => reloads };
}

test("healthy sockets never poll; a deployment triggers the existing maintenance page once", async () => {
  const h = harness();
  assert.equal(h.requests.length, 0); assert.equal(h.timers.size, 0);
  h.socket.emit("disconnect", "transport close");
  h.socket.emit("connect_error", new Error("offline"));
  h.browser.dispatchEvent(new Event(MAINTENANCE_RESPONSE_EVENT));
  assert.equal(h.timers.size, 1);
  await h.run();
  assert.equal(h.requests.length, 1); assert.equal(h.reloads(), 1);
  assert.equal(h.requests[0][1].cache, "no-store");
  h.socket.emit("connect_error");
  assert.equal(h.timers.size, 0);
  h.feature.dispose();
  assert.equal(h.socket.listenerCount("disconnect"), 0);
});

test("network loss, generic errors and a healthy frontend never reload the game", async () => {
  for (const response of [new TypeError("Failed to fetch"), { status: 502, text: async () => "Bad Gateway" }, { status: 200, text: async () => "<html>game</html>" }]) {
    const h = harness(response);
    h.socket.emit("connect_error"); await h.run();
    assert.equal(h.reloads(), 0); assert.equal(h.timers.size, 0);
    h.socket.emit("connect_error"); h.socket.emit("connect_error");
    assert.equal(h.timers.size, 1);
    assert.equal([...h.timers.values()][0].ms, 5000);
    h.feature.dispose(); assert.equal(h.timers.size, 0);
  }
});

test("intentional disconnect, recovery, background and offline mode cancel or skip checks", async () => {
  const h = harness();
  h.socket.emit("disconnect", "io client disconnect");
  assert.equal(h.timers.size, 0);
  h.socket.emit("connect_error"); h.socket.emit("connect");
  assert.equal(h.timers.size, 0);
  h.document.hidden = true; h.socket.emit("connect_error"); await h.run();
  assert.equal(h.requests.length, 0);
  h.document.hidden = false; h.browser.navigator.onLine = false;
  h.socket.emit("connect_error"); await h.run(); assert.equal(h.requests.length, 0);
  h.feature.dispose();
});

test("a stale in-flight response cannot reload after reconnection or disposal", async () => {
  for (const dispose of [false, true]) {
    let resolveBody;
    const h = harness({ status: 503, text: () => new Promise(resolve => { resolveBody = resolve; }) });
    h.socket.emit("connect_error"); const check = h.run(); await Promise.resolve();
    if (dispose) h.feature.dispose(); else h.socket.emit("connect");
    resolveBody(maintenance); await check;
    assert.equal(h.reloads(), 0); assert.equal(h.timers.size, 0); h.feature.dispose();
  }
});
