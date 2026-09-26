import test from "node:test";
import assert from "node:assert/strict";
import { createStarterGrantNotifier } from "./createStarterGrantNotifier.js";

function setup() {
  const state = { calls: [], shown: [], visible: true, fail: false, pending: true, userId: 1, timer: null };
  const notifier = createStarterGrantNotifier({ userId: 1, visible: () => state.visible,
    request: async key => { state.calls.push(key || "get"); if (state.fail) throw Error("offline"); if (key) { state.pending = false; return { ok: true }; } return { userId: state.userId, grant: state.pending ? { key: "starter", amount: 3000, label: "Bienvenue" } : null }; },
    show: (...args) => state.shown.push(args), setTimer: callback => { state.timer = callback; return 1; }, clearTimer: () => { state.timer = null; },
  });
  return { state, notifier };
}

test("shows the grant once and acknowledges only after the toast, then stops querying", async () => {
  const { state, notifier } = setup();
  await Promise.all([notifier.refresh(), notifier.refresh()]);
  assert.deepEqual(state.calls, ["get"]); assert.equal(state.shown.length, 1);
  assert.equal(state.shown[0][1], 8000);
  await notifier.refresh(); assert.equal(state.shown.length, 1);
  await state.timer();
  const before = state.calls.length;
  await notifier.refresh(); assert.equal(state.calls.length, before);
  assert.deepEqual(state.calls.slice(-2), ["starter", "get"]); notifier.dispose();
});

test("hidden or changed accounts cannot consume a pending gift; disposal cancels acknowledgement", async () => {
  const { state, notifier } = setup();
  state.visible = false; await notifier.refresh(); assert.equal(state.calls.length, 0);
  state.visible = true; state.userId = 2; await notifier.refresh(); assert.equal(state.shown.length, 0);
  state.userId = 1; await notifier.refresh(); assert.equal(state.shown.length, 1);
  notifier.dispose(); assert.equal(state.timer, null); assert.ok(!state.calls.includes("starter"));
});

test("failed or interrupted presentation stays eligible for retry", async () => {
  const { state, notifier } = setup();
  state.fail = true; await notifier.refresh(); assert.equal(state.shown.length, 0);
  state.fail = false; await notifier.refresh();
  state.visible = false; await state.timer(); assert.ok(!state.calls.includes("starter"));
  state.visible = true; await notifier.refresh(); assert.equal(state.shown.length, 2);
  state.fail = true; await state.timer(); state.fail = false;
  await notifier.refresh(); assert.equal(state.shown.length, 3); notifier.dispose();
});

test("an account without a pending gift is checked only once per connection lifecycle", async () => {
  const { state, notifier } = setup(); state.pending = false;
  await notifier.refresh(); await notifier.refresh();
  assert.deepEqual(state.calls, ["get"]); assert.equal(state.shown.length, 0); notifier.dispose();
});

test("distinct pending gifts are announced in sequence without hiding the welcome grant", async () => {
  const gifts = [{ key: "faces", amount: 500, label: "Visages gratuits" }, { key: "starter", amount: 3000, label: "Bienvenue" }];
  const shown = [], acknowledged = [];
  let timer;
  const notifier = createStarterGrantNotifier({ userId: 1,
    request: async key => {
      if (key) { acknowledged.push(key); assert.equal(gifts.shift().key, key); return { ok: true }; }
      return { userId: 1, grant: gifts[0] || null };
    }, show: label => shown.push(label), setTimer: callback => { timer = callback; return 1; }, clearTimer() {},
  });
  await notifier.refresh();
  assert.deepEqual(shown, ["Visages gratuits"]);
  await timer();
  assert.deepEqual(shown, ["Visages gratuits", "Bienvenue"]);
  await notifier.refresh();
  assert.equal(shown.length, 2);
  await timer();
  assert.deepEqual(acknowledged, ["faces", "starter"]);
  notifier.dispose();
});
