import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { withAvatarAccessories } from '../../shared/avatarObjectives.js';

export const MEDIA_MIME = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', txt: 'text/plain',
});

export function mediaMime(url) {
  const extension = path.posix.extname(url).slice(1).toLowerCase();
  return extension === 'txt' && url !== '/dico.txt' ? undefined : MEDIA_MIME[extension];
}

// The web manifest remains exhaustive. Only this smaller, explicit selection
// ships in the APK; other manifest entries use the same verified disk cache on
// first use. Do not turn catalogue growth into an ever-growing installer.
export const MEDIA_SEED_MAX_BYTES = 30 * 1024 * 1024;
const SEED_MEDIA_FILES = new Set([
  '/apple-touch-icon.png', '/assets/qpug-flat.png', '/avatars/default.png',
  '/dico.txt', '/favicon.png', '/favicon-16x16.png', '/favicon-32x32.png',
  '/g.png', '/Gobblars.png', '/icon.svg', '/introgobble.gif',
]);
const SEED_MEDIA_DIRECTORIES = [
  '/background/', '/bigwords/', '/buttons/', '/chalkboard/', '/chalkfont/',
  '/emojis/', '/fonts/', '/sound/ui/', '/vocab-ranks/',
];

export function isSeedMediaPath(url) {
  return Boolean(mediaMime(url)) && (SEED_MEDIA_FILES.has(url)
    || SEED_MEDIA_DIRECTORIES.some(directory => url.startsWith(directory))
    || /^\/bots\/presenters\/[^/]+\/button\.webp$/.test(url));
}

async function walk(directory, visit) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute, visit);
    else if (entry.isFile()) await visit(absolute);
  }
}

// Follow literal public-media URLs as features are added, without putting any
// source code, API response or mutable catalogue into the native media store.
// Dynamic URL families below remain explicit, so source art and retired exports
// elsewhere in public/ are not accidentally copied into every APK.
export function literalMediaUrls(source) {
  const urls = new Set();
  const literals = source.replaceAll('${SOUND_ROOT}', '/sound');
  for (const match of literals.matchAll(/["'`(](\/[^"'`(){}\r\n\\]+?\.(?:png|jpe?g|webp|gif|svg|ttf|otf|woff2?|wav|mp3|m4a|ogg))(?=[?#"'`)\s])/gi)) {
    urls.add(match[1]);
  }
  return urls;
}

export function avatarMediaUrls(catalog) {
  const enriched = withAvatarAccessories(catalog);
  const parts = [...enriched.bases, ...Object.values(enriched.families).flat()];
  return new Set(parts.flatMap(part => [part.file, part.mask, ...Object.values(part.layers || {}),
    ...Object.values(part.masks || {})]).filter(Boolean).map(file => '/avatars/v1/' + file));
}

export async function collectRuntimeMedia(root) {
  const required = new Set(), optional = new Set();
  const publicRoot = path.join(root, 'public');
  // Font filenames are provided by the web API. Presenter frames and sound
  // banks also construct some filenames rather than storing literal URLs.
  for (const directory of ['fonts', 'chalkfont', 'bots/presenters', 'sound/game/piano', 'sound/music']) {
    await walk(path.join(publicRoot, directory), absolute => {
      const url = '/' + path.relative(publicRoot, absolute).replaceAll('\\', '/');
      if (mediaMime(url)) required.add(url);
    });
  }
  const catalog = JSON.parse(await readFile(path.join(publicRoot, 'avatars/v1/catalog.json'), 'utf8'));
  for (const url of avatarMediaUrls(catalog)) required.add(url);

  for (const directory of ['src', 'shared']) {
    await walk(path.join(root, directory), async absolute => {
      const relative = path.relative(root, absolute).replaceAll('\\', '/');
      if (!/\.(?:[cm]?js|jsx|css|json)$/.test(relative)
        || /(?:^|\/)(?:demo|fixtures)(?:\/|$)|\.test\.|(?:^|\/)LegacyApp\.jsx$/.test(relative)
        // These manifests already choose the preferred available format. Their
        // PNG fallback/source exports must not duplicate the WebP seed.
        || /^src\/assets\/(?:bootAssetManifest|assetManifest|uiAssetManifest)\.js$/.test(relative)) return;
      for (const url of literalMediaUrls(await readFile(absolute, 'utf8'))) optional.add(url);
    });
  }
  // The general emoji picker renders Unicode glyphs. Only this renderer uses
  // OpenMoji files; follow its complete mapping, including future reactions.
  const reactions = await readFile(path.join(root, 'src/components/chat/NotebookReactionEmoji.jsx'), 'utf8');
  for (const match of reactions.matchAll(/:\s*"([\dA-F]+(?:-[\dA-F]+)*)"/g)) {
    required.add(`/emojis/openmoji-svg-black/${match[1]}.svg`);
  }
  return { required, optional };
}
