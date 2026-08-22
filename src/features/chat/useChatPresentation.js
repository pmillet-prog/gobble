import React from "react";

import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import {
  isSystemChatMessage,
} from "../../utils/chatMessages.js";
import { shouldDisplayChatMessageForBotSettings } from "../../components/chat/chatBotVisibility.js";

const CHAT_PRESENTATION_FIELDS = Object.freeze([
  "blockedInstallIds",
  "botVisibility",
  "messages",
  "showBotMessages",
  "tab",
]);

export function useChatPresentation() {
  const chat = useFeatureRuntime("chat");
  const state = useFeatureFields(chat, CHAT_PRESENTATION_FIELDS);
  return React.useMemo(() => {
    const blockedSet = new Set(state.blockedInstallIds || []);
    const filteredMessages = (state.messages || []).filter((message) => {
      const installId =
        typeof message?.installId === "string" ? message.installId : "";
      return !installId || !blockedSet.has(installId);
    });
    const messagesOnly = filteredMessages.filter(
      (message) =>
        !isSystemChatMessage(message) &&
        shouldDisplayChatMessageForBotSettings(
          message,
          state.showBotMessages,
          state.botVisibility
        )
    );
    const systemMessages = filteredMessages.filter(isSystemChatMessage);
    const safeTab = state.tab === "system" ? "system" : "messages";
    const visibleMessages =
      safeTab === "system" ? systemMessages : messagesOnly;
    const blockedLabels = new Map();
    for (const message of state.messages || []) {
      const installId =
        typeof message?.installId === "string" ? message.installId : "";
      const nick = String(message?.nick || message?.author || "").trim();
      if (installId && nick) blockedLabels.set(installId, nick);
    }

    return {
      blockedCount: blockedSet.size,
      blockedEntries: [...blockedSet].map((id) => ({
        id,
        label: blockedLabels.get(id) || `Joueur ${id.slice(0, 6)}`,
      })),
      lastMessageId: visibleMessages.at(-1)?.id ?? null,
      messagesOnly,
      systemCount: systemMessages.length,
      systemMessages,
      visibleMessages,
    };
  }, [state]);
}
