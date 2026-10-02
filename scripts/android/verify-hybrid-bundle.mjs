import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { MEDIA_SEED_MAX_BYTES, mediaMime } from './media-policy.mjs';
import { createMediaManifest, createMediaSeed } from './media-manifest.mjs';

const root = path.resolve('android-hybrid/app/build/generated/web-assets');
const manifest = JSON.parse(await readFile(path.join(root, 'bundle-manifest.json'), 'utf8'));
assert.equal(manifest.schema, 2);
assert.equal(manifest.origin, 'https://gobble.fr');
assert.equal(manifest.files['/index.html'], undefined);
assert.ok(manifest.files['/introgobble.gif']);
assert.ok(manifest.files['/sound/ui/click.wav']);
const webManifest = await createMediaManifest(path.resolve('.'));
const expected = createMediaSeed(webManifest);
assert.deepEqual(Object.keys(manifest.files), Object.keys(expected.files), 'APK must include exactly the selected media seed');
assert.ok(Object.keys(manifest.files).length < Object.keys(webManifest.files).length, 'Deferred media must stay outside the APK');
assert.ok(Object.values(manifest.files).reduce((sum, entry) => sum + entry.bytes, 0) <= MEDIA_SEED_MAX_BYTES);
const publicEntries = {};
for (const [url, entry] of Object.entries(manifest.files)) {
  assert.ok(url.startsWith('/') && !url.includes('?') && !url.includes('..'));
  assert.ok(!url.startsWith('/api/') && !url.startsWith('/socket.io/') && url !== '/sw.js');
  assert.equal(entry.mime, mediaMime(url), `Executable/dynamic file or invalid MIME in APK: ${url}`);
  assert.ok(mediaMime(url), `Executable/dynamic file in APK: ${url}`);
  const absolute = path.resolve(root, entry.file);
  assert.ok(absolute.startsWith(root + path.sep));
  const bytes = await readFile(absolute);
  assert.equal(bytes.length, entry.bytes, url);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, url);
  const { file, ...publicEntry } = entry;
  assert.deepEqual(publicEntry, webManifest.files[url], `APK media differs from current web media: ${url}`);
  publicEntries[url] = publicEntry;
}
assert.equal(createHash('sha256').update(JSON.stringify(publicEntries)).digest('hex').slice(0, 16), manifest.version);
assert.deepEqual(publicEntries, expected.files, 'APK media must match the current public files');
async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolute));
    else files.push(path.relative(root, absolute).replaceAll('\\', '/'));
  }
  return files;
}
assert.deepEqual((await collectFiles(root)).sort(), ['bundle-manifest.json', ...Object.values(manifest.files).map(entry => entry.file)].sort(),
  'Generated APK assets must not retain files outside the selected seed');
console.log(`Media seed ${manifest.version}: ${Object.keys(manifest.files).length} files verified, ${Object.keys(webManifest.files).length - Object.keys(manifest.files).length} available on demand; HTML, JS, CSS, JSON, API and sockets excluded.`);
