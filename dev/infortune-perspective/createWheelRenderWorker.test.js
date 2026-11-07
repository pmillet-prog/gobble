import test from 'node:test';
import assert from 'node:assert/strict';
import { createWheelRenderWorker } from './createWheelRenderWorker.js';

function fixture({ boot = true } = {}) {
  const messages = [], handlers = new Map(), surface = {}, canvas = { transferControlToOffscreen: () => surface };
  const worker = { terminations: 0, postMessage(value, transfer) { messages.push({ value, transfer }); }, terminate() { this.terminations++; } };
  const visibility = { hidden: false, addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name) };
  const endpoint = createWheelRenderWorker({ createCanvas: () => canvas, createWorker: () => worker, visibility });
  const reply = (message, value) => worker.onmessage({ data: { id: message.value.id, value } });
  const start = () => worker.onmessage({ data: { event: 'booted' } });
  if (boot) start();
  return { endpoint, messages, handlers, surface, worker, visibility, reply, start };
}

test('waits for the worker handler before transferring the canvas, using current visibility', async () => {
  const h = fixture({ boot: false });
  assert.equal(h.messages.length, 0);
  h.visibility.hidden = true; h.handlers.get('visibilitychange')();
  assert.equal(h.messages.length, 0);
  h.start(); h.start();
  assert.equal(h.messages.length, 1);
  assert.deepEqual(h.messages[0].value.args, [h.surface, true]);
  h.reply(h.messages[0], true); await h.endpoint.ready;
  h.endpoint.dispose();
});

test('cancelling a worker before boot rejects readiness without transferring its canvas', async () => {
  const h = fixture({ boot: false }), failed = assert.rejects(h.endpoint.ready, /disposed/);
  h.endpoint.dispose(); h.start(); await failed;
  assert.equal(h.messages.length, 0);
  assert.equal(h.worker.terminations, 1);
  assert.equal(h.handlers.size, 0);
});

test('reports distinct module and graphics startup progress until unsubscribed', async () => {
  const h = fixture({ boot: false }), stages = [];
  const stop = h.endpoint.subscribeStartup(status => stages.push(status.message));
  const progress = message => h.worker.onmessage({ data: { event: 'startup', value: { phase: 'loading', message } } });
  h.start(); progress('Loading modules'); progress('Creating graphics context'); stop(); progress('Late progress');
  assert.deepEqual(stages, ['Démarrage du worker 3D…', 'Loading modules', 'Creating graphics context']);
  h.reply(h.messages[0], true); await h.endpoint.ready; h.endpoint.dispose();
});

test('worker transfers the canvas once, relays visibility and isolates scene events', async () => {
  const h = fixture();
  assert.equal(h.messages[0].value.method, 'init'); assert.deepEqual(h.messages[0].transfer, [h.surface]);
  h.reply(h.messages[0], true); await h.endpoint.ready;
  h.visibility.hidden = true; h.handlers.get('visibilitychange')();
  assert.deepEqual(h.messages.at(-1).value.args, [true]);
  const events = [], unsubscribe = h.endpoint.subscribe(1, (...args) => events.push(args));
  h.worker.onmessage({ data: { scene: 2, event: 'status', value: 'foreign' } });
  h.worker.onmessage({ data: { scene: 1, event: 'status', value: 'ready' } });
  unsubscribe(); h.worker.onmessage({ data: { scene: 1, event: 'status', value: 'late' } });
  assert.deepEqual(events, [['status', 'ready', undefined]]);
  h.endpoint.dispose(); assert.equal(h.handlers.size, 0); assert.equal(h.worker.terminations, 1);
});

test('a worker failure rejects pending captures and stops the endpoint exactly once', async () => {
  const h = fixture(); h.reply(h.messages[0], true); await h.endpoint.ready;
  const errors = []; h.endpoint.subscribe(1, (event, value) => errors.push([event, value]));
  const capture = h.endpoint.call(1, 'takeResultPresentation'), failed = assert.rejects(capture, /driver failed/);
  const request = h.messages.at(-1);
  h.worker.onerror({ preventDefault() {}, message: 'driver failed' }); await failed;
  h.reply(request, 'stale capture'); h.worker.onerror({ preventDefault() {}, message: 'duplicate' }); h.endpoint.dispose();
  assert.equal(h.worker.terminations, 1); assert.equal(h.handlers.size, 0);
  assert.equal(h.endpoint.getContext().isContextLost(), true);
  assert.deepEqual(errors, [['error', 'driver failed']]);
  await assert.rejects(h.endpoint.call(2, 'create'), /closed/);
});

test('initialization failure releases its visibility subscription and rejects readiness', async () => {
  const h = fixture(), failed = assert.rejects(h.endpoint.ready, /WebGL unavailable/);
  h.worker.onmessage({ data: { id: h.messages[0].value.id, error: 'WebGL unavailable' } }); await failed;
  assert.equal(h.worker.terminations, 1); assert.equal(h.handlers.size, 0);
});
