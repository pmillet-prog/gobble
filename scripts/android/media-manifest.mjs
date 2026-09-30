import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { BOOT_ASSET_MANIFEST_BASE } from '../../src/assets/bootAssetManifest.js';
import { buildUiAssetManifest } from '../../src/assets/uiAssetManifest.js';

const MIME = { png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', wav: 'audio/wav', mp3: 'audio/mpeg', txt: 'text/plain' };

// Shared by the ordinary web build and the APK's optional media seed. Code and
// mutable JSON catalogs must never enter the native store.
export async function createMediaManifest(root) {
  const publicRoot = path.join(root, 'public'), files = {};
  async function include(candidate) {
    const relative = decodeURIComponent(new URL(candidate, 'https://gobble.fr').pathname).slice(1);
    const absolute = path.resolve(publicRoot, relative);
    if (!absolute.startsWith(publicRoot + path.sep)) throw new Error('Unsafe media path');
    const mime = MIME[path.extname(relative).slice(1).toLowerCase()];
    if (!mime || (relative.endsWith('.txt') && relative !== 'dico.txt')) return false;
    try { if (!(await stat(absolute)).isFile()) return false; } catch { return false; }
    const bytes = await readFile(absolute);
    files['/' + relative] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), mime };
    return true;
  }
  const images = [...BOOT_ASSET_MANIFEST_BASE, ...buildUiAssetManifest({ preferWide: false }), ...buildUiAssetManifest({ preferWide: true })]
    .filter(entry => entry.type === 'image' && entry.priority === 'critical');
  for (const entry of images) {
    let found = false;
    for (const candidate of entry.candidates) if (await include(candidate)) { found = true; break; }
    if (!found) throw new Error(`Missing critical media: ${entry.key}`);
  }
  for (const name of ['introgobble.gif', 'favicon.png', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png',
    'icon.svg', 'dico.txt', 'sound/ui/click.wav', 'sound/ui/intro.wav']) {
    if (!await include('/' + name)) throw new Error(`Missing media: ${name}`);
  }
  async function fonts(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await fonts(absolute);
      else if (entry.isFile()) await include('/' + path.relative(publicRoot, absolute).replaceAll('\\', '/'));
    }
  }
  await fonts(path.join(publicRoot, 'fonts'));
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b, 'en')));
  return { schema: 2, origin: 'https://gobble.fr', version: createHash('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 16), files: sorted };
}
