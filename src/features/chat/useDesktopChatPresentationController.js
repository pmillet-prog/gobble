import React from "react";

import {
  useFeatureRuntime,
  useFeatureSelector,
} from "../../app/react/useFeatureRuntime.js";
import { normalizeChatDesktopFontScale } from "../preferences/createPreferencesFeature.js";
import { isSystemChatMessage } from "../../utils/chatMessages.js";

const DESKTOP_CHAT_BOTTOM_EPSILON_PX = 28;

function isNearBottom(listElement) {
  if (!listElement) return true;
  const remaining =
    listElement.scrollHeight -
    listElement.clientHeight -
    listElement.scrollTop;
  return remaining <= DESKTOP_CHAT_BOTTOM_EPSILON_PX;
}

function resizeInput(inputElement) {
  if (!inputElement || inputElement.tagName !== "TEXTAREA") return;
  inputElement.style.height = "auto";
  const nextHeight = Math.min(inputElement.scrollHeight, 140);
  inputElement.style.height = `${Math.max(40, nextHeight)}px`;
  inputElement.style.overflowY =
    inputElement.scrollHeight > 140 ? "auto" : "hidden";
}

export default function useDesktopChatPresentationController({
  chatDesktopFontScale,
  chatInputRef,
  contextKey = "",
  enabled = true,
  setChatDesktopFontScale,
}) {
  const chatFeature = useFeatureRuntime("chat");
  const chatTab = useFeatureSelector(chatFeature, (state) =>
    state.tab === "system" ? "system" : "messages"
  );
  const listRef = React.useRef(null);
  const stickToBottomRef = React.useRef(true);
  const focusRestoreUntilRef = React.useRef(0);
  const focusWasAtBottomRef = React.useRef(true);
  const autoScrollRafRef = React.useRef(null);
  const listMountRafRef = React.useRef(null);
  const autoScrollTimersRef = React.useRef([]);
  const pendingFontScaleScrollRef = React.useRef(false);

  const clearAutoScroll = React.useCallback(() => {
    if (typeof window !== "undefined") {
      if (autoScrollRafRef.current != null) {
        window.cancelAnimationFrame(autoScrollRafRef.current);
      }
      if (listMountRafRef.current != null) {
        window.cancelAnimationFrame(listMountRafRef.current);
      }
    }
    autoScrollRafRef.current = null;
    listMountRafRef.current = null;
    autoScrollTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    autoScrollTimersRef.current = [];
  }, []);

  const handleScroll = React.useCallback((event) => {
    const listElement = event?.currentTarget || listRef.current;
    if (
      Date.now() < focusRestoreUntilRef.current &&
      !isNearBottom(listElement)
    ) {
      return;
    }
    stickToBottomRef.current = isNearBottom(listElement);
  }, []);

  const scheduleAutoScroll = React.useCallback(
    (options = {}) => {
      if (!enabled || typeof window === "undefined") return;
      const force = !!options?.force;
      if (!force && !stickToBottomRef.current) return;
      const scrollToBottom = () => {
        const listElement = listRef.current;
        if (!listElement) return;
        listElement.scrollTop = Math.max(
          0,
          listElement.scrollHeight - listElement.clientHeight
        );
        stickToBottomRef.current = true;
      };
      clearAutoScroll();
      scrollToBottom();
      const firstRaf = window.requestAnimationFrame(() => {
        scrollToBottom();
        autoScrollRafRef.current =
          window.requestAnimationFrame(scrollToBottom);
      });
      autoScrollRafRef.current = firstRaf;
      [80, 180, 320].forEach((delayMs) => {
        const timerId = setTimeout(scrollToBottom, delayMs);
        autoScrollTimersRef.current.push(timerId);
      });
    },
    [clearAutoScroll, enabled]
  );

  const prepareInputFocus = React.useCallback(() => {
    if (!enabled) return;
    const listElement = listRef.current;
    focusWasAtBottomRef.current =
      stickToBottomRef.current || isNearBottom(listElement);
  }, [enabled]);

  const restoreAfterInputFocus = React.useCallback(
    (wasAtBottom = focusWasAtBottomRef.current) => {
      if (!enabled || !wasAtBottom) return;
      focusRestoreUntilRef.current = Date.now() + 450;
      stickToBottomRef.current = true;
      scheduleAutoScroll({ force: true });
    },
    [enabled, scheduleAutoScroll]
  );

  const focusInput = React.useCallback(
    (options = {}) => {
      const inputElement = chatInputRef?.current;
      if (!inputElement) return;
      const preventScroll = options.preventScroll !== false;
      prepareInputFocus();
      const wasAtBottom = focusWasAtBottomRef.current;
      try {
        if (preventScroll) {
          inputElement.focus({ preventScroll: true });
        } else {
          inputElement.focus();
        }
      } catch (_) {
        try {
          inputElement.focus();
        } catch (_) {}
      }
      restoreAfterInputFocus(wasAtBottom);
    },
    [chatInputRef, prepareInputFocus, restoreAfterInputFocus]
  );

  const handleInputFocus = React.useCallback(() => {
    const state = chatFeature.store.getState();
    chatFeature.patch({
      activeArea: "chat",
      ...(!state.rulesAccepted ? { rulesOpen: true } : {}),
    });
    restoreAfterInputFocus(focusWasAtBottomRef.current);
  }, [chatFeature, restoreAfterInputFocus]);

  const handleInputKeyDown = React.useCallback(
    (event) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        chatFeature.cycleHistory(-1);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        chatFeature.cycleHistory(1);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        chatFeature.submit(null);
      }
    },
    [chatFeature]
  );

  const setInputValue = React.useCallback(
    (value, inputElement) => {
      chatFeature.set("input", value);
      resizeInput(inputElement);
    },
    [chatFeature]
  );

  const changeFontScale = React.useCallback(
    (nextValue) => {
      pendingFontScaleScrollRef.current = true;
      stickToBottomRef.current = true;
      setChatDesktopFontScale?.(normalizeChatDesktopFontScale(nextValue));
    },
    [setChatDesktopFontScale]
  );

  const setListNode = React.useCallback(
    (node) => {
      listRef.current = node;
      if (!node || !enabled || typeof window === "undefined") return;
      stickToBottomRef.current = true;
      if (listMountRafRef.current != null) {
        window.cancelAnimationFrame(listMountRafRef.current);
      }
      listMountRafRef.current = window.requestAnimationFrame(() => {
        listMountRafRef.current = null;
        if (listRef.current !== node) return;
        scheduleAutoScroll({ force: true });
      });
    },
    [enabled, scheduleAutoScroll]
  );

  React.useEffect(() => {
    if (!enabled) return undefined;
    return chatFeature.registerInputFocusHandler(focusInput);
  }, [chatFeature, enabled, focusInput]);

  React.useEffect(() => {
    if (!enabled) return undefined;
    let previousMessages = null;
    const handleMessagesChanged = () => {
      const state = chatFeature.store.getState();
      if (state.messages === previousMessages) return;
      previousMessages = state.messages;
      const listElement = listRef.current;
      if (!listElement) return;
      stickToBottomRef.current = isNearBottom(listElement);
      const safeTab = state.tab === "system" ? "system" : "messages";
      const blockedSet = new Set(state.blockedInstallIds || []);
      const hasActiveMessage = (state.messages || []).some((message) => {
        const authorInstallId =
          typeof message?.installId === "string" ? message.installId : "";
        if (authorInstallId && blockedSet.has(authorInstallId)) return false;
        const isSystem = isSystemChatMessage(message);
        return safeTab === "system" ? isSystem : !isSystem;
      });
      if (hasActiveMessage) scheduleAutoScroll();
    };
    handleMessagesChanged();
    return chatFeature.store.subscribe(handleMessagesChanged);
  }, [chatFeature, enabled, scheduleAutoScroll]);

  React.useEffect(() => {
    if (!enabled || !pendingFontScaleScrollRef.current) return;
    pendingFontScaleScrollRef.current = false;
    scheduleAutoScroll({ force: true });
  }, [chatDesktopFontScale, enabled, scheduleAutoScroll]);

  React.useEffect(() => {
    if (!enabled) return;
    scheduleAutoScroll({ force: true });
  }, [contextKey, enabled, scheduleAutoScroll]);

  React.useEffect(() => {
    if (!enabled) return;
    stickToBottomRef.current = true;
    scheduleAutoScroll({ force: true });
  }, [chatTab, enabled, scheduleAutoScroll]);

  React.useEffect(() => clearAutoScroll, [clearAutoScroll]);

  return {
    changeFontScale,
    chatFeature,
    focusInput,
    handleInputFocus,
    handleInputKeyDown,
    handleScroll,
    prepareInputFocus,
    scheduleAutoScroll,
    setInputValue,
    setListNode,
  };
}
