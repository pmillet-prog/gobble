import React from "react";
import { PRESENTER_IDENTITIES, resolvePresenterKey } from "../../features/presenters/presenterIdentity.js";

export function getPresenterChatAvatarUrl(message) {
  const explicit = String(message?.meta?.avatarUrl || "").trim();
  if (explicit) return explicit;
  return PRESENTER_IDENTITIES[resolvePresenterKey(message)]?.buttonUrl || "";
}

export default function PresenterChatAvatar({
  message,
  className = "h-7 w-7",
}) {
  const url = getPresenterChatAvatarUrl(message);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      className={`inline-block shrink-0 object-contain ${className}`}
      draggable="false"
    />
  );
}
