import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMediaManifest } from './media-manifest.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'android-hybrid/app/build/generated/web-assets');
if (path.relative(root, output) !== path.join('android-hybrid', 'app', 'build', 'generated', 'web-assets')) throw new Error('Unsafe output path');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const manifest = await createMediaManifest(root);
for (const [url, entry] of Object.entries(manifest.files)) {
  const relative = url.slice(1);
  const target = path.join(output, 'media', relative);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(root, 'public', relative), target);
  entry.file = 'media/' + relative;
}
await writeFile(path.join(output, 'bundle-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ version: manifest.version, files: Object.keys(manifest.files).length,
  bytes: Object.values(manifest.files).reduce((sum, file) => sum + file.bytes, 0), output, code: 'loaded from website' }, null, 2));
