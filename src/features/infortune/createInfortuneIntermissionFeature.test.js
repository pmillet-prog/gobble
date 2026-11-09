import test from "node:test";
import assert from "node:assert/strict";
import { createApplicationKernel } from "../../app/core/createApplicationKernel.js";
import { createGameplaySessionFeature } from "../gameplay/createGameplaySessionFeature.js";
import { createInfortuneIntermissionFeature } from "./createInfortuneIntermissionFeature.js";
import { infortuneRoundPolicy, infortuneBreakDuration } from "../../../shared/infortuneIntermission.js";
import { buildInfortunePlateaus } from "../../../shared/infortunePlateaus.js";
import { createInfortuneLedger, createInfortuneRoundEconomy } from "../../../server/infortune/roundEconomy.js";
import { EXCHANGE_SECTOR_INDICES, WHEEL_SECTORS } from "../../../shared/infortuneWheel.js";
import { INFORTUNE_EXCHANGE_STEP_MS } from "../../../shared/infortuneExchangePlan.js";
import { INFORTUNE_LEADER_WINDOW_MS } from '../../../shared/infortuneLeaders.js';
import { wheelInvitationEvent, completeWheelInvitation } from './wheelInvitationPresentation.js';
import { isResultsVocabularyReady } from '../presenters/resultsPresenterAvailability.js';

const exchangeIndex = EXCHANGE_SECTOR_INDICES[0];
const fiveHundredIndex = WHEEL_SECTORS.findIndex(sector => sector.amount === 500);
const passIndex = WHEEL_SECTORS.findIndex(sector => sector.kind === "pass");

function harness(policy = infortuneRoundPolicy({ enabled: true, round: 1, totalRounds: 5 }), onCommand = () => {}, options = {}) {
  const timers = new Map(); let sequence = 0;
  const handlers = new Map();
  const kernel = createApplicationKernel({ ports: { realtime: { emit(event, value, reply) { onCommand(value, reply); }, bind(events) {
    Object.entries(events).forEach(([key, fn]) => handlers.set(key, fn));
    return () => Object.keys(events).forEach(key => handlers.delete(key));
  } } } }); kernel.commands.navigation.go("live");
  kernel.commands.session.setAuthState({ user: { id: 1 }, status: "authenticated" });
  kernel.features.define("gameplaySession", createGameplaySessionFeature);
  kernel.features.define("infortune", context => createInfortuneIntermissionFeature(context, { enabled: true, now: () => 1000, ...options, timers: {
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

test('the shared leader walk replaces waiting once and is cancelled by the next round', () => {
  let now = 1000;
  const policy = { ...infortuneRoundPolicy({ enabled: true, round: 1, totalRounds: 5 }), afterResults: true, openedAt: 1000 };
  const app = harness(policy, undefined, { now: () => now });
  app.feature.begin('r1', { ...payload, infortune: policy }, now);
  app.feature.complete({ kind: 'amount', amount: 500 });
  const wheelClosing = { id: 'room:r1:leaders', roundNumber: 1, startsAt: 1600, endsAt: 6800,
    leaders: [{ id: 'user:2', userId: 2, nick: 'Paul' }] };
  app.handlers.get('breakStarted')({ ...payload, nextStartAt: 7100, wheelClosing, serverNow: now });
  assert.equal(app.feature.store.getState().stage, 'waiting');
  assert.deepEqual(app.feature.store.getState().closing, wheelClosing);
  now = 1600; app.expire(600);
  assert.equal(app.feature.store.getState().stage, 'leaders');
  app.handlers.get('breakStarted')({ ...payload, nextStartAt: 7100, wheelClosing, serverNow: now });
  assert.equal(app.feature.store.getState().closing.startsAt, 1600);
  app.session.startRound({ roomId: 'room', roundId: 'r2' });
  assert.equal(app.feature.store.getState().visible, false);
  assert.equal(app.feature.store.getState().closing, null);
  assert.equal(app.timers.size, 0);
  app.dispose();
});

test('reconnecting during the parade resumes its clock; reconnecting after it skips old exchanges', () => {
  for (const serverNow of [5000, 11000]) {
    const app = harness(null);
    const value = seatingPayload([1, 2, 3]), group = value.infortune.groups[0];
    const policy = { ...value.infortune, ...infortuneRoundPolicy({ enabled: true, round: 4, totalRounds: 5 }),
      afterResults: true, openedAt: 1000, resultsReadyAt: 500, economy: {
        revision: 5, exchangeEnabled: true, resolvedGroups: [group.id],
        members: Object.fromEntries(group.members.map((player, i) => [player.id, { spin: 'done', bank: 500, target: i === 0 ? group.members[1].id : null }])),
        exchangeReplays: { [group.id]: [{ from: group.members[0].id, to: group.members[1].id, sourceBank: 1000, targetBank: 500 }] },
      } };
    const wheelClosing = { id: 'room:r1:leaders', roundNumber: 4, startsAt: 4000, endsAt: 9200,
      leaders: [{ id: 'user:2', userId: 2, nick: 'Paul' }] };
    app.session.hydrateSnapshot({ roomId: 'room', phase: 'results', capturedAt: serverNow,
      lastRoundResults: { payload: { ...payload, infortune: policy } },
      breakState: { ...payload, infortune: policy, wheelClosing, nextStartAt: 9500 } });
    assert.equal(app.feature.store.getState().stage, serverNow === 5000 ? 'leaders' : 'waiting');
    assert.equal(app.feature.store.getState().exchangeReplay, null);
    assert.equal(app.feature.store.getState().presented, true);
    assert.equal(app.feature.store.getState().gainLanded, true);
    if (serverNow === 5000) assert.equal(app.feature.store.getState().closing.startsAt, 0);
    else assert.equal(app.feature.store.getState().closing, null);
    app.dispose();
  }
});

test('the authoritative result/break schedule opens the wheel even when the start snapshot had no wheel policy', () => {
  for (const event of ['roundEnded', 'breakStarted']) {
    let now = 1000;
    const app = harness(null, undefined, { now: () => now });
    const policy = { ...seatingPayload().infortune, optional: false, afterResults: true, resultsReadyAt: 1000, resultsVisibleAt: 1000, openedAt: 21000 };
    const value = { ...payload, infortune: policy, nextStartAt: 76000 };
    if (event === 'breakStarted') delete value.results;
    app.handlers.get(event)(value);
    assert.equal(app.feature.store.getState().stage, 'scheduled');
    app.session.transitionPhase('intermission', payload);
    now = 21000; app.expire(20000);
    assert.equal(app.feature.store.getState().visible, true);
    assert.equal(app.feature.store.getState().stage, 'wheel');
    assert.equal(app.feature.store.getState().plateau.self.userId, 1);
    app.feature.complete({ kind: 'pass' });
    assert.equal(app.feature.store.getState().stage, 'waiting');
    app.dispose();
  }
});

test("results stay visible until the server's wheel opening, then waiting ends with the next round", () => {
  let now = 1000;
  const policy = { ...infortuneRoundPolicy({ enabled: true, round: 1, totalRounds: 5 }), optional: false, afterResults: true,
    openedAt: 12000, resultsReadyAt: 1000 };
  const app = harness(policy, undefined, { now: () => now });
  app.handlers.get('roundEnded')({ ...payload, infortune: policy });
  assert.equal(app.feature.store.getState().visible, false);
  assert.equal(app.feature.store.getState().stage, 'scheduled');
  now = 11999; app.expire(11000);
  assert.equal(app.feature.store.getState().visible, false);
  now = 12000; app.expire(1);
  assert.equal(app.feature.store.getState().visible, true);
  app.feature.complete({ label: '500 €' });
  assert.equal(app.feature.store.getState().stage, 'waiting');
  app.session.startRound({ roomId: 'room', roundId: 'r2' });
  assert.equal(app.feature.store.getState().visible, false);
  app.dispose();
});

test("reconnection restores a scheduled wheel regardless of snapshot/hydration ordering", () => {
  for (const hydrateFirst of [true, false]) {
    const policy = { ...infortuneRoundPolicy({ enabled: true, round: 1, totalRounds: 5 }), afterResults: true,
      openedAt: 12000, resultsReadyAt: 1000 };
    const app = harness(policy);
    const snapshot = { roomId: 'room', capturedAt: 7000, phase: 'results',
      lastRoundResults: { payload: { ...payload, infortune: policy } }, breakState: { ...payload, nextStartAt: 67000 } };
    if (hydrateFirst) app.session.hydrateSnapshot(snapshot);
    app.kernel.commands.session.patch({ resumeSnapshot: snapshot });
    if (!hydrateFirst) app.session.hydrateSnapshot(snapshot);
    assert.equal(app.feature.store.getState().stage, 'scheduled');
    assert.equal(app.feature.store.getState().opensAt, 6000);
    assert.equal([...app.timers.values()].filter(timer => timer.delay === 5000).length, 1);
    app.dispose();
  }
});

test("the wheel reserves room time only between tournament rounds and preserves result reading time", () => {
  assert.equal(infortuneRoundPolicy({ enabled: false, round: 1, totalRounds: 5 }), null);
  assert.equal(infortuneRoundPolicy({ enabled: true, training: true, round: 1, totalRounds: 5 }), null);
  assert.equal(infortuneRoundPolicy({ enabled: true, round: 5, totalRounds: 5 }), null);
  const policy = infortuneRoundPolicy({ enabled: true, round: 4, totalRounds: 5 });
  assert.equal(policy.windowMs, 50000, "the fourth spin reserves ten seconds for exchanges");
  assert.equal(infortuneBreakDuration(30000, policy, 1000, 6000), 55100);
  assert.equal(infortuneBreakDuration(45000, policy, 1000, 61000), 100);
  assert.equal(infortuneBreakDuration(45000, null, 1000, 6000), 45000);
});

test('login and reconnect restore the wheel from the hydrated session without a resume preview', () => {
  for (const entryKind of ['join', 'resume']) for (const alreadySpun of [false, true]) {
    const value = seatingPayload([1]);
    const policy = { ...value.infortune, optional: false, afterResults: true, resultsReadyAt: 1000, openedAt: 21000 };
    const ledger = createInfortuneLedger();
    const server = createInfortuneRoundEconomy({ ledger, policy, groups: policy.groups, now: () => 30000,
      random: () => .4, timers: { setTimeout() { return 1; }, clearTimeout() {} } });
    if (alreadySpun) server.submit('user:1', { type: 'spin', skip: true });
    const commands = [];
    const app = harness(null, (action, ack) => { commands.push(action.type); ack(server.submit('user:1', action)); });
    const infortune = { ...policy, economy: server.snapshot() };
    app.session.hydrateSnapshot({ roomId: 'room', phase: 'results', capturedAt: 30000,
      lastRoundResults: { payload: { ...payload, infortune } },
      breakState: { ...payload, infortune, nextStartAt: 76000 } }, { entryKind });
    assert.equal(app.kernel.getState().session.resumeSnapshot, null);
    assert.equal(app.feature.store.getState().visible, true);
    assert.equal(app.feature.store.getState().stage, alreadySpun ? 'waiting' : 'wheel');
    if (alreadySpun) {
      assert.equal(app.feature.store.getState().result.automatic, true);
      assert.equal(app.feature.store.getState().result.after, ledger.banks.get('user:1'));
    }
    assert.ok(!commands.includes('spin'), 'restoring a result must never award another spin');
    app.session.startRound({ roomId: 'room', roundId: 'r2' });
    assert.equal(app.session.getHydratedSnapshot(), null);
    assert.equal(app.feature.store.getState().visible, false);
    app.dispose(); server.dispose();
  }
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

test("returning after the server deadline releases results even if all local timers were suspended", async () => {
  let now = 1000; const listeners = new Set();
  const documentTarget = { visibilityState: "hidden", addEventListener(event, fn) { listeners.add(fn); }, removeEventListener(event, fn) { listeners.delete(fn); } };
  const app = harness(undefined, undefined, { now: () => now, documentTarget, windowTarget: null });
  const spin = app.feature.begin("r1", payload, now);
  app.feature.launched(); now += 120_000; documentTarget.visibilityState = "visible";
  for (const fn of listeners) fn();
  assert.equal((await spin.promise).payload, payload);
  assert.equal(app.feature.store.getState().visible, false);
  assert.equal(app.timers.size, 0); app.dispose(); assert.equal(listeners.size, 0);
});

test('returning after the deadline fetches the private automatic result even when all economy events were missed', () => {
  let now = 1000; const listeners = new Set(), commands = [];
  const documentTarget = { visibilityState: 'hidden', addEventListener(event, fn) { listeners.add(fn); }, removeEventListener(event, fn) { listeners.delete(fn); } };
  const policy = { ...seatingPayload([1]).infortune, afterResults: true, openedAt: 1000 };
  const server = createInfortuneRoundEconomy({ ledger: createInfortuneLedger(), policy, groups: policy.groups, now: () => now,
    random: () => .2, timers: { setTimeout() { return 1; }, clearTimeout() {} } });
  const app = harness(policy, (action, ack) => { commands.push(action.type); ack(server.submit('user:1', action)); },
    { now: () => now, documentTarget, windowTarget: null });
  app.feature.begin('r1', { ...payload, infortune: { ...policy, economy: server.snapshot() } }, now);
  now += 120000; documentTarget.visibilityState = 'visible';
  for (const fn of listeners) fn();
  const state = app.feature.store.getState();
  assert.equal(state.stage, 'waiting'); assert.equal(state.result.automatic, true);
  assert.equal(state.result.after, 500); assert.equal(state.economy.members['user:1'].result.sector.label, '500 €');
  assert.ok(!commands.includes('spin'));
  app.dispose(); server.dispose(); assert.equal(listeners.size, 0);
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

test('optional wheels stay in results without mounting the scene; a click opts in and the common car still opens', () => {
  for (const click of [false, true]) {
    let now = 1000, app;
    const policy = { ...seatingPayload().infortune, afterResults: true, resultsVisibleAt: now, openedAt: 21000 };
    const server = createInfortuneRoundEconomy({ ledger: createInfortuneLedger(), policy, groups: policy.groups, now: () => now, random: () => .2,
      timers: { setTimeout() { return 1; }, clearTimeout() {} }, onChange: economy => app?.handlers.get('infortuneEconomy')({ ...payload, economy }) });
    app = harness(policy, (action, ack) => ack(server.submit('user:1', action)), { now: () => now });
    app.handlers.get('roundEnded')({ ...payload, infortune: { ...policy, economy: server.snapshot() } });
    assert.equal(app.feature.store.getState().stage, 'optional');
    assert.equal(app.feature.store.getState().visible, false); assert.equal(app.feature.store.getState().preparation, null);
    if (click) {
      app.feature.requestWheel(); assert.equal(server.snapshot().members['user:1'].optedIn, true);
      assert.equal(app.feature.store.getState().speaking, true); assert.equal(app.feature.store.getState().visible, false);
      app.feature.enterWheel(); assert.equal(app.feature.store.getState().visible, true);
      app.feature.autoSpin();
    }
    now = 21000; server.submit('user:1', { type: 'snapshot' });
    assert.equal(app.feature.store.getState().result.automatic, true);
    assert.equal(app.feature.store.getState().result.after, 500);
    assert.equal(app.feature.store.getState().visible, click);
    app.handlers.get('breakStarted')({ ...payload, serverNow: now, wheelClosing: { id: 'car', startsAt: now, endsAt: now + 5000, leaders: [] } });
    assert.equal(app.feature.store.getState().stage, 'leaders'); assert.equal(app.feature.store.getState().visible, true);
    app.dispose(); server.dispose();
  }
});

test('Mauresque reminds only after the first-round vocabulary ends or is skipped, without joining the wheel', () => {
  for (const noVocabAnimation of [false, true]) {
    const commands = [];
    const policy = { ...seatingPayload().infortune, afterResults: true, resultsVisibleAt: 1000, openedAt: 21000 };
    const app = harness(policy, action => commands.push(action));
    try {
      app.feature.schedule({ ...payload, infortune: policy });
      const vocabulary = { phase: 'results', roundId: 'r1' };
      for (const state of [vocabulary, { ...vocabulary, vocabDecisionRoundId: 'r1', vocabOverlayOpen: true },
        { ...vocabulary, vocabDecisionRoundId: 'r1', vocabOverlayRequest: { id: 1 } }]) {
        assert.equal(app.feature.showWheelReminder(isResultsVocabularyReady(state)), false);
      }
      assert.equal(app.feature.showWheelReminder(isResultsVocabularyReady({ ...vocabulary,
        vocabDecisionRoundId: 'r1', noVocabAnimation })), true);
      const event = wheelInvitationEvent(app.feature.store.getState());
      assert.equal(event.text, 'cliquez moi dessus pour lancer la roue!');
      completeWheelInvitation(app.feature, event);
      const state = app.feature.store.getState();
      assert.equal(state.reminderSpeaking, false);
      assert.equal(state.entered, false);
      assert.equal(state.visible, false);
      assert.equal(app.feature.showWheelReminder(true), false, 'one reminder per round');
      assert.deepEqual(commands, [], 'the reminder never opts in or spins');
    } finally { app.dispose(); }
  }
});

test('clicking during the reminder still waits for the accepted invitation before opening the wheel', () => {
  const commands = [];
  const policy = { ...seatingPayload().infortune, afterResults: true, resultsVisibleAt: 1000, openedAt: 21000 };
  const app = harness(policy, (action, ack) => { commands.push(action.type); ack({ ok: true }); });
  try {
    app.feature.schedule({ ...payload, infortune: policy });
    app.feature.showWheelReminder(true);
    const reminder = wheelInvitationEvent(app.feature.store.getState());
    app.feature.requestWheel();
    completeWheelInvitation(app.feature, reminder);
    assert.deepEqual(commands, ['join']);
    assert.equal(app.feature.store.getState().reminderSpeaking, false);
    assert.equal(app.feature.store.getState().speaking, true);
    assert.equal(app.feature.store.getState().visible, false);
    completeWheelInvitation(app.feature, wheelInvitationEvent(app.feature.store.getState()));
    assert.equal(app.feature.store.getState().visible, true);
    assert.equal(app.feature.showWheelReminder(true), false);
  } finally { app.dispose(); }
});

test('later rounds, hidden tabs and expired invitations cannot trigger the first-round reminder', () => {
  for (const round of [1, 2, 3, 4]) {
    let now = 1000;
    const documentTarget = { hidden: true };
    const policy = { ...seatingPayload().infortune, ...infortuneRoundPolicy({ enabled: true, round, totalRounds: 5 }),
      afterResults: true, resultsVisibleAt: 1000, openedAt: 21000 };
    const app = harness(policy, undefined, { documentTarget, now: () => now });
    try {
      app.feature.schedule({ ...payload, infortune: policy });
      assert.equal(app.feature.showWheelReminder(true), false);
      documentTarget.hidden = false;
      if (round === 1) now = 21000;
      assert.equal(app.feature.showWheelReminder(true), false);
      assert.equal(app.feature.store.getState().reminderSpeaking, false);
    } finally { app.dispose(); }
  }
});

test('resuming the same results does not replay the reminder; stale completion cannot dismiss a new one', () => {
  const policy = { ...seatingPayload().infortune, afterResults: true, resultsVisibleAt: 1000, openedAt: 21000 };
  const app = harness(policy);
  try {
    app.feature.schedule({ ...payload, infortune: policy });
    app.feature.showWheelReminder(true);
    const oldReminder = wheelInvitationEvent(app.feature.store.getState());
    app.session.startRound({ roomId: 'room', roundId: 'r2', infortune: policy });
    app.session.startRound({ roomId: 'room', roundId: 'r1', infortune: policy });
    app.feature.schedule({ ...payload, infortune: policy });
    assert.equal(app.feature.showWheelReminder(true), false);
    app.session.startRound({ roomId: 'room', roundId: 'new-tournament-r1', infortune: policy });
    app.feature.schedule({ ...payload, roundId: 'new-tournament-r1', infortune: policy });
    assert.equal(app.feature.showWheelReminder(true), true);
    completeWheelInvitation(app.feature, oldReminder);
    assert.equal(app.feature.store.getState().reminderSpeaking, true);
  } finally { app.dispose(); }
});

test('rejoining an optional wheel restores an accepted invitation or its completed automatic gain', () => {
  for (const finished of [false, true]) {
    const policy = { ...seatingPayload().infortune, afterResults: true, resultsVisibleAt: 1000, openedAt: 21000 };
    const server = createInfortuneRoundEconomy({ ledger: createInfortuneLedger(), policy, groups: policy.groups, now: () => 5000, random: () => .2,
      timers: { setTimeout() { return 1; }, clearTimeout() {} } });
    server.submit('user:1', { type: 'join' });
    if (finished) server.submit('user:1', { type: 'spin', skip: true });
    const app = harness(policy, (action, ack) => ack(server.submit('user:1', action)), { now: () => 5000 });
    const infortune = { ...policy, economy: server.snapshot() };
    app.session.hydrateSnapshot({ roomId: 'room', phase: 'results', capturedAt: 5000,
      lastRoundResults: { payload: { ...payload, infortune } }, breakState: { ...payload, infortune, nextStartAt: 61000 } });
    const state = app.feature.store.getState();
    assert.equal(state.visible, !finished);
    if (finished) { assert.equal(state.result.automatic, true); assert.equal(state.result.after, 500); }
    else { assert.equal(state.entered, true); assert.equal(state.stage, 'wheel'); }
    app.dispose(); server.dispose();
  }
});

const groupedPolicy = { ...infortuneRoundPolicy({ enabled: true, round: 1, totalRounds: 5 }), plateauVersion: 1 };
const seatingPayload = (ids = [1, 2, 3]) => ({ roomId: "room", roundId: "r1", infortune: { ...groupedPolicy, openedAt: 7000,
  groups: buildInfortunePlateaus({ roomId: "room", roundId: "r1", players: ids.map(userId => ({ userId, nick: `Joueur ${userId}` })), random: () => .5 }) } });

test('preparation starts with results and keeps the same plateau at opening without early commands', () => {
  let now = 1000; const commands = [];
  const value = seatingPayload();
  const policy = { ...value.infortune, optional: false, afterResults: true, resultsReadyAt: 1000, resultsVisibleAt: 7000, openedAt: 27000 };
  const app = harness(policy, value => commands.push(value), { now: () => now });
  app.handlers.get('roundEnded')({ ...payload, infortune: policy });
  assert.equal(app.feature.store.getState().preparation, null);
  now = 7000; app.expire(6000);
  const prepared = app.feature.store.getState().preparation;
  assert.ok(prepared.plateau); assert.equal(app.feature.store.getState().visible, false);
  app.feature.ready(); app.feature.complete(); assert.deepEqual(commands, []);
  now = 27000; app.expire(20000);
  assert.equal(app.feature.store.getState().plateau, prepared.plateau);
  assert.equal(app.feature.store.getState().stage, 'wheel');
  app.dispose(); assert.equal(app.timers.size, 0);
});

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
  assert.equal(app.feature.store.getState().launchUntil, null, "the countdown starts only when the stage is ready");
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

function economicHarness({ round = 4, ids = [1, 2, 3], omitFirstSpinAck = false, alreadySpun = false, now = () => 1000, documentTarget, serverTimers, afterResults = false } = {}) {
  const seating = seatingPayload(ids), ledger = createInfortuneLedger();
  const policy = { ...groupedPolicy, ...infortuneRoundPolicy({ enabled: true, round, totalRounds: 5 }), openedAt: 1000, afterResults };
  let app, spinRequests = 0;
  const server = createInfortuneRoundEconomy({ ledger, policy, groups: seating.infortune.groups, now, random: () => 0.4,
    timers: serverTimers || { setTimeout() { return 1; }, clearTimeout() {} },
    onChange(economy) { if (!omitFirstSpinAck) app?.handlers.get("infortuneEconomy")({ ...payload, economy }); } });
  const submit = server.submit;
  server.submit = (id, action) => {
    const reply = submit(id, action);
    if (id !== "user:1" && action.type === "spin") submit(id, { type: "presented" });
    return reply;
  };
  if (alreadySpun) server.submit("user:1", { type: "spin", index: exchangeIndex });
  app = harness(policy, (value, ack) => {
    const reply = server.submit("user:1", value);
    if (value.type === "spin" && ++spinRequests === 1 && omitFirstSpinAck) return;
    if (value.type === "presented" && spinRequests === 1 && omitFirstSpinAck) return;
    ack(reply);
  }, { now, documentTarget });
  const infortune = { ...policy, groups: seating.infortune.groups, economy: server.snapshot() };
  const spin = app.feature.begin("r1", { ...payload, infortune }, 1000);
  return { ...app, server, ledger, spin, get spinRequests() { return spinRequests; } };
}

test('launch acknowledgement exposes the credited bank before the sector and releases it only on animation landing', () => {
  const app = economicHarness({ round: 1 });
  app.feature.launched({ quality: { kind: 'perfect' } });
  assert.equal(app.ledger.banks.get('user:1'), 100);
  assert.equal(app.feature.store.getState().economy.members['user:1'].launchBank, 100);
  app.server.submit('user:2', { type: 'spin', index: fiveHundredIndex });
  assert.equal(app.feature.store.getState().economy.members['user:1'].launchBank, 100, 'a later public opponent update retains the private launch receipt');
  assert.equal(app.feature.store.getState().launchGainLanded, false);
  const key = app.feature.store.getState().key;
  app.feature.landLaunch(key - 1); assert.equal(app.feature.store.getState().launchGainLanded, false);
  app.feature.landLaunch(key); assert.equal(app.feature.store.getState().launchGainLanded, true);
  app.feature.recordResult({ index: fiveHundredIndex, kind: 'amount', amount: 500, launchQuality: { kind: 'perfect' } });
  assert.equal(app.ledger.banks.get('user:1'), 600);
  assert.equal(app.feature.store.getState().gainLanded, false);
  app.dispose(); app.server.dispose();
});

test("opponents' results update visible banks while the local wheel is still running", async () => {
  const app = economicHarness({ round: 1 }); app.feature.launched();
  const initial = app.feature.store.getState().economy;
  assert.equal(initial.members["user:2"].bank, 0);
  assert.equal(initial.members["user:2"].spin, "pending");
  app.server.submit("user:2", { type: "spin", index: fiveHundredIndex, quality: "perfect" });
  const updated = app.feature.store.getState().economy;
  assert.equal(updated.members["user:2"].bank, 600);
  assert.equal(updated.members["user:2"].spin, "done");
  assert.equal(updated.members["user:1"].spin, "pending");
  assert.equal(app.feature.store.getState().stage, "wheel");
  assert.equal(app.feature.store.getState().result, null);
  assert.equal(app.spinRequests, 0);
  app.handlers.get("infortuneEconomy")({ ...payload, economy: initial });
  app.handlers.get("infortuneEconomy")({ ...payload, roundId: "old", economy: initial });
  assert.equal(app.feature.store.getState().economy, updated, "late snapshots cannot roll back an opponent's gain");
  app.server.submit("user:3", { type: "spin", index: passIndex });
  const result = { index: fiveHundredIndex, kind: "amount", amount: 500 };
  app.feature.recordResult(result); app.feature.complete(result);
  assert.equal((await app.spin.promise).wheelResult, result);
  app.dispose(); app.server.dispose();
});

test('landing releases the counter without ending the presentation or accepting a stale wheel callback', () => {
  const app = economicHarness({ round: 1 });
  const key = app.feature.store.getState().key;
  app.feature.recordResult({ index: fiveHundredIndex, kind: 'amount', amount: 500 });
  app.feature.landResult(key - 1); assert.equal(app.feature.store.getState().gainLanded, false);
  app.feature.landResult(key);
  const state = app.feature.store.getState();
  assert.equal(state.gainLanded, true); assert.equal(state.presented, false); assert.equal(state.stage, 'wheel');
  assert.equal(app.ledger.banks.get('user:1'), 500); assert.equal(app.spinRequests, 1);
  app.dispose(); app.server.dispose();
});

test("fourth-round updates conceal opponents but preserve the viewer's private bank", async () => {
  const app = economicHarness(); app.feature.launched();
  app.ledger.banks.set("user:2", 123456);
  app.server.submit("user:2", { type: "spin", index: fiveHundredIndex, quality: "perfect" });
  const economy = app.feature.store.getState().economy;
  assert.equal(economy.members["user:2"].spin, "done");
  assert.equal(economy.hidden, true);
  assert.equal(economy.members["user:1"].bank, 0);
  assert.ok(!("bank" in economy.members["user:2"]));
  assert.ok(!("bank" in economy.members["user:3"]));
  assert.ok(!JSON.stringify(economy).includes("123456"));
  assert.equal(app.feature.store.getState().stage, "wheel");
  app.dispose(); app.server.dispose();
  assert.equal((await app.spin.promise).cancelled, true);
});

test("recording the real result waits for the presentation, then allows a choice and waits for reciprocal settlement", async () => {
  const app = economicHarness(); app.feature.launched();
  const result = { index: exchangeIndex, kind: "exchange", label: "Échange", launchQuality: { kind: "perfect" } };
  app.feature.recordResult(result);
  assert.equal(app.ledger.banks.get("user:1"), 100);
  assert.equal(app.feature.store.getState().stage, "wheel");
  app.feature.complete(result); assert.equal(app.feature.store.getState().stage, "exchange");
  app.server.submit("user:2", { type: "spin", index: fiveHundredIndex });
  app.server.submit("user:3", { type: "spin", index: passIndex });
  assert.equal(app.feature.store.getState().stage, "exchange");
  app.feature.chooseExchange("user:2");
  assert.equal(app.feature.store.getState().stage, "settled");
  assert.equal(app.ledger.banks.get("user:1"), 500); assert.equal(app.ledger.banks.get("user:2"), 100);
  app.expire(INFORTUNE_EXCHANGE_STEP_MS); assert.equal((await app.spin.promise).wheelResult, result);
  assert.equal(app.timers.size, 0); app.dispose(); app.server.dispose();
});

test('declining locally is sent to the server before the other players finish, and survives a snapshot', async () => {
  const app = economicHarness();
  app.feature.recordResult({ index: exchangeIndex }); app.feature.complete();
  assert.equal(app.feature.store.getState().stage, 'exchange');
  assert.equal(app.feature.store.getState().choiceUntil, null, 'the group is not ready yet');
  assert.equal(app.feature.store.getState().spinUntil, 41_000);
  app.feature.chooseExchange(null);
  assert.equal(app.feature.store.getState().stage, 'exchange-wait');
  assert.equal(app.server.snapshot().members['user:1'].choiceMade, true);
  assert.equal(app.server.snapshot().members['user:1'].target, null);
  app.handlers.get('connect')();
  assert.equal(app.feature.store.getState().economy.members['user:1'].target, null);
  app.server.submit('user:2', { type: 'spin', index: passIndex });
  app.server.submit('user:3', { type: 'spin', index: passIndex });
  assert.equal((await app.spin.promise).cancelled, false);
  app.dispose(); app.server.dispose();
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

test("an exchange between the two opponents is replayed even when the viewer does not exchange", async () => {
  const app = economicHarness(); app.feature.launched();
  [100, 500, 900].forEach((bank, index) => app.ledger.banks.set(`user:${index + 1}`, bank));
  app.feature.recordResult({ index: passIndex }); app.feature.complete();
  app.server.submit("user:2", { type: "spin", index: exchangeIndex });
  app.server.submit("user:3", { type: "spin", index: passIndex });
  app.server.submit("user:2", { type: "exchange", target: "user:3" });
  const replay = app.feature.store.getState().exchangeReplay;
  assert.equal(replay.activeExchange.from, "user:2"); assert.equal(replay.activeExchange.to, "user:3");
  assert.equal(replay.banks["user:1"], 100);
  assert.equal(app.feature.store.getState().visible, true);
  app.expire(INFORTUNE_EXCHANGE_STEP_MS);
  await app.spin.promise; assert.equal(app.timers.size, 0); app.dispose(); app.server.dispose();
});

test("all three swaps finish in order; duplicate snapshots never restart them and leaving cancels the replay", async () => {
  for (const leave of [false, true]) {
    const app = economicHarness(); app.feature.launched();
    app.feature.recordResult({ index: exchangeIndex }); app.feature.complete();
    for (const id of [2,3]) app.server.submit(`user:${id}`, { type: "spin", index: exchangeIndex });
    app.server.submit("user:2", { type: "exchange", target: "user:3" });
    app.server.submit("user:3", { type: "exchange", target: "user:1" });
    app.feature.chooseExchange("user:2");
    assert.equal(app.feature.store.getState().exchangeReplay.exchanges.length, 3);
    app.expire(INFORTUNE_EXCHANGE_STEP_MS);
    assert.equal(app.feature.store.getState().exchangeReplay.index, 1);
    app.handlers.get("infortuneEconomy")({ ...payload, economy: app.server.snapshot() });
    assert.equal(app.feature.store.getState().exchangeReplay.index, 1);
    if (leave) app.dispose();
    else {
      app.expire(INFORTUNE_EXCHANGE_STEP_MS); assert.equal(app.feature.store.getState().exchangeReplay.index, 2);
      app.expire(INFORTUNE_EXCHANGE_STEP_MS);
    }
    assert.equal((await app.spin.promise).cancelled, leave); assert.equal(app.timers.size, 0);
    app.dispose(); app.server.dispose();
  }
});

test("deadline settlement is still shown before results without changing the room clock", async () => {
  const app = economicHarness(); app.feature.launched();
  app.feature.recordResult({ index: passIndex }); // The wheel presentation has not finished yet.
  app.server.submit("user:2", { type: "spin", index: exchangeIndex });
  app.server.submit("user:3", { type: "spin", index: passIndex });
  app.server.submit("user:2", { type: "exchange", target: "user:3" });
  app.server.close(); // A delayed presentation must still play the collected swaps.
  assert.equal(app.feature.store.getState().stage, "wheel");
  app.expire(50000);
  assert.equal(app.feature.store.getState().stage, "settled");
  assert.equal(app.feature.store.getState().exchangeReplay.activeExchange.from, "user:2");
  app.expire(INFORTUNE_EXCHANGE_STEP_MS);
  assert.equal((await app.spin.promise).cancelled, false);
  assert.equal(app.timers.size, 0); app.dispose(); app.server.dispose();
});

test('returning before the exchange deadline keeps the avatars selectable; a later return explicitly expires the choice', () => {
  for (const elapsed of [3000, 11000]) {
    let time = 1000, timerId = 0;
    const jobs = new Map();
    const serverTimers = { setTimeout(fn, delay) { jobs.set(++timerId, { fn, at: time + delay }); return timerId; }, clearTimeout(id) { jobs.delete(id); } };
    const documentTarget = new EventTarget();
    documentTarget.hidden = false; documentTarget.visibilityState = 'visible';
    const app = economicHarness({ now: () => time, documentTarget, serverTimers, afterResults: true });
    app.server.submit('user:2', { type: 'spin', index: passIndex });
    app.server.submit('user:3', { type: 'spin', index: passIndex });
    app.feature.recordResult({ index: exchangeIndex, kind: 'exchange', label: 'Échange' });
    documentTarget.hidden = true; documentTarget.visibilityState = 'hidden'; documentTarget.dispatchEvent(new Event('visibilitychange'));
    assert.equal(app.feature.store.getState().stage, 'exchange');
    time += elapsed;
    for (const [id, job] of [...jobs]) if (job.at <= time) { jobs.delete(id); job.fn(); }
    documentTarget.hidden = false; documentTarget.visibilityState = 'visible'; documentTarget.dispatchEvent(new Event('visibilitychange'));
    const member = app.feature.store.getState().economy.members['user:1'];
    if (elapsed < 10000) {
      assert.equal(member.choiceExpired, false); assert.equal(app.feature.store.getState().stage, 'exchange');
      app.feature.chooseExchange('user:2');
      assert.equal(app.server.snapshot().members['user:1'].target, 'user:2');
    } else {
      assert.equal(member.choiceExpired, true); assert.equal(member.choiceMade, true); assert.equal(member.target, null);
      assert.notEqual(app.feature.store.getState().stage, 'exchange');
    }
    app.dispose(); app.server.dispose();
  }
});

test('a late local exchange animation cannot replace the automatic result committed while away', () => {
  const app = economicHarness();
  app.feature.launched({ quality: { kind: 'good' } });
  app.server.submit('user:1', { type: 'spin', skip: true });
  const committed = app.feature.store.getState().economy.members['user:1'].result;
  assert.equal(committed.automatic, true);
  assert.equal(committed.sector.kind, 'amount');
  assert.equal(app.feature.store.getState().stage, 'exchange-wait');
  app.feature.complete({ index: exchangeIndex, kind: 'exchange', label: 'Échange' });
  assert.deepEqual(app.feature.store.getState().result, committed);
  assert.equal(app.feature.store.getState().stage, 'exchange-wait');
  app.dispose(); app.server.dispose();
});

test("reconnecting after an exchange result resumes the choice, and a late joiner still goes to results", async () => {
  const resumed = economicHarness({ alreadySpun: true });
  assert.equal(resumed.feature.store.getState().stage, "exchange");
  resumed.server.submit("user:2", { type: "spin", index: passIndex });
  resumed.server.submit("user:3", { type: "spin", index: passIndex });
  assert.equal(resumed.feature.store.getState().stage, "exchange");
  assert.equal(resumed.spinRequests, 0); resumed.dispose(); resumed.server.dispose();
  assert.equal((await resumed.spin.promise).cancelled, true);
  const late = economicHarness({ ids: [2, 3, 4] });
  assert.equal((await late.spin.promise).cancelled, false);
  assert.equal(late.feature.store.getState().visible, false); late.dispose(); late.server.dispose();
});
