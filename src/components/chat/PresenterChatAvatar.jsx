import React from "react";

const AVATAR_BY_PRESENTER = Object.freeze({
  capello: "/bots/presenters/capello/button.webp",
  lepers: "/bots/presenters/lepers/button.webp",
  pivot: "/bots/presenters/pivot/button.webp",
  romejko: "/bots/presenters/romejko/button.webp",
});

const PRESENTER_BY_CATEGORY = Object.freeze({
  coach: "capello",
  culture: "lepers",
  detective: "romejko",
  linguist: "pivot",
  statistician: "romejko",
});

const PRESENTER_BY_AUTHOR = Object.freeze({
  "bernard pinot": "pivot",
  "julien lechéper": "lepers",
  "laurent rhum&co": "romejko",
  "maître gobbello": "capello",
});

export function getPresenterChatAvatarUrl(message) {
  const explicit = String(message?.meta?.avatarUrl || "").trim();
  if (explicit) return explicit;
  const presenterKey = String(message?.meta?.presenterKey || "").trim();
  const category = String(message?.meta?.category || "").trim();
  const author = String(message?.nick || message?.author || "")
    .trim()
    .toLocaleLowerCase("fr");
  const resolvedKey =
    presenterKey || PRESENTER_BY_CATEGORY[category] || PRESENTER_BY_AUTHOR[author] || "";
  return AVATAR_BY_PRESENTER[resolvedKey] || "";
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
