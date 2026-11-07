import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplicationKernel } from '../../app/core/createApplicationKernel.js';
import { createFeatureStore } from '../../app/core/createFeatureStore.js';
import { createGobbleRewardPresentation, emptyGobblePresentation, GOBBLE_REWARD_TIMING as timing } from './createGobbleRewardPresentation.js';

function harness() {
  let now = 0, id = 0; const jobs = new Map(), documentTarget = { hidden: false };
  const timers = { setTimeout(fn, delay) { jobs.set(++id, { fn, at: now + delay }); return id; }, clearTimeout(id) { jobs.delete(id); } };
  const kernel = createApplicationKernel(); kernel.commands.session.patch({ isLoggedIn: true, nickname: 'Alice' });
  kernel.commands.game.setCurrentRoomId('room'); kernel.commands.navigation.go('live'); kernel.commands.game.setPhase('playing');
  const store = createFeatureStore({ bank: 500, ...emptyGobblePresentation() });
  const presentation = createGobbleRewardPresentation({ getKernel: () => kernel, store, timers, now: () => now, enabled: true, documentTarget });
  kernel.subscribe(presentation.observe);
  const start = { roomId: 'room', roundId: 'r1', infortune: { enabled: true }, tournament: { id: 't1' } };
  const result = { ...start, tournament: { id: 't1', roundAwarded: { Alice: { gobbles: 2 } } } };
  presentation.startRound(start);
  return { kernel, store, presentation, documentTarget, jobs, start, result,
    award: { kind: 'live_gobble', roomId: 'room', roundId: 'r1', gobbles: 2, amount: 10, balance: 110, ts: 42 },
    at(time) { now = time; for (const [id, job] of [...jobs]) if (job.at <= time) { jobs.delete(id); job.fn(); } },
    dispose() { presentation.reset(); kernel.dispose(); assert.equal(jobs.size, 0); } };
}

test('actual Gobble receipts split into two gains only when results are displayed, then release both counters once', () => {
  const h = harness(); h.presentation.award(h.award); h.presentation.award(h.award);
  assert.equal(h.store.getState().walletWithheld, 10);
  h.presentation.endRound(h.result); h.presentation.endRound(h.result);
  h.store.set('bank', 700);
  assert.equal(h.store.getState().gobbleReward.stage, 'pending');
  assert.equal(h.store.getState().bankHold, 500);
  h.kernel.commands.game.setPhase('results');
  assert.deepEqual(h.store.getState().gobbleReward, { id: 'room:r1', gobbles: 2, bank: 200, wallet: 10, stage: 'announce' });
  h.at(timing.split); assert.equal(h.store.getState().gobbleReward.stage, 'split');
  h.at(timing.split + 2000); assert.equal(h.store.getState().gobbleReward.stage, 'split', 'both amounts stay readable before flying');
  assert.equal(h.store.getState().walletWithheld, 10);
  h.at(timing.fly); assert.equal(h.store.getState().gobbleReward.stage, 'flying');
  assert.equal(h.store.getState().walletWithheld, 10);
  h.at(timing.land); assert.equal(h.store.getState().walletWithheld, 0); assert.equal(h.store.getState().bankHold, null);
  assert.equal(h.store.getState().bank, 700, 'presentation never awards money');
  h.at(timing.end); h.presentation.endRound(h.result); assert.equal(h.store.getState().gobbleReward, null);
  h.dispose();
});

test('wallet gains are not inferred from Gobble count; the final round also credits its euro reward', () => {
  const h = harness();
  h.presentation.endRound({ ...h.result, infortune: null, infortuneFinale: { startsAt: 20000 } });
  assert.equal(h.store.getState().gobbleReward.wallet, 0);
  assert.equal(h.store.getState().gobbleReward.bank, 200);
  h.presentation.award(h.award);
  assert.equal(h.store.getState().gobbleReward.wallet, 10);
  h.dispose();
});

test('foreign receipts and stale results cannot steal the current round; leaving releases withheld values and timers', () => {
  const h = harness();
  h.presentation.award({ ...h.award, roomId: 'elsewhere' }); h.presentation.award({ ...h.award, roundId: 'old' });
  assert.equal(h.store.getState().walletWithheld, 0);
  h.presentation.endRound({ ...h.result, roundId: 'old' }); assert.equal(h.store.getState().gobbleReward, null);
  h.presentation.award(h.award); h.presentation.endRound(h.result); h.kernel.commands.game.setPhase('results');
  h.kernel.commands.navigation.go('home'); assert.equal(h.store.getState().walletWithheld, 0);
  assert.equal(h.store.getState().gobbleReward, null); h.dispose();
});

test('hidden or suspended results settle without replaying old gains on return', () => {
  for (const hiddenBefore of [true, false]) {
    const h = harness(); h.presentation.award(h.award); h.presentation.endRound(h.result);
    h.documentTarget.hidden = hiddenBefore; h.kernel.commands.game.setPhase('results');
    h.at(30_000); h.documentTarget.hidden = false; h.presentation.refresh();
    assert.equal(h.store.getState().gobbleReward, null); assert.equal(h.store.getState().walletWithheld, 0);
    h.dispose();
  }
});

test('next round and resume discard an old presentation without modifying either balance', () => {
  for (const resume of [false, true]) {
    const h = harness(); h.presentation.award(h.award); h.presentation.endRound(h.result); h.kernel.commands.game.setPhase('results');
    if (resume) h.kernel.commands.session.setResumeSnapshot({ roomId: 'room', phase: 'results', lastRoundResults: { payload: h.result } });
    else h.presentation.startRound({ ...h.start, roundId: 'r2' });
    assert.equal(h.store.getState().walletWithheld, 0); assert.equal(h.store.getState().gobbleReward, null);
    assert.equal(h.store.getState().bank, 500); h.dispose();
  }
});
