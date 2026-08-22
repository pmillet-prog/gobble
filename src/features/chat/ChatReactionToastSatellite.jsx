import React from "react";

import ChatReactionToastLayer from "../../components/chat/ChatReactionToastLayer.jsx";
import {
  useFeatureRuntime,
  useFeatureSelector,
} from "../../app/react/useFeatureRuntime.js";

export default function ChatReactionToastSatellite() {
  const chat = useFeatureRuntime("chat");
  const toasts = useFeatureSelector(chat, (state) => state.mobileReactionToasts);
  return <ChatReactionToastLayer toasts={toasts} />;
}
