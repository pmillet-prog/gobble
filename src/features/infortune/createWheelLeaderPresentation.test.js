import test from 'node:test';
import assert from 'node:assert/strict';
import { createWheelLeaderPresentation } from './createWheelLeaderPresentation.js';

test('the server clock opens the walk once; reconnect resumes its time and stale walks are skipped', () => {
  let now = 1000; const jobs = new Map(), opened = [], prepared = []; let id = 0;
  const view = createWheelLeaderPresentation({ now: () => now,
    timers: { setTimeout(fn) { jobs.set(++id, fn); return id; }, clearTimeout(id) { jobs.delete(id); } },
    prepare: value => prepared.push(value), begin: value => opened.push(value) });
  const cue = { id: 'r1', startsAt: 12000, endsAt: 17200, leaders: [{ id: 'user:1', userId: 1, nick: 'Tigre' }] };
  view.receive(cue, 10000); assert.equal(opened.length, 0); assert.equal(prepared[0].startsAt, 2000);
  now = 2000; [...jobs.values()][0](); assert.equal(opened.length, 1);
  view.refresh(); assert.equal(opened.length, 1);
  view.receive(cue, 9999); assert.equal(opened.length, 1);
  view.reset(); assert.equal(jobs.size, 0);
  now = 4000; view.receive(cue, 10000); assert.equal(opened.at(-1).startsAt, 2000);
  view.reset(); now = 9000; view.receive(cue, 10000); assert.equal(opened.length, 2);
});
