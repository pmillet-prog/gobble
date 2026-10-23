import React from "react";
import { useChatUnreadState } from "../../features/chat/useChatUnreadState.js";
import { UI_IMAGE_KEYS, getUiImageUrl } from "../../assets/uiAssetManifest.js";

export default function GotusChatButton({ chat = {}, training = false }) {
  const unread = useChatUnreadState();
  const count = training ? unread.homeChatUnreadCount : unread.mobileChatUnreadCount;
  const botOnly = training ? unread.homeChatUnreadIsBotOnly : unread.mobileChatUnreadIsBotOnly;
  return <button type="button" onClick={() => chat.onOpenChat?.()} aria-label="Ouvrir le chat"
    data-chat-launcher-button="true" className="gotus__chat-button relative inline-flex shrink-0 items-center justify-center"
    style={{ height: 44, width: 44 }}>
    <img src={getUiImageUrl(UI_IMAGE_KEYS.live.chat)} alt="" aria-hidden="true" draggable="false"
      className="h-full w-full object-contain drop-shadow-md" />
    {count > 0 ? <span className={`absolute flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-extrabold shadow-md ${botOnly ? "bg-amber-400 text-slate-950" : "bg-red-600 text-white"}`}
      style={{ height: 16, top: "8%", right: "4%", transform: "translate(32%, -24%)" }}>
      {botOnly ? "?" : count >= 10 ? "9+" : count}
    </span> : null}
  </button>;
}
