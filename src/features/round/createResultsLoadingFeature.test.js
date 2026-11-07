import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplicationKernel } from '../../app/core/createApplicationKernel.js';
import { createResultsLoadingFeature } from './createResultsLoadingFeature.js';

test('slow calculation gets a loading screen after the outro, never a fabricated result', () => {
  let now = 0, timerId = 0;
  const jobs = new Map(), events = {};
  const kernel = createApplicationKernel({ ports: { realtime: { bind(value) { Object.assign(events, value); return () => {}; } } } });
  kernel.commands.session.patch({ isLoggedIn: true }); kernel.commands.navigation.go('live'); kernel.commands.game.setCurrentRoomId('room');
  kernel.features.define('resultsLoading', context => createResultsLoadingFeature(context, { now: () => now,
    timers: { setTimeout(fn, delay) { jobs.set(++timerId, { fn, at: now + delay }); return timerId; }, clearTimeout(id) { jobs.delete(id); } } }));
  const feature = kernel.features.acquire('resultsLoading').feature;
  let outros = 0; feature.onResolving(() => outros++);
  events.roundResolving({ roomId: 'elsewhere', roundId: 'old' }); assert.equal(outros, 0);
  events.roundResolving({ roomId: 'room', roundId: 'r' }); assert.equal(outros, 1);
  assert.equal(feature.store.getState().visible, false);
  now = 6000; for (const job of [...jobs.values()]) job.fn();
  assert.equal(feature.store.getState().visible, true);
  events.roundEnded({ roomId: 'room', roundId: 'old' }); assert.equal(feature.store.getState().visible, true);
  events.roundEnded({ roomId: 'room', roundId: 'r' }); assert.equal(feature.store.getState().visible, false);
  kernel.commands.session.patch({ resumeSnapshot: { roomId: 'room', resultsPending: { roomId: 'room', roundId: 'r2' } } });
  assert.equal(feature.store.getState().visible, true);
  kernel.commands.navigation.go('home'); assert.equal(feature.store.getState().visible, false);
  assert.equal(jobs.size, 0); kernel.dispose();
});
