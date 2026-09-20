import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import hair from '../../src/features/avatar/renderer/lot_005_renderer.js';
import fitting from '../../src/features/avatar/renderer/hair-fitting.js';

const require = createRequire(import.meta.url);
const { createReviewStore } = require('../../.Tmp/avatar/avatar/editor/review-store.cjs');
const workshopHair = require('../../.Tmp/avatar/avatar/editor/lot_005_renderer.js');
const image = (x = 0, y = 0, width = 0, height = 0, color = '#ffffff') => {
  const canvas = createCanvas(1024, 1024), ctx = canvas.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(x, y, width, height); return canvas;
};
const pixel = (canvas, x, y) => [...canvas.getContext('2d').getImageData(x, y, 1, 1).data];
const stroke = (mask, x, y, erase = false) => ({ mask, erase, size: 30, points: [[x, y]] });
function fixture(renderer = hair, options = {}) {
  const part = { id: 'test', layers: {}, ...options };
  const assets = { hair_test: image(400, 150, 200, 200), hair_test_front: image(400, 150, 100, 200), hair_test_back: image(500, 150, 100, 200), hair_test_mask: image(0, 0, 1024, 1024) };
  const drafts = {}, engine = renderer.create(createCanvas, { parts: [part] }, drafts);
  const draw = (layer = null, overrides = {}) => {
    const canvas = createCanvas(1024, 1024);
    engine.draw(canvas.getContext('2d'), assets, { hair: 'test', hairColor: '', base: 'femme', ...overrides }, layer);
    return canvas;
  };
  return { part, assets, drafts, draw };
}

test('empty fitting preserves existing hair layers; corrections move, erase, restore and undo pixels', () => {
  const { drafts, draw } = fixture();
  const before = draw('front').toBuffer('image/png');
  drafts.test = fitting.defaults();
  assert.deepEqual(draw('front').toBuffer('image/png'), before);
  drafts.test.strokes.push(stroke('behind', 450, 220), stroke('behind', 550, 220, true), stroke('hide', 450, 280));
  assert.equal(pixel(draw('front'), 450, 220)[3], 0);
  assert.equal(pixel(draw('back'), 450, 220)[3], 255);
  assert.equal(pixel(draw('front'), 550, 220)[3], 255, 'front tool also overrides supplied back layer');
  assert.equal(pixel(draw('back'), 550, 220)[3], 0);
  assert.equal(pixel(draw(), 450, 280)[3], 0);
  drafts.test.strokes.push(stroke('hide', 450, 280, true));
  assert.equal(pixel(draw(), 450, 280)[3], 255);
  drafts.test = fitting.defaults();
  assert.deepEqual(draw('front').toBuffer('image/png'), before);
});

test('mask strokes follow placement and scale; workshop and game render the same fitting', () => {
  const game = fixture(), workshop = fixture(workshopHair);
  const fit = { ...fitting.defaults(), dx: 70, dy: 80, scale: 1.25, strokes: [stroke('hide', 450, 220)] };
  game.drafts.test = fit; workshop.drafts.test = structuredClone(fit);
  const t = fitting.placement(game.part, {}, fit);
  const x = Math.round(t.x + (450 - t.anchor.x) * t.scale), y = Math.round(t.y + (220 - t.anchor.y) * t.scale);
  assert.equal(pixel(game.draw(), x, y)[3], 0);
  assert.equal(pixel(game.draw(), x + 40, y)[3], 255);
  for (const layer of [null, 'front', 'back']) assert.deepEqual(game.draw(layer).toBuffer('image/png'), workshop.draw(layer).toBuffer('image/png'));
});

test('anatomical occlusion stays fixed when a fitted long hairstyle moves', () => {
  const { assets, drafts, draw } = fixture(hair, { layer_partition: { method: 'lower_head_occlusion' } });
  assets.hair_test_lower_head_femme = image(500, 0, 524, 1024);
  assets.hair_test_lower_head_homme = image(520, 0, 504, 1024);
  drafts.test = { ...fitting.defaults(), dx: 20 };
  assert.equal(pixel(draw('front'), 510, 220)[3], 0);
  assert.equal(pixel(draw('front', { base: 'homme' }), 510, 220)[3], 255);
  assert.equal(pixel(draw('back'), 530, 220)[3], 255);
});

test('the supplied neutral PNGs use multiply color without changing alpha', () => {
  const { assets, draw } = fixture(hair, { coloration: { method: 'multiply' } });
  assets.hair_test = assets.hair_test_front = image(400, 150, 200, 200, '#808080');
  assert.deepEqual(pixel(draw('front', { hairColor: '#804020' }), 450, 220), [64, 32, 16, 255]);
});

test('saving hair fitting is revisioned, persists after reload, and leaves source pixels/status intact', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'gobble-hair-fitting-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = 'assets/candidates/hair/lot_005/test.png';
  const sha256 = createHash('sha256').update('unchanged source fixture').digest('hex');
  const manifest = { parts: [{ id: 'test', result: { file: source, sha256 }, source: { file: source, sha256 }, layers: { front: { file: source, sha256 } }, status: 'candidate' }], validation: {}, bases: [] };
  for (const [file, value] of Object.entries({
    'assets/candidates/hair/lot_005/assembly.json': manifest,
    'catalog/catalog.json': { hair: [] }, 'catalog/offsets.json': { assets: {} },
  })) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), JSON.stringify(value));
  }
  await writeFile(path.join(root, source), 'unchanged source fixture');
  const store = createReviewStore(root, 'lot_005_coiffures');
  const saved = await store.update({ id: 'test', action: 'fitting', revision: 0, fitting: { ...fitting.defaults(), strokes: [stroke('hide', 450, 220)] } });
  assert.equal(saved.review.assets.test.status, 'candidate');
  assert.equal(saved.manifest.parts[0].fitting.revision, 1);
  assert.equal(saved.review.assets.test.history[0].previous_fitting.strokes.length, 0);
  const reloaded = await createReviewStore(root, 'lot_005_coiffures').snapshot();
  assert.deepEqual(reloaded.manifest.parts[0].fitting, saved.manifest.parts[0].fitting);
  assert.equal(await readFile(path.join(root, source), 'utf8'), 'unchanged source fixture');
  await assert.rejects(store.update({ id: 'test', action: 'fitting', revision: 0, fitting: fitting.defaults() }), /liste a changé/);
  // Classify only this synthetic fixture, never a real candidate.
  const classified = await store.update({ id: 'test', action: 'status', status: 'approved', revision: 1 });
  const promoted = classified.manifest.parts[0];
  assert.equal(promoted.source.file, promoted.result.file);
  assert.equal(promoted.layers.front.file, promoted.result.file);
  assert.ok(promoted.result.file.startsWith('assets/approved/'));
  const restored = await store.update({ id: 'test', action: 'status', status: 'candidate', revision: 2 });
  assert.equal(restored.manifest.parts[0].source.file, source);
  assert.equal(await readFile(path.join(root, source), 'utf8'), 'unchanged source fixture');
});
