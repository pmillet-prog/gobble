import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleFinaleBreak } from './scheduleFinaleBreak.js';

test('an early collective finish updates reconnects and replaces the lobby timer after the shortened podium', () => {
  let id = 0, entered = 0;
  const jobs = new Map(), updates = [];
  const initial = { tournamentId: 't', podiumAt: 176_000 };
  const finale = { publicSnapshot: () => initial };
  const room = { id: 'r', currentRound: {}, infortuneFinale: finale,
    breakState: { tournamentSummaryAt: initial.podiumAt }, lastRoundResults: { payload: {} } };
  const scheduler = scheduleFinaleBreak({ room, finale, afterPodiumMs: 17500, now: () => 50000,
    timers: { setTimeout(fn, delay) { jobs.set(++id, { fn, delay }); return id; }, clearTimeout(key) { jobs.delete(key); } },
    publish: value => updates.push(value), enterLobby: () => entered++ });
  assert.equal(jobs.size, 1);
  scheduler.update({ ...initial, podiumAt: 55_000, deadlineAt: 55_000 });
  assert.equal(jobs.size, 1);
  assert.equal(room.breakState.tournamentSummaryAt, 55_000);
  assert.equal(room.breakState.nextStartAt, 72_500);
  assert.equal(room.lastRoundResults.payload.infortuneFinale.deadlineAt, 55_000);
  assert.equal(room.lastRoundResults.payload.tournamentSummaryAt, 55_000);
  assert.equal(updates.length, 1);
  const job = [...jobs.values()][0]; assert.equal(job.delay, 22500);
  job.fn(); assert.equal(entered, 1);
  room.currentRound = {}; job.fn(); assert.equal(entered, 1);
  scheduler.dispose();
});
