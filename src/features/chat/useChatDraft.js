import React from "react";

import {
  useFeatureRuntime,
  useFeatureSelector,
} from "../../app/react/useFeatureRuntime.js";

export function useChatDraft() {
  const chat = useFeatureRuntime("chat");
  const input = useFeatureSelector(chat, (state) => state.input);
  const setInput = React.useCallback(
    (nextOrUpdater) => chat.set("input", nextOrUpdater),
    [chat]
  );
  return { chatInput: input, setChatInput: setInput };
}
