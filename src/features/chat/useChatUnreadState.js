import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";

const CHAT_UNREAD_FIELDS = Object.freeze([
  "homeBotUnreadCount",
  "homeUnreadCount",
  "mobileBotUnreadCount",
  "mobileUnreadCount",
]);

export function useChatUnreadState() {
  const chat = useFeatureRuntime("chat");
  const state = useFeatureFields(chat, CHAT_UNREAD_FIELDS);
  return {
    homeChatUnreadCount: state.homeUnreadCount,
    homeChatUnreadIsBotOnly:
      state.homeUnreadCount > 0 &&
      state.homeBotUnreadCount >= state.homeUnreadCount,
    mobileChatUnreadCount: state.mobileUnreadCount,
    mobileChatUnreadIsBotOnly:
      state.mobileUnreadCount > 0 &&
      state.mobileBotUnreadCount >= state.mobileUnreadCount,
  };
}
