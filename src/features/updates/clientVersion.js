import { CLIENT_VERSION_META, isClientVersion } from '../../../shared/clientVersion.js';

const version = globalThis.document?.querySelector(`meta[name="${CLIENT_VERSION_META}"]`)?.content;
export const CLIENT_VERSION = isClientVersion(version) ? version : null;
