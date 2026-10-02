import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { BOOT_ASSET_MANIFEST_BASE } from '../../src/assets/bootAssetManifest.js';
import { buildUiAssetManifest } from '../../src/assets/uiAssetManifest.js';
import { collectRuntimeMedia, isSeedMediaPath, MEDIA_SEED_MAX_BYTES, mediaMime } from './media-policy.mjs';

function manifestFromFiles(files) {
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b, 'en')));
  return { schema: 2, origin: 'https://gobble.fr', version: createHash('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 16), files: sorted };
}

export function createMediaSeed(manifest) {
  const files = Object.fromEntries(Object.entries(manifest.files)
    .filter(([url]) => isSeedMediaPath(url)).map(([url, entry]) => [url, { ...entry }]));
  const bytes = Object.values(files).reduce((total, entry) => total + entry.bytes, 0);
  if (bytes > MEDIA_SEED_MAX_BYTES) {
    throw new Error(`APK media seed exceeds its ${MEDIA_SEED_MAX_BYTES} byte budget (${bytes}); keep optional media in the on-demand cache`);
  }
  return manifestFromFiles(files);
}

// Shared by the ordinary web build and the APK's optional media seed. Code and
// mutable JSON catalogs must never enter the native store.
export async function createMediaManifest(root) {
  const publicRoot = path.resolve(root, 'public'), files = {};
  async function include(candidate) {
    const url = new URL(candidate, 'https://gobble.fr');
    if (url.origin !== 'https://gobble.fr') throw new Error('Foreign media origin');
    const relative = decodeURIComponent(url.pathname).slice(1);
    const absolute = path.resolve(publicRoot, relative);
    if (!absolute.startsWith(publicRoot + path.sep)) throw new Error('Unsafe media path');
    const mime = mediaMime('/' + relative);
    if (!mime) return false;
    if (files['/' + relative]) return true;
    try { if (!(await stat(absolute)).isFile()) return false; } catch { return false; }
    const bytes = await readFile(absolute);
    files['/' + relative] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), mime };
    return true;
  }
  const images = [...BOOT_ASSET_MANIFEST_BASE, ...buildUiAssetManifest({ preferWide: false }), ...buildUiAssetManifest({ preferWide: true })]
    .filter(entry => entry.type === 'image');
  for (const entry of images) {
    let found = false;
    for (const candidate of entry.candidates) if (await include(candidate)) { found = true; break; }
    if (!found) throw new Error(`Missing UI media: ${entry.key}`);
  }
  for (const name of ['introgobble.gif', 'favicon.png', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png',
    'icon.svg', 'dico.txt', 'sound/ui/click.wav', 'sound/ui/intro.wav']) {
    if (!await include('/' + name)) throw new Error(`Missing media: ${name}`);
  }
  const runtime = await collectRuntimeMedia(root);
  for (const url of runtime.required) if (!await include(url)) throw new Error(`Missing runtime media: ${url}`);
  // Some source references intentionally name absent fallback formats. Include
  // every existing direct URL without changing those browser fallback chains.
  for (const url of runtime.optional) await include(url);
  return manifestFromFiles(files);
}
