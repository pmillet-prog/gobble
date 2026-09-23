import React from "react";
import AvatarPortrait from "./AvatarPortrait.jsx";
import { accountAvatarStore } from "./accountAvatarStore.js";

export default function LocalPlayerAvatar({ userId, fallbackValue = null, ...props }) {
  const account = React.useSyncExternalStore(accountAvatarStore.subscribe, accountAvatarStore.getSnapshot, accountAvatarStore.getSnapshot);
  const confirmed = account.ready && account.userId === Number(userId);
  return <AvatarPortrait value={confirmed ? account.avatar : fallbackValue} {...props} />;
}
