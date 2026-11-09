import test from "node:test";
import assert from "node:assert/strict";
import { createApplicationKernel } from "../../../app/core/createApplicationKernel.js";
import { createTournamentFinaleFeature, FINALE_RESULT_MS } from "./createTournamentFinaleFeature.js";
import { createTournamentWheelFinale } from "../../../../server/infortune/tournamentFinale.js";
import { createGameAudioFocus } from '../../audio/gameAudioFocus.js';
import { createFeatureStore } from '../../../app/core/createFeatureStore.js';

async function harness({ clockSkew = 0, introMs = 0, creditBeforeAnswer = false, holdPublicUpdates = false } = {}) {
  let time = 1000, id = 0, drop = 0;
  const jobs = new Map(), handlers = new Map(), sent = [], awards = [], publicUpdates = [];
  const preferences = createFeatureStore({ gobblarsBalance: 100 });
  const timers = { setTimeout(fn, delay) { const key = ++id; jobs.set(key, { fn, at: time + delay }); return key; }, clearTimeout(key) { jobs.delete(key); } };
  const server = createTournamentWheelFinale({ roomId: "room", tournamentId: "t1", startsAt: 41_000, introStartsAt: 41_000 - introMs,
    puzzle: { id: "p", category: "Orientation", kind: "riddle", clue: "Mon aiguille indique le nord.", answer: "boussole" },
    ranking: [{ userId: 1, nick: "Alice", points: 30, basePoints: 30, gobbles: 0, roundScoreSum: 100, pos: 1 },
      { userId: 2, nick: "Bob", points: 25, basePoints: 25, gobbles: 0, roundScoreSum: 90, pos: 2 }],
    freeLetters: [], ledger: { banks: new Map([["user:1", 500], ["user:2", 500]]) }, timers, now: () => time,
    onChange: value => { publicUpdates.push(value); if (!holdPublicUpdates) handlers.get("infortuneFinale")?.(value); }, onWin: (...value) => awards.push(value) });
  const realtime = { bind(values) { for (const entry of Object.entries(values)) handlers.set(...entry); return () => handlers.clear(); },
    emit(event, value, ack) {
      sent.push(value); const reply = server.submit("user:1", value);
      if (creditBeforeAnswer && value.type === 'answer' && reply.snapshot?.outcome.correct) {
        preferences.set('gobblarsBalance', 150);
        reply.snapshot.gobblarsBalance = 100;
      }
      if (drop-- > 0) return;
      ack(reply);
    } };
  const kernel = createApplicationKernel({ ports: { realtime } });
  kernel.features.define('preferences', () => ({ store: preferences, set: preferences.set }));
  const audioFocus = createGameAudioFocus();
  kernel.features.define("infortuneFinale", context => createTournamentFinaleFeature(context, { timers, now: () => time + clockSkew, audioFocus }));
  kernel.commands.session.patch({ isLoggedIn: true, nickname: "Alice" });
  kernel.commands.game.setCurrentRoomId("room"); kernel.commands.navigation.go("live");
  const lease = kernel.features.acquire("infortuneFinale"), feature = lease.feature;
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  async function at(target) {
    for (;;) {
      const next = [...jobs].filter(([, job]) => job.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      time = next[1].at; jobs.delete(next[0]); next[1].fn(); await flush();
    }
    time = target; await flush();
  }
  await flush();
  return { feature, kernel, server, at, jobs, handlers, sent, awards, publicUpdates, flush, audioFocus, preferences,
    suspendUntil(target) { time = target; }, dropNext() { drop = 1; }, async dispose() { lease.release(); server.dispose(); await flush(); } };
}

test('the results countdown reaches zero at the announcement; the two playing minutes start afterward', async () => {
  const h = await harness({ introMs: 4000 });
  try {
    assert.equal(h.feature.store.getState().startsIn, 36);
    await h.at(36_000); assert.equal(h.feature.store.getState().startsIn, 1); assert.equal(h.feature.store.getState().phase, 'waiting');
    await h.at(37_000); assert.equal(h.feature.store.getState().startsIn, 0); assert.equal(h.feature.store.getState().phase, 'intro');
    await h.at(41_000); assert.equal(h.feature.store.getState().phase, 'playing'); assert.equal(h.feature.store.getState().seconds, 120);
  } finally { await h.dispose(); }
});

test('live wins announce once while snapshots and reconnects stay silent', async () => {
  const h = await harness(), heard = [];
  const release = h.feature.subscribeWins(rows => heard.push(rows.map(row => row.nick)));
  try {
    await h.at(42_000);
    h.server.submit('user:2', { type: 'answer', answer: 'boussole' }); await h.flush();
    assert.deepEqual(heard, [['Bob']]);
    h.handlers.get('infortuneFinale')(h.server.publicSnapshot()); h.handlers.get('connect')(); await h.flush();
    assert.deepEqual(heard, [['Bob']]);
  } finally { release(); await h.dispose(); }
});

test('returning from the home lobby restores a committed purchase whose acknowledgement was lost', async () => {
  const h = await harness({ introMs: 4000 });
  try {
    await h.at(43_000); h.dropNext();
    const pendingPurchase = h.feature.store.getState().controller.buyLetter('E');
    h.kernel.commands.transition.apply({ navigation: { view: 'home' }, session: { isLoggedIn: false, resumeSnapshot: null } });
    await h.flush(); await pendingPurchase;
    assert.equal(h.feature.store.getState().phase, 'idle');
    await h.at(55_000);
    h.kernel.commands.transition.apply({ navigation: { view: 'live' }, session: { isLoggedIn: true } });
    await h.flush();
    const resumed = h.feature.store.getState();
    assert.equal(resumed.phase, 'playing');
    assert.equal(resumed.seconds, 106);
    assert.deepEqual(resumed.controller.store.getState().purchased, ['E']);
    assert.equal(resumed.controller.store.getState().bank, 350);
    assert.equal(h.sent.filter(value => value.type === 'buy').length, 1);
  } finally { await h.dispose(); }
});

test('foreground recovery resynchronizes suspended timers and paid letters without replaying the intro', async () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const windowTarget = new EventTarget(), documentTarget = new EventTarget();
  documentTarget.visibilityState = 'visible';
  globalThis.window = windowTarget; globalThis.document = documentTarget;
  let h;
  try {
    h = await harness({ introMs: 4000 }); await h.at(43_000);
    await h.feature.store.getState().controller.buyLetter('E');
    documentTarget.visibilityState = 'hidden';
    const requestCount = h.sent.length;
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    assert.equal(h.sent.length, requestCount);
    h.suspendUntil(74_000);
    documentTarget.visibilityState = 'visible';
    documentTarget.dispatchEvent(new Event('visibilitychange')); await h.flush();
    assert.equal(h.feature.store.getState().phase, 'playing');
    assert.equal(h.feature.store.getState().seconds, 87);
    assert.deepEqual(h.feature.store.getState().controller.store.getState().purchased, ['E']);
    assert.equal(h.feature.store.getState().controller.store.getState().bank, 350);
    assert.equal(h.feature.store.getState().controller.store.getState().busy, false);
    // Returning after the deadline restores the answer/ranking, never a new game.
    h.suspendUntil(163_000);
    windowTarget.dispatchEvent(new Event('focus')); await h.flush();
    assert.equal(h.feature.store.getState().phase, 'ranking');
    assert.equal(h.feature.store.getState().seconds, 0);
    assert.equal(h.feature.store.getState().controller.store.getState().outcome.expired, true);
  } finally {
    await h?.dispose();
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('player presence updates keep the finale intro, purchased letters and clock intact while the lobby is closed', async () => {
  const h = await harness({ introMs: 4000 });
  try {
    const presence = { roomId: 'room', phase: 'closed', isOpen: false, miniTournamentInProgress: false, totalHumanCount: 3 };
    const controller = h.feature.store.getState().controller;
    h.handlers.get('tournamentLobbyUpdate')(presence);
    assert.equal(h.feature.store.getState().phase, 'waiting');
    await h.at(38_000);
    h.handlers.get('tournamentLobbyUpdate')(presence);
    assert.equal(h.feature.store.getState().phase, 'intro');
    await h.at(43_000);
    await controller.buyLetter('E');
    await h.at(44_000);
    h.handlers.get('tournamentLobbyUpdate')({ ...presence, totalHumanCount: 2, afkHumanCount: 1 });
    assert.equal(h.feature.store.getState().phase, 'playing');
    assert.equal(h.feature.store.getState().seconds, 117);
    assert.equal(h.feature.store.getState().controller, controller);
    assert.deepEqual(controller.store.getState().purchased, ['E']);
    assert.equal(controller.store.getState().bank, 350);
    assert.deepEqual(h.audioFocus.store.getState(), { ambient: true, effects: true });
  } finally { await h.dispose(); }
});

test('a presence update cannot cancel a pending purchase or remove the winning feedback and standings', async () => {
  const h = await harness();
  try {
    await h.at(41_000);
    const presence = { roomId: 'room', phase: 'closed', isOpen: false };
    const controller = h.feature.store.getState().controller;
    h.dropNext();
    const purchase = controller.buyLetter('E');
    h.handlers.get('tournamentLobbyUpdate')(presence);
    assert.equal(h.feature.store.getState().phase, 'playing');
    await h.at(44_000); await purchase;
    assert.deepEqual(controller.store.getState().purchased, ['E']);
    assert.equal(controller.store.getState().bank, 350);
    await h.at(46_000);
    assert.equal(await controller.submitAnswer('boussole'), true);
    h.handlers.get('tournamentLobbyUpdate')(presence);
    assert.equal(h.feature.store.getState().phase, 'result');
    await h.at(46_000 + FINALE_RESULT_MS);
    h.handlers.get('tournamentLobbyUpdate')(presence);
    assert.equal(h.feature.store.getState().phase, 'ranking');
    await h.at(161_000);
    h.handlers.get('tournamentLobbyUpdate')(presence);
    assert.equal(h.feature.store.getState().phase, 'ranking');
    await h.at(176_000);
    assert.equal(h.feature.store.getState().phase, 'idle');
    assert.equal(h.feature.store.getState().finale.closed, true);
  } finally { await h.dispose(); }
});

test('only entering the actual lobby or starting another round clears the finale in this room', async () => {
  for (const event of ['tournamentLobbyUpdate', 'roundStarted']) {
    const h = await harness();
    try {
      await h.at(43_000);
      h.handlers.get(event)({ roomId: 'other-room', phase: 'ready', isOpen: true });
      assert.equal(h.feature.store.getState().phase, 'playing');
      h.handlers.get(event)({ roomId: 'room', phase: 'ready', isOpen: true });
      assert.equal(h.feature.store.getState().phase, 'idle');
      assert.equal(h.feature.store.getState().controller, null);
      assert.equal(h.feature.store.getState().finale, null);
      assert.deepEqual(h.audioFocus.store.getState(), { ambient: false, effects: false });
    } finally { await h.dispose(); }
  }
});

test('a delayed round result cannot return the visible finale intro to the grid results', async () => {
  const h = await harness({ introMs: 4000 });
  const cachedResult = { infortuneFinale: h.server.publicSnapshot() };
  await h.at(38_000);
  assert.equal(h.feature.store.getState().phase, 'intro');
  h.handlers.get('roundEnded')(cachedResult);
  assert.equal(h.feature.store.getState().phase, 'intro');
  assert.equal(h.feature.store.getState().introElapsedMs, 1000);
  await h.dispose();
});

test('delayed break and start messages never hide the board or restart its 120-second clock', async () => {
  const h = await harness({ introMs: 4000, clockSkew: -7_200_000, holdPublicUpdates: true });
  const cachedBreak = { infortuneFinale: h.server.publicSnapshot() };
  await h.at(43_000);
  assert.equal(h.feature.store.getState().phase, 'playing');
  h.handlers.get('breakStarted')(cachedBreak);
  assert.equal(h.feature.store.getState().phase, 'playing');
  assert.equal(h.feature.store.getState().seconds, 118);
  h.handlers.get('infortuneFinale')(h.publicUpdates[0]); // The start broadcast reaches this client late.
  assert.equal(h.feature.store.getState().seconds, 118);
  await h.at(44_000);
  assert.equal(h.feature.store.getState().seconds, 117);
  await h.dispose();
});

test('a delayed newer snapshot may update standings without rewinding the finale clock', async () => {
  const h = await harness({ introMs: 4000, holdPublicUpdates: true });
  await h.at(42_000);
  h.server.submit('user:2', { type: 'answer', answer: 'boussole' });
  const update = h.publicUpdates.at(-1);
  await h.at(47_000);
  h.handlers.get('infortuneFinale')(update);
  assert.equal(h.feature.store.getState().finale.ranking.find(row => row.userId === 2).wheelPoints, 10);
  assert.equal(h.feature.store.getState().phase, 'playing');
  assert.equal(h.feature.store.getState().seconds, 114);
  await h.dispose();
});

test('a winning conversion holds only the display until landing and cannot overwrite its wallet receipt', async () => {
  const h = await harness({ creditBeforeAnswer: true }); await h.at(41_000);
  const controller = h.feature.store.getState().controller;
  await controller.submitAnswer('boussole');
  assert.equal(h.preferences.getState().gobblarsBalance, 150);
  assert.equal(h.feature.store.getState().rewardWalletHold, 100);
  h.feature.landReward(); h.feature.landReward();
  assert.equal(h.feature.store.getState().rewardWalletHold, null);
  assert.equal(h.preferences.getState().gobblarsBalance, 150, 'landing never credits money');
  assert.equal(controller.submitAnswer('boussole'), false);
  assert.equal(h.sent.filter(value => value.type === 'answer').length, 1);
  await h.dispose();
});

test('a failed answer or leaving the result releases the temporary wallet display', async () => {
  for (const answer of ['parapluie', 'boussole']) {
    const h = await harness(); await h.at(41_000);
    await h.feature.store.getState().controller.submitAnswer(answer);
    if (answer === 'parapluie') assert.equal(h.feature.store.getState().rewardWalletHold, null);
    h.feature.continueToRanking();
    assert.equal(h.feature.store.getState().rewardWalletHold, null);
    assert.equal(h.preferences.getState().gobblarsBalance, 100);
    await h.dispose();
  }
});

test("the real finale feature waits for results, survives clock skew, ranks early finishers and hands off only after final standings", async () => {
  const h = await harness({ clockSkew: 7_200_000 });
  assert.equal(h.feature.store.getState().phase, "waiting");
  assert.equal(h.feature.store.getState().startsIn, 40);
  await h.at(21_000);
  assert.equal(h.feature.store.getState().startsIn, 20);
  assert.deepEqual(h.audioFocus.store.getState(), { ambient: false, effects: false });
  await h.at(41_000); assert.equal(h.feature.store.getState().phase, "playing");
  assert.deepEqual(h.audioFocus.store.getState(), { ambient: true, effects: true });
  assert.equal(h.feature.store.getState().seconds, 120);
  await h.feature.store.getState().controller.submitAnswer("boussole");
  assert.equal(h.feature.store.getState().phase, 'result');
  assert.equal(h.feature.store.getState().controller.store.getState().outcome.points, 10);
  await h.at(41_000 + FINALE_RESULT_MS - 1);
  assert.equal(h.feature.store.getState().phase, 'result');
  await h.at(41_000 + FINALE_RESULT_MS);
  assert.equal(h.feature.store.getState().phase, "ranking");
  assert.equal(h.feature.store.getState().finale.closed, false);
  assert.equal(h.feature.store.getState().finale.ranking[0].points, 40);
  await h.at(100_000);
  h.server.submit("user:2", { type: "answer", answer: "boussole" });
  assert.equal(h.feature.store.getState().finale.ranking[1].points, 35);
  await h.at(161_000);
  assert.equal(h.feature.store.getState().phase, "ranking");
  assert.equal(h.feature.store.getState().finale.closed, true);
  await h.at(176_000); assert.equal(h.feature.store.getState().phase, "idle");
  assert.deepEqual(h.audioFocus.store.getState(), { ambient: true, effects: false });
  await h.dispose(); assert.equal(h.jobs.size, 0); assert.equal(h.handlers.size, 0);
  assert.deepEqual(h.audioFocus.store.getState(), { ambient: false, effects: false });
});

test('the shared intro reserves four seconds before the full game clock and survives reconnects', async () => {
  const h = await harness({ introMs: 4000, clockSkew: 7_200_000 });
  await h.at(36_999);
  assert.equal(h.feature.store.getState().phase, 'waiting');
  await h.at(37_000);
  assert.equal(h.feature.store.getState().phase, 'intro');
  assert.equal(h.feature.store.getState().introElapsedMs, 0);
  assert.equal(h.feature.store.getState().seconds, 120);
  assert.deepEqual(h.audioFocus.store.getState(), { ambient: true, effects: true });
  const early = h.server.submit('user:1', { type: 'buy', letter: 'E' });
  assert.equal(early.error, 'not_started');
  await h.at(39_500); h.handlers.get('connect')(); await h.flush();
  assert.equal(h.feature.store.getState().phase, 'intro');
  assert.equal(h.feature.store.getState().introElapsedMs, 2500);
  assert.equal(h.feature.store.getState().controller.store.getState().bank, 500);
  await h.at(41_000);
  assert.equal(h.feature.store.getState().phase, 'playing');
  assert.equal(h.feature.store.getState().seconds, 120);
  await h.at(45_000); h.handlers.get('connect')(); await h.flush();
  assert.equal(h.feature.store.getState().phase, 'playing');
  assert.equal(h.feature.store.getState().seconds, 116);
  await h.dispose(); assert.equal(h.jobs.size, 0);
});

test('answer feedback preserves live ranking updates, can be skipped, and is not replayed by reconnect', async () => {
  const h = await harness(); await h.at(41_000);
  await h.feature.store.getState().controller.submitAnswer('boussole');
  h.server.submit('user:2', { type: 'answer', answer: 'boussole' });
  assert.equal(h.feature.store.getState().phase, 'result');
  assert.equal(h.feature.store.getState().finale.ranking[1].points, 35);
  await h.at(42_000); h.handlers.get('connect')(); await h.flush();
  assert.equal(h.feature.store.getState().resultSeconds, 3);
  h.feature.continueToRanking(); assert.equal(h.feature.store.getState().phase, 'ranking');
  h.handlers.get('connect')(); await h.flush();
  assert.equal(h.feature.store.getState().phase, 'ranking');
  assert.equal(h.awards.length, 2);
  await h.dispose();
});

test('a correct answer just before the deadline is acknowledged before final standings without delaying the podium', async () => {
  const h = await harness(); await h.at(160_900);
  await h.feature.store.getState().controller.submitAnswer('boussole');
  await h.at(161_000); assert.equal(h.feature.store.getState().phase, 'result');
  await h.at(164_900); assert.equal(h.feature.store.getState().phase, 'ranking');
  await h.at(176_000); assert.equal(h.feature.store.getState().phase, 'idle');
  await h.dispose();
});

test("lost purchase acknowledgements debit once and reconnect restores paid letters", async () => {
  const h = await harness(); await h.at(41_000); h.dropNext();
  const controller = h.feature.store.getState().controller;
  const purchased = controller.buyLetter("E");
  await h.at(44_000); await purchased;
  assert.equal(controller.store.getState().bank, 350);
  assert.deepEqual(controller.store.getState().purchased, ["E"]);
  h.handlers.get("connect")(); await h.flush();
  assert.equal(controller.store.getState().bank, 350);
  assert.equal(h.sent.filter(value => value.type === "buy").length, 2);
  await h.at(161_000); assert.equal(h.feature.store.getState().phase, "ranking");
  await h.dispose(); assert.equal(h.jobs.size, 0);
});

test("leaving the room cancels commands and the pending finale without reopening on late events", async () => {
  const h = await harness(); await h.at(41_000); h.dropNext();
  const purchase = h.feature.store.getState().controller.buyLetter("E");
  h.kernel.commands.navigation.go("home"); await h.flush(); await purchase;
  assert.equal(h.feature.store.getState().phase, "idle");
  h.handlers.get("infortuneFinale")(h.server.publicSnapshot());
  assert.equal(h.feature.store.getState().finale, null);
  await h.dispose(); assert.equal(h.jobs.size, 0);
});

test('expiry restores the private answer for an unfinished player and publishes it only once the finale closes', async () => {
  const h = await harness(); await h.at(41_000);
  assert.equal(h.feature.store.getState().finale.answer, undefined);
  assert.equal(h.feature.store.getState().controller.store.getState().outcome, null);
  await h.at(161_000);
  assert.equal(h.feature.store.getState().phase, 'ranking');
  assert.equal(h.feature.store.getState().controller.store.getState().outcome.answer, 'boussole');
  assert.equal(h.feature.store.getState().controller.store.getState().outcome.expired, true);
  assert.equal(h.feature.store.getState().finale.answer, 'boussole');
  await h.dispose();
});
