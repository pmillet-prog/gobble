import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleInfortuneAfterResults, infortuneRoundPolicy, infortuneBreakDuration } from '../../shared/infortuneIntermission.js';
import { createInfortuneRoundEconomy, createInfortuneLedger } from './roundEconomy.js';
import { advanceWheelBreak } from './advanceWheelBreak.js';
import { WHEEL_SECTORS } from '../../shared/infortuneWheel.js';
import { INFORTUNE_LEADER_WINDOW_MS } from '../../shared/infortuneLeaders.js';

test('results get twenty seconds after the outro, even when calculation takes longer', () => {
  const policy = infortuneRoundPolicy({ enabled: true, round: 1, totalRounds: 5 });
  assert.equal(scheduleInfortuneAfterResults(policy, 2000, 1000).openedAt, 27000);
  assert.equal(scheduleInfortuneAfterResults(policy, 21000, 1000).openedAt, 41000);
  assert.equal(scheduleInfortuneAfterResults(policy, 2000, 1000, 0).openedAt, 22000);
  assert.equal(infortuneBreakDuration(45000, policy, 26000, 21000), 45000 + INFORTUNE_LEADER_WINDOW_MS);
});
test('the server blocks early spins and shortens the break only after the result presentation', () => {
  let now = 1000;
  const policy = scheduleInfortuneAfterResults(infortuneRoundPolicy({ enabled: true, round: 1, totalRounds: 5 }), now);
  const economy = createInfortuneRoundEconomy({ policy, ledger: createInfortuneLedger(),
    groups: [{ id: 'g', members: [{ id: 'user:1' }] }], now: () => now,
    timers: { setTimeout() { return 1; }, clearTimeout() {} } });
  const action = { type: 'spin', index: WHEEL_SECTORS.findIndex(sector => sector.amount === 500) };
  assert.equal(economy.submit('user:1', action).ok, false);
  assert.equal(economy.submit('user:1', { type: 'ready' }).ok, false);
  assert.equal(economy.submit('user:1', { type: 'snapshot' }).ok, true);
  now = policy.openedAt;
  const reply = economy.submit('user:1', action);
  assert.equal(reply.economy.members['user:1'].result.after, 500);
  assert.equal(economy.snapshot().members['user:1'].result, undefined);
  const room = { id: 'room', breakState: { roundId: 'r', nextStartAt: now + 55000, infortune: policy } };
  assert.equal(advanceWheelBreak(room, 'r', economy.snapshot(), now), null);
  economy.submit('user:1', { type: 'presented' });
  assert.equal(advanceWheelBreak(room, 'r', economy.snapshot(), now).nextStartAt, now + INFORTUNE_LEADER_WINDOW_MS);
  assert.equal(advanceWheelBreak(room, 'r', economy.snapshot(), now + 500), null);
  assert.equal(economy.submit('user:1', action).economy.members['user:1'].bank, 500);
  economy.dispose();
});
