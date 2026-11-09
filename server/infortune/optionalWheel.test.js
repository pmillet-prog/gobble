import test from 'node:test';
import assert from 'node:assert/strict';
import { createInfortuneLedger, createInfortuneRoundEconomy } from './roundEconomy.js';
import { infortuneRoundPolicy, scheduleInfortuneAfterResults } from '../../shared/infortuneIntermission.js';
import { WHEEL_SECTORS, EXCHANGE_SECTORS, drawInfortuneSector } from '../../shared/infortuneWheel.js';
import { advanceWheelBreak } from './advanceWheelBreak.js';

function game({ round = 1, count = 3, random = () => .2 } = {}) {
  let time = 1000, id = 0;
  const tasks = new Map(), changes = [], ledger = createInfortuneLedger();
  const players = Array.from({ length: count }, (_, i) => ({ id: `user:${i + 1}`, userId: i + 1, nick: `J${i + 1}` }));
  const groups = Array.from({ length: Math.ceil(count / 3) }, (_, i) => ({ id: `g${i}`, members: players.slice(i * 3, i * 3 + 3) }));
  const policy = { ...scheduleInfortuneAfterResults(infortuneRoundPolicy({ enabled: true, round, totalRounds: 5 }), time, time, 0), groups };
  const timers = { setTimeout(fn, delay) { tasks.set(++id, { fn, at: time + delay }); return id; }, clearTimeout(key) { tasks.delete(key); } };
  const server = createInfortuneRoundEconomy({ ledger, groups, policy, random, now: () => time, timers, onChange: value => changes.push(value) });
  const at = target => {
    for (;;) {
      const next = [...tasks].filter(([, job]) => job.at <= target).sort((a,b) => a[1].at - b[1].at)[0];
      if (!next) break;
      time = next[1].at; tasks.delete(next[0]); next[1].fn();
    }
    time = target;
  };
  return { server, ledger, policy, tasks, changes, at, send: (id, action) => server.submit(`user:${id}`, action) };
}

test('all 24 wedges have one chance each, including repeated amounts and the five exchange wedges', () => {
  for (const sectors of [WHEEL_SECTORS, EXCHANGE_SECTORS]) {
    const actual = new Map(), expected = new Map();
    for (let i = 0; i < 24; i++) {
      const { index, sector } = drawInfortuneSector(sectors, () => (i + .5) / 24);
      assert.equal(index, i);
      actual.set(sector.label, (actual.get(sector.label) || 0) + 1);
      expected.set(sectors[i].label, (expected.get(sectors[i].label) || 0) + 1);
    }
    assert.deepEqual(actual, expected);
  }
  assert.equal(WHEEL_SECTORS.filter(s => s.amount === 400).length, 2);
  assert.equal(EXCHANGE_SECTORS.filter(s => s.kind === 'exchange').length, 5);
});

test('18 non-clicking players get exactly one server draw after 20 seconds; the car is shared', () => {
  const h = game({ count: 18 });
  h.at(20_999); assert.equal(h.server.snapshot().pendingResults, 18);
  h.at(21_000); assert.equal(h.server.snapshot().pendingResults, 0);
  assert.equal(h.server.snapshot().complete, true);
  assert.equal(h.send(1, { type: 'snapshot' }).economy.members['user:1'].result.automatic, true);
  assert.equal(h.ledger.banks.get('user:1'), 500);
  h.send(1, { type: 'spin', index: 18 }); assert.equal(h.ledger.banks.get('user:1'), 500);
  const room = { id: 'room', breakState: { roundId: 'r', infortune: h.policy } };
  assert.ok(advanceWheelBreak(room, 'r', h.server.snapshot(), 21_000).wheelClosing);
  h.server.dispose(); assert.equal(h.tasks.size, 0);
});

test('a late click is reserved before the deadline and a suspended opted-in player gets a server draw', () => {
  const h = game();
  h.at(20_900); assert.equal(h.send(1, { type: 'join' }).ok, true);
  h.send(1, { type: 'ready' }); h.at(21_000);
  assert.equal(h.server.snapshot().pendingResults, 1);
  assert.equal(h.send(2, { type: 'join' }).ok, false);
  h.at(30_900);
  const own = h.send(1, { type: 'snapshot' }).economy.members['user:1'];
  assert.equal(own.result.automatic, true); assert.equal(own.bank, 500);
  assert.equal(h.server.snapshot().complete, true);
  h.server.dispose(); assert.equal(h.tasks.size, 0);
});

test('suspension after launch or after result cannot wait forever for the browser presentation', () => {
  for (const committed of [false, true]) {
    const h = game(); h.send(1, { type: 'join' });
    h.send(1, { type: 'launch', quality: 'good' });
    if (committed) h.send(1, { type: 'spin', index: 18 });
    h.at(21_000);
    assert.equal(h.server.snapshot().complete, true);
    assert.equal(h.ledger.banks.get('user:1'), committed ? 1050 : 550);
    h.send(1, { type: 'spin', index: 12 });
    assert.equal(h.ledger.banks.get('user:1'), committed ? 1050 : 550);
    h.server.dispose();
  }
});

test('both reciprocal choices remain possible when the second player arrives much later', () => {
  const h = game({ round: 4 }); h.at(21_000);
  h.ledger.banks.set('user:1', 7000); h.ledger.banks.set('user:2', 0);
  h.send(1, { type: 'spin', index: 1 }); h.send(1, { type: 'presented' });
  h.at(34_000);
  assert.equal(h.server.snapshot().members['user:1'].choiceMade, false);
  h.send(1, { type: 'exchange', target: 'user:2' });
  h.send(2, { type: 'spin', index: 5 }); h.send(2, { type: 'presented' });
  h.send(3, { type: 'spin', index: 0 }); h.send(3, { type: 'presented' });
  assert.equal(h.server.snapshot().members['user:2'].choiceUntil, 44_000);
  h.send(2, { type: 'exchange', target: 'user:1' });
  assert.equal(h.ledger.banks.get('user:1'), 7000); assert.equal(h.ledger.banks.get('user:2'), 0);
  assert.equal(h.server.snapshot().exchangeReplays.g0[0].cancelled, true);
  h.server.dispose();
});
