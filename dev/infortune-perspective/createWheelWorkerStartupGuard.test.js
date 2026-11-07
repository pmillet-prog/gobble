import test from 'node:test';
import assert from 'node:assert/strict';
import { createWheelWorkerStartupGuard } from './createWheelWorkerStartupGuard.js';

function fixture() {
  let clock = 0, serial = 0;
  const jobs = new Map(), handlers = new Map(), failures = [];
  const visibility = { hidden: false, addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name) };
  const guard = createWheelWorkerStartupGuard({ visibility, now: () => clock, onTimeout: value => failures.push(value),
    timers: { setTimeout(fn, ms) { const id = ++serial; jobs.set(id, { at: clock + ms, fn }); return id; }, clearTimeout: id => jobs.delete(id) } });
  function advance(ms) {
    const end = clock + ms;
    while (true) {
      const next = [...jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      clock = next[1].at; jobs.delete(next[0]); next[1].fn();
    }
    clock = end;
  }
  const hide = hidden => { visibility.hidden = hidden; handlers.get('visibilitychange')?.(); };
  return { guard, jobs, handlers, failures, advance, hide };
}

test('a silent worker times out once with its last meaningful preparation step', () => {
  const h = fixture();
  h.guard.progress({ phase: 'loading', message: 'Validation du pilote' });
  h.advance(19_000);
  h.guard.progress({ phase: 'loading', message: 'Validation du pilote' });
  h.advance(1_000);
  assert.deepEqual(h.failures, [{ step: 'Validation du pilote', idleMs: 20_000 }]);
  h.advance(60_000); assert.equal(h.failures.length, 1);
  assert.equal(h.jobs.size, 0); assert.equal(h.handlers.size, 0);
});

test('real progress extends preparation without changing graphics quality', () => {
  const h = fixture();
  for (const message of ['Avatars', 'Textures', 'Ombres', 'Reflets']) {
    h.advance(19_000); h.guard.progress({ phase: 'loading', message });
  }
  assert.equal(h.failures.length, 0);
  h.guard.progress({ phase: 'ready' }); h.advance(60_000);
  assert.equal(h.failures.length, 0); assert.equal(h.jobs.size, 0); assert.equal(h.handlers.size, 0);
});

test('background time is excluded and cancellation removes all work', () => {
  const h = fixture(); h.advance(10_000); h.hide(true); h.advance(120_000);
  assert.equal(h.failures.length, 0);
  h.hide(false); h.advance(9_999); assert.equal(h.failures.length, 0);
  h.advance(1); assert.equal(h.failures[0].idleMs, 20_000);
  const cancelled = fixture(); cancelled.guard.dispose(); cancelled.hide(true); cancelled.hide(false); cancelled.advance(60_000);
  assert.equal(cancelled.failures.length, 0); assert.equal(cancelled.jobs.size, 0); assert.equal(cancelled.handlers.size, 0);
});
