import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createMediaManifest, createMediaSeed } from './media-manifest.mjs';
import { literalMediaUrls, MEDIA_SEED_MAX_BYTES, mediaMime } from './media-policy.mjs';
import { withAvatarAccessories } from '../../shared/avatarObjectives.js';
import { CHALKBOARD_TEXTURE_URL } from '../../src/features/chalkboard/chalkboardTexture.js';
import { buildUiAssetManifest } from '../../src/assets/uiAssetManifest.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = await createMediaManifest(root);
const { files } = manifest;
const seed = createMediaSeed(manifest);
const available = url => assert.ok(files[decodeURIComponent(url)], `Missing web media manifest entry: ${url}`);
const bundled = url => assert.ok(seed.files[decodeURIComponent(url)], `Missing APK media: ${url}`);

test('first Grand Tableau opening has its current background, home button and every selectable chalk font', async () => {
  bundled(CHALKBOARD_TEXTURE_URL);
  bundled('/buttons/grand-tableau-v2.webp');
  const fonts = (await readdir(new URL('../../public/chalkfont/', import.meta.url)))
    .filter(name => /\.(?:ttf|otf|woff2?)$/i.test(name));
  assert.ok(fonts.length >= 12);
  for (const name of fonts) bundled('/chalkfont/' + name);
});

test('all home and live UI states are bundled, including deferred and opposite-team buttons', () => {
  for (const entry of buildUiAssetManifest({ preferWide: false })) {
    assert.ok(entry.candidates.some(url => seed.files[decodeURIComponent(url)]), entry.key);
  }
  for (const name of ['chat', 'pret bleu', 'pret rouge', 'pret validé', 'salon bleu', 'salon rouge',
    'bouton retour bleu', 'bouton retour rouge', 'entraînement bleu', 'eintraînement rouge']) {
    bundled('/buttons/' + name + '.webp');
  }
});

test('web manifest covers every live avatar layer, mask and accessory without including the catalogue', async () => {
  const catalog = withAvatarAccessories(JSON.parse(await readFile(new URL('../../public/avatars/v1/catalog.json', import.meta.url), 'utf8')));
  for (const part of [...catalog.bases, ...Object.values(catalog.families).flat()]) {
    for (const file of [part.file, part.mask, ...Object.values(part.layers || {}), ...Object.values(part.masks || {})].filter(Boolean)) {
      available('/avatars/v1/' + file);
      assert.equal(seed.files['/avatars/v1/' + file], undefined);
    }
  }
  bundled('/avatars/default.png');
  assert.equal(files['/avatars/v1/catalog.json'], undefined);
});

test('web manifest covers presenter animations, game sounds, music, textures and reactions for on-demand use', () => {
  for (const presenter of ['bafouille', 'capello', 'lepers', 'pivot', 'romejko']) {
    for (const image of ['button', 'frame-1', 'frames', 'hit-1', 'hit-2', 'stars']) {
      available(`/bots/presenters/${presenter}/${image}.webp`);
    }
    bundled(`/bots/presenters/${presenter}/button.webp`);
    assert.equal(seed.files[`/bots/presenters/${presenter}/frames.webp`], undefined);
  }
  for (const url of ['/sound/game/invalide.mp3', '/sound/game/incremental/09.wav', '/sound/game/scores/07.wav',
    '/sound/game/piano/07.wav', '/sound/game/Cash Register.mp3', '/sound/presenters/Lepers/cacestbo.mp3',
    '/sound/music/ruisseauforet.mp3', '/textures/jeans.jpg', '/textures/beton.jpg', '/textures/marbre.jpg',
    '/emojis/openmoji-svg-black/1F44D.svg', '/emojis/openmoji-svg-black/1F914.svg']) available(url);
});

test('media manifest excludes executable content, mutable data, retired artwork and duplicate PNG exports', () => {
  for (const url of Object.keys(files)) assert.ok(mediaMime(url), url);
  for (const url of ['/index.html', '/sw.js', '/offline-retry.js', '/manifest.webmanifest', '/sound/music/index.json',
    '/api/chalkboard/fonts', '/background/OLD lobby smart bleu.png', '/buttons/boutons.png',
    '/buttons/chat.png', '/buttons/grand-tableau.webp', '/bots/capello-sprite.webp', '/sound/game/bonus.aup3',
    '/vocab-ranks/source.png', '/chalkboard/surface/procedural-grain-v2.webp', '/emojis/openmoji-svg-black/1F600.svg']) {
    assert.equal(files[url], undefined, url);
  }
  assert.equal(mediaMime('/api/account.json'), undefined);
  assert.equal(mediaMime('/another.txt'), undefined);
  assert.equal(mediaMime('/textures/jeans.jpg'), 'image/jpeg');
});

test('APK seed is bounded and leaves heavyweight media in the web manifest and demand cache', () => {
  const bytes = Object.values(seed.files).reduce((sum, entry) => sum + entry.bytes, 0);
  assert.ok(bytes <= MEDIA_SEED_MAX_BYTES);
  assert.ok(Object.keys(seed.files).length < Object.keys(files).length);
  for (const url of ['/sound/music/ruisseauforet.mp3', '/sound/game/invalide.mp3', '/textures/jeans.jpg',
    '/sound/presenters/Lepers/cacestbo.mp3', '/bots/presenters/capello/frames.webp']) {
    available(url);
    assert.equal(seed.files[url], undefined, `${url} should be cached on demand`);
  }
  bundled('/dico.txt');
  for (const url of Object.keys(files).filter(url => url.startsWith('/fonts/'))) bundled(url);
  bundled('/sound/ui/click.wav');
  assert.throws(() => createMediaSeed({ files: { '/buttons/too-large.webp': {
    ...files['/buttons/chat.webp'], bytes: MEDIA_SEED_MAX_BYTES + 1,
  } } }), /exceeds its .* byte budget/);
});

test('APK seed entries match real public files and have an independent stable version', async () => {
  for (const [url, entry] of Object.entries(seed.files)) {
    const bytes = await readFile(new URL('../../public/' + encodeURI(url.slice(1)), import.meta.url));
    assert.deepEqual(entry, files[url]);
    assert.equal(entry.bytes, bytes.length, url);
    assert.equal(entry.sha256, createHash('sha256').update(bytes).digest('hex'), url);
  }
  const updated = structuredClone(manifest);
  updated.files['/sound/music/ruisseauforet.mp3'].sha256 = 'f'.repeat(64);
  assert.equal(createMediaSeed(updated).version, seed.version, 'Changing deferred media must not rebuild the APK seed');
  updated.files['/icon.svg'].sha256 = 'f'.repeat(64);
  assert.notEqual(createMediaSeed(updated).version, seed.version);
  const copy = createMediaSeed(manifest);
  copy.files['/icon.svg'].file = 'media/icon.svg';
  assert.equal(files['/icon.svg'].file, undefined, 'Preparing APK paths must not mutate the web manifest');
});

test('future literal media paths are discovered across JS and CSS, including spaces and cachebusters', () => {
  const source = 'src="/buttons/new button.webp?v=2"; background:url(/new/texture.jpg);'
    + '`' + '${SOUND_ROOT}/ui/new.mp3' + '`;'
    + 'fetch("/api/data.json"); src="https://elsewhere.test/remote.png";'
    + '`/frames/${index}.webp`;';
  assert.deepEqual([...literalMediaUrls(source)], ['/buttons/new button.webp', '/new/texture.jpg', '/sound/ui/new.mp3']);
});
