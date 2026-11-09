import test from 'node:test';
import assert from 'node:assert/strict';
import { createStandingsPresentation, STANDINGS_TIMING } from './createStandingsPresentation.js';
import { newFinaleWins } from './finaleWins.js';

const initial = [
  { userId: 1, nick: 'Alice', points: 32, wheelPoints: 0, wheelStatus: 'playing' },
  { userId: 2, nick: 'Bob', points: 29, wheelPoints: 0, wheelStatus: 'playing' },
  { userId: 3, nick: 'Chloé', points: 28, wheelPoints: 0, wheelStatus: 'playing' },
];
const win = (rows, id) => rows.map(row => row.userId === id ? { ...row, points: row.points + 10, wheelPoints: 10, wheelStatus: 'won' } : row).sort((a,b) => b.points-a.points);
function harness(rows = initial) {
  let now = 0, id = 0; const tasks = new Map();
  const timers = { setTimeout(fn, ms) { tasks.set(++id, { fn, at: now + ms }); return id; }, clearTimeout(key) { tasks.delete(key); } };
  const model = createStandingsPresentation(rows, { timers });
  return { model, tasks, state: model.store.getState, advance(ms) {
    const end = now + ms;
    for (;;) { const next = [...tasks].filter(([,t]) => t.at <= end).sort((a,b) => a[1].at-b[1].at)[0];
      if (!next) break; now = next[1].at; tasks.delete(next[0]); next[1].fn(); }
    now = end;
  } };
}
test('a new winner gets the bonus, then the count, then the new position, without double counting', () => {
  const h = harness(), updated = win(initial, 2);
  h.model.update(updated);
  assert.equal(h.state().phase, 'cue'); assert.equal(h.state().rows[1].points, 29);
  assert.deepEqual(h.state().awards['user:2'], { from: 29, to: 39, gain: 10 });
  h.advance(STANDINGS_TIMING.cue);
  assert.equal(h.state().phase, 'count'); assert.equal(h.state().rows[0].nick, 'Alice');
  h.advance(STANDINGS_TIMING.count);
  assert.equal(h.state().phase, 'move'); assert.equal(h.state().rows[0].nick, 'Bob'); assert.equal(h.state().rows[0].points, 39);
  h.advance(STANDINGS_TIMING.move); h.model.update(updated.map(row => ({ ...row })));
  assert.equal(h.state().phase, 'idle'); assert.deepEqual(h.state().awards, {}); assert.equal(h.tasks.size, 0);
});
test('another winner during the movement queues once and keeps the latest authoritative scores', () => {
  const h = harness(), bob = win(initial, 2), both = win(bob, 3);
  h.model.update(bob); h.advance(STANDINGS_TIMING.cue + STANDINGS_TIMING.count);
  h.model.update(both); h.model.update(both.map(row => ({ ...row })));
  h.advance(STANDINGS_TIMING.move);
  assert.equal(h.state().phase, 'cue'); assert.deepEqual(Object.keys(h.state().awards), ['user:3']);
  h.advance(2250); assert.deepEqual(h.state().rows, both); assert.equal(h.tasks.size, 0);
});
test('joining existing standings or returning from a hidden tab does not replay old awards', () => {
  const updated = win(initial, 2), h = harness(updated);
  assert.equal(h.state().phase, 'idle'); h.model.update(win(updated, 3));
  h.model.setInstant(true); assert.equal(h.tasks.size, 0); assert.equal(h.state().rows[1].nick, 'Chloé');
  h.model.setInstant(false); h.model.update(win(updated, 3)); assert.equal(h.state().phase, 'idle');
  h.model.dispose(); assert.equal(h.tasks.size, 0);
});
test('public win cues require a new victory in the same tournament, never historical or duplicate snapshots', () => {
  const first = { tournamentId: 'a', revision: 0, ranking: initial };
  const next = { ...first, revision: 1, ranking: win(initial, 2) };
  assert.deepEqual(newFinaleWins(first, next).map(row => row.nick), ['Bob']);
  assert.deepEqual(newFinaleWins(null, next), []);
  assert.deepEqual(newFinaleWins(next, next), []);
  assert.deepEqual(newFinaleWins(next, { ...next, revision: 2 }), []);
  assert.deepEqual(newFinaleWins(first, { ...next, tournamentId: 'b' }), []);
});
