import { chatAvatarRevisions } from '../avatar/chatAvatarRevisions.js';
import { weeklyAuraStore } from '../avatar/weeklyAuraStore.js';

// Keep the saved bust descriptors as well as their decoded images (shared by
// prepareSavedAvatar). Re-entering a plateau must not fetch the same outfits
// before it can reuse images that are already ready on this device.
export function createInfortuneContestantLoader({ revisions = chatAvatarRevisions, limit = 128, now = Date.now } = {}) {
  const appearances = new Map();
  return async function load(opponents, { signal, fetchImpl = fetch } = {}) {
    signal?.throwIfAborted();
    const ids = [...new Set(opponents.filter(player => !player.isBot && player.userId).map(player => player.userId))];
    if (!ids.length) return opponents;
    revisions.remember(ids);
    const week = weeklyAuraStore.getSnapshot()?.weekStartTs || 0;
    const keys = new Map(ids.map(id => [id, `${revisions.url(id)}:${week}`]));
    const loaded = new Map();
    for (const id of ids) {
      const key = keys.get(id), avatar = appearances.get(key);
      const expired = avatar?.weeklyAura?.expiresAt > 0 && avatar.weeklyAura.expiresAt <= now();
      if (appearances.has(key) && !expired) loaded.set(id, avatar);
    }
    const missing = ids.filter(id => !loaded.has(id));
    if (missing.length) {
      const response = await fetchImpl(`/api/auth/avatars?userIds=${missing.join(',')}`, {
        credentials: 'include', cache: 'no-store', signal, headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('infortune_avatars_unavailable');
      const body = await response.json();
      if (!body?.ok || !body.avatars || typeof body.avatars !== 'object' || Array.isArray(body.avatars)) throw new Error('infortune_avatars_invalid');
      signal?.throwIfAborted();
      for (const id of missing) loaded.set(id, body.avatars[id] || null);
    }
    const contestants = opponents.map(player => {
      if (player.isBot || !player.userId) return player;
      const key = keys.get(player.userId), avatar = loaded.get(player.userId);
      appearances.delete(key); appearances.set(key, avatar);
      return { ...player, avatar };
    });
    while (appearances.size > limit) appearances.delete(appearances.keys().next().value);
    return contestants;
  };
}

export const loadInfortuneContestants = createInfortuneContestantLoader();
