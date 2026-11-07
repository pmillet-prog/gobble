import test from 'node:test';
import assert from 'node:assert/strict';
import { createWheelPayoutPresentation, WHEEL_PAYOUT_TIMING } from './createWheelPayoutPresentation.js';

function harness() {
  let time = 0;
  const events = [], jobs = new Map(); let id = 0;
  const presentation = createWheelPayoutPresentation({ now: () => time,
    change: value => events.push(value), land: () => events.push('balance'), finish: () => events.push('ack'),
    timers: { setTimeout(fn) { jobs.set(++id, fn); return id; }, clearTimeout(id) { jobs.delete(id); } } });
  return { presentation, events, jobs, at(value) { time = value; presentation.advance(); } };
}
test('balance changes on landing, with time for the counter before acknowledging the result once', () => {
  const h = harness(); h.presentation.start(); h.presentation.start();
  h.at(WHEEL_PAYOUT_TIMING.land - 1); assert.deepEqual(h.events, ['flying']);
  h.at(WHEEL_PAYOUT_TIMING.land); assert.deepEqual(h.events, ['flying', 'landed', 'balance']);
  h.at(WHEEL_PAYOUT_TIMING.finish - 1); assert.ok(!h.events.includes('ack'));
  h.at(WHEEL_PAYOUT_TIMING.finish); h.at(99999);
  assert.deepEqual(h.events, ['flying', 'landed', 'balance', 'done', 'ack']);
  assert.equal(h.jobs.size, 0);
});
test('suspension catches up without replaying or holding the room, disposal prevents late callbacks', () => {
  const h = harness(); h.presentation.start(); h.at(99999);
  assert.equal(h.events.filter(e => e === 'balance').length, 1);
  assert.equal(h.events.filter(e => e === 'ack').length, 1);
  const disposed = harness(); disposed.presentation.start(); disposed.presentation.dispose(); disposed.at(99999);
  assert.deepEqual(disposed.events, ['flying']); assert.equal(disposed.jobs.size, 0);
  const hidden = harness(); hidden.presentation.start({ hidden: true });
  assert.equal(hidden.events.at(-1), 'ack'); assert.equal(hidden.jobs.size, 0);
});
test('reduced motion keeps the same landing and completion order with a short fade', () => {
  const h = harness(); h.presentation.start({ reduced: true }); h.at(150);
  assert.equal(h.events.at(-1), 'balance'); h.at(450); assert.equal(h.events.at(-1), 'ack');
});
