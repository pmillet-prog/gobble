import test from "node:test";
import assert from "node:assert/strict";
import { createApplicationKernel } from "../../app/core/createApplicationKernel.js";
import { createGameplaySessionFeature } from "../gameplay/createGameplaySessionFeature.js";
import { createInfortuneIntermissionFeature } from "./createInfortuneIntermissionFeature.js";
import { infortuneRoundPolicy, infortuneBreakDuration } from "../../../shared/infortuneIntermission.js";
import { buildInfortunePlateaus } from "../../../shared/infortunePlateaus.js";
import { createInfortuneLedger, createInfortuneRoundEconomy } from "../../../server/infortune/roundEconomy.js";
import { EXCHANGE_SECTOR_INDICES, WHEEL_SECTORS } from "../../../shared/infortuneWheel.js";

const exchangeIndex = EXCHANGE_SECTOR_INDICES[0];
const fiveHundredIndex = WHEEL_SECTORS.findIndex(sector => sector.amount === 500);
const passIndex = WHEEL_SECTORS.findIndex(sector => sector.kind === "pass");

function harness(policy = infortuneRoundPolicy({ enabled: true, round: 1, totalRounds: 5 }), onCommand = () => {}) {
  const timers = new Map(); let sequence = 0;
  const handlers = new Map();
  const kernel = createApplicationKernel({ ports: { realtime: { emit(event, value, reply) { onCommand(value, reply); }, bind(events) {
    Object.entries(events).forEach(([key, fn]) => handlers.set(key, fn));
    return () => Object.keys(events).forEach(key => handlers.delete(key));
  } } } }); kernel.commands.navigation.go("live");
  kernel.commands.session.setAuthState({ user: { id: 1 }, status: "authenticated" });
  kernel.features.define("gameplaySession", createGameplaySessionFeature);
  kernel.features.define("infortune", context => createInfortuneIntermissionFeature(context, { now: () => 1000, timers: {
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  } }));
  const lease = kernel.features.acquire("infortune"), feature = lease.feature;
  const session = kernel.features.prepare("gameplaySession");
  session.startRound({ roomId: "room", roundId: "r1", endsAt: 1000, infortune: policy });
  return { feature, kernel, session, timers, handlers, dispose: () => kernel.dispose(),
    expire(delay) { for (const [id, timer] of [...timers]) if (timer.delay <= delay) { timers.delete(id); timer.callback(); } } };
}
const payload = { roomId: "room", roundId: "r1", results: [{ nick: "Test", score: 42 }] };

test("the wheel reserves room time only between tournament rounds and preserves result reading time", () => {
  assert.equal(infortuneRoundPolicy({ enabled: false, round: 1, totalRounds: 5 }), null);
  assert.equal(infortuneRoundPolicy({ enabled: true, training: true, round: 1, totalRounds: 5 }), null);
  assert.equal(infortuneRoundPolicy({ enabled: true, round: 5, totalRounds: 5 }), null);
  const policy = infortuneRoundPolicy({ enabled: true, round: 4, totalRounds: 5 });
  assert.equal(infortuneBreakDuration(30000, policy, 1000, 6000), 85000);
  assert.equal(infortuneBreakDuration(45000, policy, 1000, 61000), 45000);
  assert.equal(infortuneBreakDuration(45000, null, 1000, 6000), 45000);
});

test("early results wait for the wheel, preserve the payload and release the transition exactly once", async () => {
  const app = harness(), spin = app.feature.begin("r1", payload, 1000);
  assert.ok(spin.started); assert.equal(app.feature.store.getState().stage, "wheel");
  const duplicate = app.feature.begin("r1", payload, 1100);
  assert.equal(duplicate.started, false); assert.equal(duplicate.promise, spin.promise);
  app.feature.launched(); app.expire(20000);
  assert.equal(app.feature.store.getState().visible, true);
  const outcome = { kind: "amount", amount: 500 };
  app.feature.complete(outcome);
  assert.deepEqual(await spin.promise, { cancelled: false, payload, wheelResult: outcome });
  assert.equal(app.feature.store.getState().visible, false); assert.equal(app.timers.size, 0);
  assert.equal(app.feature.begin("r1", payload, 2000), null);
  app.dispose();
});

test("a finished wheel waits for actual results and rejects other rooms and old rounds", async () => {
  const app = harness(), spin = app.feature.begin("r1", null, 1000);
  app.feature.complete({ kind: "pass" });
  assert.equal(app.feature.store.getState().stage, "waiting");
  app.feature.receive({ ...payload, roundId: "r0" });
  app.feature.receive({ ...payload, roomId: "elsewhere" });
  assert.equal(app.feature.store.getState().visible, true);
  app.feature.receive(payload);
  assert.equal((await spin.promise).payload, payload); app.dispose();
});

test("an idle or background player cannot hold the shared schedule indefinitely", async () => {
  const app = harness(), spin = app.feature.begin("r1", payload, 1000);
  app.expire(20000);
  assert.equal((await spin.promise).wheelResult, null); assert.equal(app.timers.size, 0); app.dispose();
  const slow = harness(), next = slow.feature.begin("r1", payload, 1000);
  slow.feature.launched(); slow.expire(55000);
  assert.equal((await next.promise).cancelled, false); slow.dispose();
});

test("leaving, changing round or disposing cancels the pending transition and its timers", async () => {
  for (const action of [app => app.kernel.commands.navigation.go("home"),
    app => app.session.startRound({ roomId: "room", roundId: "r2" }),
    app => app.session.hydrateSnapshot({ roomId: "room", phase: "playing", currentRound: { roundId: "r1" } }), app => app.dispose()]) {
    const app = harness(), spin = app.feature.begin("r1", null, 1000);
    action(app); assert.equal((await spin.promise).cancelled, true);
    assert.equal(app.timers.size, 0); app.dispose();
  }
});

test("a callback from an old wheel cannot complete a new round", async () => {
  const app = harness(), old = app.feature.begin("r1", payload, 1000), oldKey = app.feature.store.getState().key;
  app.session.startRound({ roomId: "room", roundId: "r2", endsAt: 2000,
    infortune: infortuneRoundPolicy({ enabled: true, round: 2, totalRounds: 5 }) });
  assert.equal((await old.promise).cancelled, true);
  const next = app.feature.begin("r2", { ...payload, roundId: "r2" }, 2000);
  app.feature.complete(null, oldKey);
  assert.equal(app.feature.store.getState().visible, true);
  app.feature.complete(); await next.promise; app.dispose();
});

test("a server-disabled or final-round session never opens the wheel", () => {
  const app = harness(null);
  assert.equal(app.feature.begin("r1", payload, 1000), null); assert.equal(app.timers.size, 0); app.dispose();
});

const groupedPolicy = { ...infortuneRoundPolicy({ enabled: true, round: 1, totalRounds: 5 }), plateauVersion: 1 };
const seatingPayload = (ids = [1, 2, 3]) => ({ roomId: "room", roundId: "r1", infortune: { ...groupedPolicy, openedAt: 7000,
  groups: buildInfortunePlateaus({ roomId: "room", roundId: "r1", players: ids.map(userId => ({ userId, nick: `Joueur ${userId}` })), random: () => .5 }) } });

test("waiting for seating cannot consume the launch window; an early assignment and final results share one frozen group", async () => {
  const app = harness(groupedPolicy), spin = app.feature.begin("r1", null, 1000);
  assert.equal(app.feature.store.getState().stage, "seating");
  app.expire(20000);
  assert.equal(app.feature.store.getState().visible, true);
  const seating = seatingPayload();
  app.handlers.get("infortunePlateau")(seating);
  const group = app.feature.store.getState().plateau;
  assert.equal(group.self.userId, 1);
  assert.equal(app.feature.store.getState().stage, "wheel");
  assert.equal(app.feature.store.getState().launchUntil, 27000);
  app.handlers.get("infortunePlateau")(seatingPayload([1, 4, 5]));
  assert.equal(app.feature.store.getState().plateau, group);
  app.feature.launched(); app.feature.complete({ kind: "pass" });
  app.handlers.get("roundEnded")({ ...payload, infortune: seating.infortune });
  assert.equal((await spin.promise).wheelResult.kind, "pass");
  app.dispose(); assert.equal(app.handlers.size, 0);
});

test("seating received before the local outro is reused, and final results alone can recover a missed seating event", async () => {
  for (const early of [true, false]) {
    const app = harness(groupedPolicy), seating = seatingPayload();
    if (early) app.handlers.get("infortunePlateau")(seating);
    const spin = app.feature.begin("r1", { ...payload, infortune: seating.infortune }, 1000);
    assert.equal(app.feature.store.getState().plateau.self.userId, 1);
    app.feature.complete(); await spin.promise; app.dispose();
  }
});

test("a late joiner cannot replace a candidate in a frozen group, and foreign/old seating events are ignored", async () => {
  const app = harness(groupedPolicy), spin = app.feature.begin("r1", null, 1000);
  app.feature.receivePlateau({ ...seatingPayload(), roomId: "other" });
  app.feature.receivePlateau({ ...seatingPayload(), roundId: "r0" });
  assert.equal(app.feature.store.getState().plateau, null);
  app.feature.receivePlateau(seatingPayload([2, 3]));
  assert.equal(app.feature.store.getState().plateauStatus, "absent");
  assert.equal(app.feature.store.getState().stage, "waiting");
  app.feature.receive(payload); assert.equal((await spin.promise).wheelResult, null); app.dispose();
});

function economicHarness({ round = 4, ids = [1, 2, 3], omitFirstSpinAck = false, alreadySpun = false } = {}) {
  const seating = seatingPayload(ids), ledger = createInfortuneLedger();
  const policy = { ...groupedPolicy, ...infortuneRoundPolicy({ enabled: true, round, totalRounds: 5 }), openedAt: 1000 };
  let app, spinRequests = 0;
  const server = createInfortuneRoundEconomy({ ledger, policy, groups: seating.infortune.groups, now: () => 1000, random: () => 0.4,
    timers: { setTimeout() { return 1; }, clearTimeout() {} },
    onChange(economy) { if (!omitFirstSpinAck) app?.handlers.get("infortuneEconomy")({ ...payload, economy }); } });
  if (alreadySpun) server.submit("user:1", { type: "spin", index: exchangeIndex });
  app = harness(policy, (value, ack) => {
    const reply = server.submit("user:1", value);
    if (value.type === "spin" && ++spinRequests === 1 && omitFirstSpinAck) return;
    ack(reply);
  });
  const infortune = { ...policy, groups: seating.infortune.groups, economy: server.snapshot() };
  const spin = app.feature.begin("r1", { ...payload, infortune }, 1000);
  return { ...app, server, ledger, spin, get spinRequests() { return spinRequests; } };
}

test("recording the real result waits for the presentation, then allows a choice and waits for reciprocal settlement", async () => {
  const app = economicHarness(); app.feature.launched();
  const result = { index: exchangeIndex, kind: "exchange", label: "Échange", launchQuality: { kind: "perfect" } };
  app.feature.recordResult(result);
  assert.equal(app.ledger.banks.get("user:1"), 100);
  assert.equal(app.feature.store.getState().stage, "wheel");
  app.feature.complete(result); assert.equal(app.feature.store.getState().stage, "exchange");
  app.feature.chooseExchange("user:2"); assert.equal(app.feature.store.getState().stage, "exchange-wait");
  app.server.submit("user:2", { type: "spin", index: fiveHundredIndex });
  app.server.submit("user:3", { type: "spin", index: passIndex });
  assert.equal(app.feature.store.getState().stage, "settled");
  assert.equal(app.ledger.banks.get("user:1"), 500); assert.equal(app.ledger.banks.get("user:2"), 100);
  app.expire(1600); assert.equal((await app.spin.promise).wheelResult, result);
  assert.equal(app.timers.size, 0); app.dispose(); app.server.dispose();
});

test("an acknowledgement lost in transit retries the same spin without awarding twice", async () => {
  const app = economicHarness({ round: 1, omitFirstSpinAck: true }); app.feature.launched();
  const result = { index: fiveHundredIndex, kind: "amount", amount: 500 };
  app.feature.recordResult(result); app.feature.complete(result);
  assert.equal(app.feature.store.getState().stage, "accounting");
  app.expire(3000);
  assert.equal((await app.spin.promise).wheelResult, result);
  assert.equal(app.spinRequests, 2); assert.equal(app.ledger.banks.get("user:1"), 500);
  assert.equal(app.timers.size, 0); app.dispose(); app.server.dispose();
});

test("reconnecting after an exchange result resumes the choice, and a late joiner still goes to results", async () => {
  const resumed = economicHarness({ alreadySpun: true });
  assert.equal(resumed.feature.store.getState().stage, "exchange");
  assert.equal(resumed.spinRequests, 0); resumed.dispose(); resumed.server.dispose();
  assert.equal((await resumed.spin.promise).cancelled, true);
  const late = economicHarness({ ids: [2, 3, 4] });
  assert.equal((await late.spin.promise).cancelled, false);
  assert.equal(late.feature.store.getState().visible, false); late.dispose(); late.server.dispose();
});
