import { useCallback, useSyncExternalStore } from "react";
import { avatarThumbnailCache } from "./avatarThumbnailCache.js";

export default function useCachedAvatarThumbnail(source) {
  const snapshot = useCallback(() => avatarThumbnailCache.snapshot(source), [source]);
  const subscribe = useCallback(listener => avatarThumbnailCache.subscribe(source, listener), [source]);
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
