import React from "react";
import AvatarPortrait from "./AvatarPortrait.jsx";
import { useAccountAvatar } from "./accountAvatarStore.js";

export default function LocalPlayerAvatar({ userId, fallbackValue = null, ...props }) {
  const accountValue = useAccountAvatar(userId);
  return <AvatarPortrait value={accountValue ?? fallbackValue} {...props} />;
}
