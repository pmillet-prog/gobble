export const CLIENT_VERSION_META = 'gobble-client-version';
// No media extension: both the service worker and Android's media cache must
// leave this small live manifest on the normal network path.
export const CLIENT_VERSION_PATH = '/client-version';
export const isClientVersion = value => typeof value === 'string' && /^[a-f0-9]{20}$/.test(value);
export function clientVersionFromHtml(html) {
  return String(html).match(/<meta name="gobble-client-version" content="([a-f0-9]{20})">/)?.[1] || null;
}
