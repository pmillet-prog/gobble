import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CLIENT_VERSION_META, CLIENT_VERSION_PATH } from '../shared/clientVersion.js';

export function stampClientVersion(html) {
  const clean = html.replace(/<meta name="gobble-client-version" content="[a-f0-9]{20}">/g, '');
  // Vite's entry/CSS names include their dependency hashes. Rebuilding the same
  // application keeps the same identity; restarting a server changes nothing.
  const version = createHash('sha256').update(clean).digest('hex').slice(0, 20);
  if (!clean.includes('</head>')) throw new Error('Client version requires the game HTML');
  return { version, html: clean.replace('</head>', `<meta name="${CLIENT_VERSION_META}" content="${version}"></head>`) };
}

export function clientVersionPlugin() {
  let config;
  return {
    name: 'gobble-client-version', apply: 'build',
    configResolved(value) { config = value; },
    async writeBundle() {
      const output = path.resolve(config.root, config.build.outDir);
      const index = path.join(output, 'index.html');
      const stamped = stampClientVersion(await readFile(index, 'utf8'));
      await writeFile(index, stamped.html);
      await writeFile(path.join(output, CLIENT_VERSION_PATH.slice(1)), JSON.stringify({ schema: 1, version: stamped.version }));
    },
  };
}
