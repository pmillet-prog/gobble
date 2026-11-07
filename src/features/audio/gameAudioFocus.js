import { createFeatureStore } from '../../app/core/createFeatureStore.js';

// Temporary presentation policy, independent of the player's saved settings.
export function createGameAudioFocus() {
  const store = createFeatureStore({ ambient: false, effects: false }), claims = new Map();
  const publish = () => store.patch({ ambient: [...claims.values()].some(value => value.ambient),
    effects: [...claims.values()].some(value => value.effects) });
  return { store, claim() {
    const key = Symbol(); let released = false;
    return { set(value) { if (!released) { claims.set(key, value); publish(); } },
      release() { released = true; claims.delete(key); publish(); } };
  } };
}
export const gameAudioFocus = createGameAudioFocus();
