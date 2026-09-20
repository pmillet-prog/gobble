import test from "node:test";
import assert from "node:assert/strict";
import { getGobblarsRewardBalance, normalizeGobblarsReward, GOBBLARS_COUNT_START, GOBBLARS_COUNT_DURATION, GOBBLARS_REWARD_DURATION } from "./gobblarsRewardAnimation.js";
import { createNotificationsFeature } from "./createNotificationsFeature.js";
import { createResourceScope } from "../../app/core/createResourceScope.js";
import { showGobblarsSpent } from "./showGobblarsSpent.js";

function setup() {
  const scope = createResourceScope("gobblars-test");
  const timers = new Map();
  let time = 1000;
  let sequence = 0;
  const feature = createNotificationsFeature({ scope }, {
    now: () => time,
    setTimeoutFn: (run, delay) => { const id = ++sequence; timers.set(id, { run, delay }); return id; },
    clearTimeoutFn: id => timers.delete(id),
  });
  feature.start();
  return { feature, scope, timers, next() {
    const [id, timer] = timers.entries().next().value;
    timers.delete(id); time += timer.delay; timer.run();
  } };
}

test("a gain uses the server balance and a dedicated animation, without a duplicate toast", () => {
  const { feature, timers, next, scope } = setup();
  feature.show("+50 Gobblars", 3000, { gobblarsReward: { amount: 50, balance: 1330, label: "Médaille d’or" } });
  assert.equal(feature.store.getState().gobblarsReward.before, 1280);
  assert.equal(feature.store.getState().gobblarsReward.balance, 1330);
  assert.equal(feature.store.getState().gobblarsReward.startedAt, 1000);
  assert.deepEqual(feature.store.getState().toasts, []);
  assert.equal(timers.values().next().value.delay, GOBBLARS_REWARD_DURATION);
  next();
  assert.equal(feature.store.getState().gobblarsReward, null);
  assert.equal(timers.size, 0);
  scope.dispose();
});

test("bursts preserve the current animation and combine pending gains into one accurate total", () => {
  const { feature, next, timers, scope } = setup();
  const show = (amount, balance, receipt) => feature.show("Gain", 0, { gobblarsReward: { amount, balance, receipt } });
  show(1, 1281, "a");
  const first = feature.store.getState().gobblarsReward;
  show(2, 1283, "b");
  show(50, 1333, "c");
  assert.equal(show(50, 1333, "c"), null);
  assert.equal(feature.store.getState().gobblarsReward, first);
  assert.equal(timers.size, 1);
  next();
  const combined = feature.store.getState().gobblarsReward;
  assert.equal(combined.amount, 52);
  assert.equal(combined.before, 1281);
  assert.equal(combined.balance, 1333);
  assert.equal(combined.label, "Gains cumulés");
  assert.equal(combined.startedAt, 1000 + GOBBLARS_REWARD_DURATION);
  next();
  assert.equal(feature.store.getState().gobblarsReward, null);
  scope.dispose();
});

test("clearing or disposing also discards pending rewards and their timer", () => {
  const { feature, timers, scope } = setup();
  const give = () => feature.show("Gain", 0, { gobblarsReward: { amount: 2, balance: 1400 } });
  give(); give();
  feature.clear();
  assert.equal(timers.size, 0);
  assert.equal(feature.store.getState().gobblarsReward, null);
  give(); give();
  scope.dispose();
  assert.equal(timers.size, 0);
  assert.equal(feature.store.getState().gobblarsReward, null);
});

test("counter starts on arrival, grows monotonically, and resumes at the right value", () => {
  const reward = normalizeGobblarsReward({ amount: 250, balance: 9999 });
  assert.equal(getGobblarsRewardBalance(reward, 0), 9749);
  assert.equal(getGobblarsRewardBalance(reward, GOBBLARS_COUNT_START), 9749);
  let previous = 9749;
  for (let elapsed = GOBBLARS_COUNT_START; elapsed <= GOBBLARS_REWARD_DURATION; elapsed += 17) {
    const value = getGobblarsRewardBalance(reward, elapsed);
    assert.ok(value >= previous && value <= 9999);
    previous = value;
  }
  assert.equal(getGobblarsRewardBalance(reward, GOBBLARS_COUNT_START + GOBBLARS_COUNT_DURATION), 9999);
  assert.equal(getGobblarsRewardBalance(reward, 100000), 9999);
  assert.equal(getGobblarsRewardBalance(reward, 0, true), 9999);
});

test("a confirmed expense counts down to the server balance and can spend the last gobblar", () => {
  const { feature, scope } = setup();
  showGobblarsSpent(feature.show, { spent: 1000, balance: 0 }, "Achat d’avatar");
  const reward = feature.store.getState().gobblarsReward;
  assert.equal(reward.before, 1000);
  assert.equal(reward.amount, -1000);
  assert.deepEqual(feature.store.getState().toasts, []);
  let previous = 1000;
  for (let elapsed = 0; elapsed <= GOBBLARS_REWARD_DURATION; elapsed += 17) {
    const value = getGobblarsRewardBalance(reward, elapsed);
    assert.ok(value <= previous && value >= 0);
    previous = value;
  }
  assert.equal(previous, 0);
  assert.equal(getGobblarsRewardBalance(reward, 0, true), 0);
  scope.dispose();
});

test("interleaved purchases and gains keep their signs, order and exact balances", () => {
  const { feature, next, scope } = setup();
  const show = (amount, balance) => feature.show("", 0, { gobblarsReward: { amount, balance } });
  show(50, 2050);
  show(-500, 1550); show(-1000, 550);
  show(50, 600); show(-500, 100);
  next();
  assert.deepEqual([feature.store.getState().gobblarsReward.amount, feature.store.getState().gobblarsReward.before, feature.store.getState().gobblarsReward.balance], [-1500, 2050, 550]);
  next();
  assert.equal(feature.store.getState().gobblarsReward.amount, 50);
  next();
  assert.equal(feature.store.getState().gobblarsReward.amount, -500);
  assert.equal(feature.store.getState().gobblarsReward.balance, 100);
  next();
  assert.equal(feature.store.getState().gobblarsReward, null);
  scope.dispose();
});

test("free purchases and balance-only refreshes produce no expense notification", () => {
  const calls = [];
  for (const data of [{ spent: 0, balance: 500 }, { balance: 500 }, { spent: -500, balance: 0 }, { spent: 500, balance: -1 }]) {
    assert.equal(showGobblarsSpent((...args) => calls.push(args), data), null);
  }
  assert.equal(calls.length, 0);
});

test("invalid transactions and incomplete balances never produce a misleading reward", () => {
  for (const data of [null, {}, { amount: 2 }, { amount: 2, balance: null }, { amount: 2, balance: 1 }, { amount: 0, balance: 20 }, { amount: -2, balance: -1 }, { amount: 1.5, balance: 20 }, { amount: 2, balance: Infinity }, { amount: -2, balance: Number.MAX_SAFE_INTEGER }]) {
    assert.equal(normalizeGobblarsReward(data), null);
  }
});
