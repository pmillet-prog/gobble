import test from 'node:test';
import assert from 'node:assert/strict';
import { captureWheelResultExit } from './captureWheelResultExit.js';

test('the landing transfers only its sector, never the already credited launch bonus', () => {
  const bank = { getBoundingClientRect: () => ({ x: 900, y: 10, width: 100, height: 40 }) };
  const scene = { getBoundingClientRect: () => ({ x: 0, y: 60, width: 1000, height: 600 }),
    closest: () => ({ querySelector: () => bank }) };
  const graphics = { takeResultPresentation: () => ({ x: 500, y: 300, width: 150, height: 60 }) };
  const capture = result => captureWheelResultExit({ scene, graphics, flat: false,
    result: { ...result, launchQuality: { kind: 'good', bonus: 50 } } });
  assert.equal(capture({ kind: 'bonus' }).amountLabel, '1\u202f000 €');
  assert.equal(capture({ kind: 'amount', amount: 500 }).amountLabel, null);
  assert.equal(capture({ kind: 'pass' }).transfer, false);
  assert.equal(capture({ kind: 'bankrupt' }).transfer, false);
});

test('a worker capture keeps the DOM coordinates and handles a missing presentation', async () => {
  const bank = { getBoundingClientRect: () => ({ x: 900, y: 10, width: 100, height: 40 }) };
  const scene = { getBoundingClientRect: () => ({ x: 20, y: 60, width: 1000, height: 600 }),
    closest: () => ({ querySelector: () => bank }) };
  const capture = source => captureWheelResultExit({ scene, flat: false, result: { kind: 'amount', amount: 500, label: '500 €' },
    graphics: { takeResultPresentation: () => Promise.resolve(source) } });
  const value = await capture({ x: 500, y: 300, image: 'worker-image' });
  assert.equal(value.x, 520); assert.equal(value.y, 360);
  assert.deepEqual(value.target, { x: 950, y: 30 }); assert.equal(value.image, 'worker-image');
  assert.equal(await capture(null), null);
});
