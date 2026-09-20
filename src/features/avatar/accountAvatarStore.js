import { useCallback, useSyncExternalStore } from "react";
import { requestAccountAvatar } from "./avatarApi.js";
import { createAccountAvatarSync } from "./createAccountAvatarSync.js";
import { cacheAccountAvatar, readSavedLocalAvatar } from "./avatarStore.js";
import { loadAvatarCatalog } from "./avatarCatalog.js";
import { normalizeAvatar } from "./avatarState.js";
import { chatAvatarRevisions } from "./chatAvatarRevisions.js";
import { weeklyAuraStore } from "./weeklyAuraStore.js";

export const accountAvatarStore = createAccountAvatarSync({
  request: requestAccountAvatar, readLocal: readSavedLocalAvatar, cacheLocal: cacheAccountAvatar,
  prepareLocal: async avatar => normalizeAvatar(avatar, await loadAvatarCatalog()),
  onAccepted: chatAvatarRevisions.update,
  onWeeklyAuras: weeklyAuraStore.update,
});

export function useAccountAvatar(userId) {
  return useSyncExternalStore(accountAvatarStore.subscribe, useCallback(() => {
    const state = accountAvatarStore.getSnapshot();
    return state.userId === Number(userId) ? state.avatar : null;
  }, [userId]), () => null);
}
