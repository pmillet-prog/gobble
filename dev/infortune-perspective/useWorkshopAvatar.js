import React from 'react';
import { DEFAULT_AVATAR } from '../../src/features/avatar/avatarState.js';

// A disconnected local trial uses a source-rendered demo avatar. An authenticated
// trial resolves the actual account; it never reads another account's local cache.
export default function useWorkshopAvatar() {
  const [identity, setIdentity] = React.useState({ avatar: DEFAULT_AVATAR });
  React.useEffect(() => {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 6500);
    fetch('/api/auth/status', { method: 'POST', credentials: 'include', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}' })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted && data?.status === 'authenticated' && data.user?.id) setIdentity({ userId: data.user.id }); })
      .catch(() => {}).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, []);
  return identity;
}
