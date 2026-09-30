import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve('android-hybrid/app/build/generated/web-assets');
const manifest = JSON.parse(await readFile(path.join(root, 'bundle-manifest.json'), 'utf8'));
assert.equal(manifest.schema, 2);
assert.equal(manifest.origin, 'https://gobble.fr');
assert.equal(manifest.files['/index.html'], undefined);
assert.ok(manifest.files['/introgobble.gif']);
assert.ok(manifest.files['/sound/ui/click.wav']);
const publicEntries = {};
for (const [url, entry] of Object.entries(manifest.files)) {
  assert.ok(url.startsWith('/') && !url.includes('?') && !url.includes('..'));
  assert.ok(!url.startsWith('/api/') && !url.startsWith('/socket.io/') && url !== '/sw.js');
  assert.ok(/\.(png|webp|gif|svg|ttf|otf|woff2?|wav|mp3)$/i.test(url) || url === '/dico.txt', `Executable/dynamic file in APK: ${url}`);
  const absolute = path.resolve(root, entry.file);
  assert.ok(absolute.startsWith(root + path.sep));
  const bytes = await readFile(absolute);
  assert.equal(bytes.length, entry.bytes, url);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, url);
  const { file, ...publicEntry } = entry;
  publicEntries[url] = publicEntry;
}
assert.equal(createHash('sha256').update(JSON.stringify(publicEntries)).digest('hex').slice(0, 16), manifest.version);
console.log(`Media seed ${manifest.version}: ${Object.keys(manifest.files).length} files verified; HTML, JS, CSS, JSON, API and sockets excluded.`);
