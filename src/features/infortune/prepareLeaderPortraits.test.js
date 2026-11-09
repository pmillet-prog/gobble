import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeaderPortraitPreparation } from './prepareLeaderPortraits.js';
import { avatarAssetSignature } from '../../../shared/avatarRenderAssets.js';
import { savedAvatarImages } from '../avatar/savedAvatarImages.js';

test('the car parade draws saved happy/blinking images without loading the modular renderer', async t => {
  const urls = [], drawn = [], canvases = [];
  t.mock.method(savedAvatarImages, 'load', async url => { urls.push(url); return { url, width: 600, height: 600 }; });
  const avatar = { hair: 'bob' };
  avatar.renderedAssets = { userId: 12, revision: 3, version: 1, signature: avatarAssetSignature(avatar),
    frames: { stage_happy: { size: 600 }, stage_blink: { size: 600 } } };
  const job = createLeaderPortraitPreparation({ leaders: [{ id: 'user:12', userId: 12, nick: 'Test', avatar }] }, {
    createRenderer: () => { assert.fail('saved portraits must not rebuild avatar parts'); },
    makeCanvas: size => {
      const context = { clearRect() {}, drawImage: image => drawn.push(image.url) };
      const canvas = { width: size, height: size, getContext: () => context }; canvases.push(canvas); return canvas;
    },
  });
  try {
    await job.ready;
    assert.equal(job.getSnapshot().size, 1);
    assert.deepEqual(urls, ['/api/auth/avatars/12/render/3/1/stage_happy.png', '/api/auth/avatars/12/render/3/1/stage_blink.png']);
    assert.deepEqual(drawn, urls);
    assert.notEqual(job.getSnapshot().get('user:12').happy, job.getSnapshot().get('user:12').blink);
  } finally { job.dispose(); }
  assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
});

test('large ties batch public appearances, render original happy/blinking poses, and release canvases', async () => {
  const requests = [], poses = [], canvases = [];
  const leaders = Array.from({ length: 49 }, (_, i) => ({ id: `user:${i + 1}`, userId: i + 1, nick: `Joueur ${i}` }));
  const job = createLeaderPortraitPreparation({ leaders }, {
    fetchImpl: async url => {
      const ids = url.split('=')[1].split(','); requests.push(ids);
      return { ok: true, json: async () => ({ ok: true, avatars: Object.fromEntries(ids.map(id => [id, { hair: id }])) }) };
    },
    makeCanvas: size => { const canvas = { width: size, height: size }; canvases.push(canvas); return canvas; },
    createRenderer: async () => ({ prepare: async (avatar, options) => {
      poses.push({ avatar, ...options }); return { draw: (canvas, view) => { assert.equal(view, 'portrait'); canvas.original = avatar; } };
    } }),
  });
  await job.ready;
  assert.deepEqual(requests.map(ids => ids.length), [24, 24, 1]);
  assert.equal(job.getSnapshot().size, 49);
  assert.equal(poses.length, 98);
  assert.ok(poses.every(pose => pose.expression === 'happy' && pose.transparent));
  assert.equal(poses.filter(pose => pose.blink).length, 49);
  assert.equal(job.getSnapshot().get('user:49').happy.original.hair, '49');
  assert.equal(canvases[0].width, 144);
  job.dispose();
  assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
});

test('leaving during a pose preparation releases the finished pose and never publishes a stale avatar', async () => {
  let finish, entered, calls = 0;
  const waiting = new Promise(resolve => { entered = resolve; });
  const canvas = { width: 400, height: 400 };
  const job = createLeaderPortraitPreparation({ leaders: [{ id: 'local', avatar: { hair: 'bob' } }] }, {
    makeCanvas: () => canvas,
    createRenderer: async () => ({ prepare: async () => {
      if (++calls === 2) { entered(); await new Promise(resolve => { finish = resolve; }); }
      return { draw() {} };
    } }),
  });
  await waiting; job.dispose(); finish(); await job.ready;
  assert.equal(canvas.width, 0);
  assert.equal(job.getSnapshot().size, 0);
});
