import test from 'node:test';
import assert from 'node:assert/strict';
import { infortuneLeaders, INFORTUNE_LEADER_WINDOW_MS, INFORTUNE_LEADER_WALK_MS } from '../../shared/infortuneLeaders.js';
import { advanceWheelBreak } from './advanceWheelBreak.js';
import { scheduleWheelClosing } from './scheduleWheelClosing.js';
import { INFORTUNE_EXCHANGE_STEP_MS } from '../../shared/infortuneExchangePlan.js';

const players = [{ id: 'user:1', userId: 1, nick: 'Tigre' }, { id: 'user:2', userId: 2, nick: 'Alix' },
  { id: 'user:3', userId: 3, nick: 'Sam' }, { id: 'bot', nick: 'Présentateur', isBot: true }];
const policy = { openedAt: 1000, windowMs: 40000, roundNumber: 1, groups: [{ members: players }] };
const room = () => ({ id: 'room', breakState: { roundId: 'r', infortune: policy, nextStartAt: 50000 } });
const economy = (values = [12000, 12000, 500, 99999]) => ({ complete: true, members: Object.fromEntries(players.map((player, i) => [player.id, { bank: values[i] }])), exchangeReplays: {} });

test('the room leaders include every tied human exactly once and never their amounts or presenters', () => {
  const state = economy();
  const leaders = infortuneLeaders([...players, players[0]], id => state.members[id].bank);
  assert.deepEqual(leaders, players.slice(0,2));
  assert.ok(!JSON.stringify(leaders).includes('12000'));
  assert.deepEqual(infortuneLeaders([], () => 0), []);
  assert.equal(infortuneLeaders(players, () => 0).length, 3);
});
test('all presentations close the wheel once, with a synchronized interlude before the next round', () => {
  const r = room(), e = economy();
  assert.equal(advanceWheelBreak(r, 'other', e, 9000), null);
  assert.equal(advanceWheelBreak(r, 'r', { ...e, complete: false }, 9000), null);
  const result = advanceWheelBreak(r, 'r', e, 9000);
  assert.equal(result.nextStartAt, 9000 + INFORTUNE_LEADER_WINDOW_MS);
  assert.equal(result.wheelClosing.endsAt - result.wheelClosing.startsAt, INFORTUNE_LEADER_WALK_MS);
  assert.deepEqual(result.wheelClosing.leaders, players.slice(0,2));
  assert.equal(advanceWheelBreak(r, 'r', e, 10000), null);
});
test('the fourth round waits for all exchanges, then advances without a limousine or an empty interlude', () => {
  const r = room(); r.breakState.infortune = { ...policy, roundNumber: 4 };
  const e = economy([500, 100, 12000, 99999]); e.exchangeReplays = { g: [{}, {}, {}] };
  const result = advanceWheelBreak(r, 'r', e, 9000);
  assert.equal(result.wheelClosing, null);
  assert.equal(result.nextStartAt, 9000 + 3 * INFORTUNE_EXCHANGE_STEP_MS + 300);
  const withoutExchange = room(); withoutExchange.breakState.infortune = { ...policy, roundNumber: 4 };
  assert.equal(advanceWheelBreak(withoutExchange, 'r', economy(), 9000).nextStartAt, 9300);
});
test('the ceiling closes a wheel even if a client never acknowledges its already recorded result', async () => {
  let now = 1000, id = 0, starts = 0; const jobs = new Map(), published = [];
  const timers = { setTimeout(fn, delay) { jobs.set(++id, { fn, at: now + delay }); return id; }, clearTimeout(id) { jobs.delete(id); } };
  const r = room(), round = { id: 'r', infortune: policy, infortuneGame: { close() {}, snapshot: () => ({ ...economy(), complete: false }) } };
  r.currentRound = round;
  scheduleWheelClosing({ room: r, round, timers, now: () => now, publish: value => published.push(value), startNext: () => starts++ });
  assert.equal(published.length, 0);
  now = 41000; const deadline = [...jobs.values()][0]; jobs.clear(); deadline.fn();
  assert.equal(published.length, 1); assert.equal(starts, 0);
  const next = [...jobs.values()][0]; assert.equal(next.at, 41000 + INFORTUNE_LEADER_WINDOW_MS);
  now = next.at; jobs.clear(); next.fn(); await Promise.resolve(); assert.equal(starts, 1);
});
test('a replaced round cannot launch an old closing animation or advance the room', () => {
  let timer, published = false;
  const r = room(), round = { id: 'r', infortune: policy, infortuneGame: { snapshot: () => ({ complete: false }) } }; r.currentRound = round;
  scheduleWheelClosing({ room: r, round, now: () => 1000, timers: { setTimeout(fn) { timer = fn; }, clearTimeout() {} },
    publish: () => { published = true; }, startNext() { assert.fail('old round advanced'); } });
  r.currentRound = { id: 'next' }; timer(); assert.equal(published, false);
});
