import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function nativeMediaManifestPlugin() {
  let config;
  return {
    name: 'gobble-native-media-manifest', apply: 'build',
    configResolved(value) { config = value; },
    async writeBundle() {
      const { createMediaManifest } = await import(pathToFileURL(path.join(config.root, 'scripts/android/media-manifest.mjs')).href);
      const manifest = await createMediaManifest(config.root);
      await writeFile(path.resolve(config.root, config.build.outDir, 'native-assets.json'), JSON.stringify(manifest));
    },
  };
}
