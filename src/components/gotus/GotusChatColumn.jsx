import React from "react";
import DesktopChatPanel from "../DesktopChatPanel.jsx";
import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import useGotusChat from "../../features/gotus/useGotusChat.js";
import {
  CHAT_DESKTOP_FONT_SCALE_MIN, CHAT_DESKTOP_FONT_SCALE_MAX, CHAT_DESKTOP_FONT_SCALE_STEP,
  DESKTOP_CHAT_EMOJIS, QUICK_REPLIES,
} from "../chat/chatPresentationConfig.js";

const CHAT_FIELDS = ["tab", "rulesAccepted", "editTarget", "replyTarget", "showBlockedList",
  "desktopEmojiPickerOpen", "homeUnreadCount", "mobileUnreadCount"];
const PREFERENCE_FIELDS = ["chatDesktopFontScale"];

export default function GotusChatColumn({ chat = {}, training = false, darkMode = false }) {
  const feature = useFeatureRuntime("chat"), preferences = useFeatureRuntime("preferences");
  const state = useFeatureFields(feature, CHAT_FIELDS);
  const { chatDesktopFontScale = 1 } = useFeatureFields(preferences, PREFERENCE_FIELDS);
  const fallbackInputRef = React.useRef(null);
  useGotusChat({ training, subscribeLobbyChat: chat.subscribeLobbyChat });
  const setFontScale = React.useCallback(value => preferences.set("chatDesktopFontScale", value), [preferences]);
  const scaled = base => Math.round(base * chatDesktopFontScale * 10) / 10;
  const font = scaled(14), meta = scaled(11);
  return <DesktopChatPanel
    appView={chat.appView || (training ? "home" : "live")} isLoggedIn={!training} phase="playing"
    chatBlockClassName={`gotus-chat-column desktop-chat-column flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border p-3 ${darkMode ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}
    darkMode={darkMode} installId={chat.installId} selfNick={chat.selfNick}
    chatInputRef={chat.chatInputRef || fallbackInputRef}
    chatInputDisabled={!state.rulesAccepted}
    chatInputPlaceholder={state.rulesAccepted ? "Écrire un message..." : "Accepte les règles pour discuter"}
    chatEditTarget={state.editTarget} chatReplyTarget={state.replyTarget}
    chatMessagesUnreadCount={training ? state.homeUnreadCount : state.mobileUnreadCount}
    desktopChatTab={state.tab === "system" ? "system" : "messages"}
    showBlockedList={state.showBlockedList} isDesktopEmojiPickerOpen={state.desktopEmojiPickerOpen}
    chatDesktopFontScale={chatDesktopFontScale} desktopChatScaleLabel={`${Math.round(chatDesktopFontScale * 100)}%`}
    chatScaleMin={CHAT_DESKTOP_FONT_SCALE_MIN} chatScaleMax={CHAT_DESKTOP_FONT_SCALE_MAX} chatScaleStep={CHAT_DESKTOP_FONT_SCALE_STEP}
    setChatDesktopFontScale={setFontScale} desktopChatFontPx={font} desktopChatInputFontPx={font}
    desktopChatLineHeightPx={Math.round(font * 1.38 * 10) / 10}
    desktopChatInputLineHeightPx={Math.round(font * 1.4 * 10) / 10}
    desktopChatMetaFontPx={meta} desktopChatMetaLineHeightPx={Math.round(meta * 1.4 * 10) / 10}
    desktopChatMicroFontPx={scaled(10)} desktopChatQuickReplyFontPx={meta}
    desktopEmojiList={DESKTOP_CHAT_EMOJIS} quickReplies={QUICK_REPLIES}
    getAuthorNickClassName={chat.getAuthorNickClassName} openUserMenu={chat.onOpenUserMenu}
    openDesktopChatReactionDetails={chat.openDesktopChatReactionDetails}
    openDesktopChatReactionPicker={chat.openDesktopChatReactionPicker}
    scheduleCloseDesktopChatReactionDetails={chat.scheduleCloseDesktopChatReactionDetails}
  />;
}
