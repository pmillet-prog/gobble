import React from "react";

const DEFAULT_BOTTOM_EPSILON_PX = 36;

function normalizeIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

export function getChatMessageKey(message, index = 0) {
  if (!message || typeof message !== "object") return `missing:${index}`;
  const id = typeof message.id === "string" ? message.id.trim() : "";
  if (id) return `id:${id}`;
  const timestamp = message.t ?? message.ts ?? message.timestamp ?? message.createdAt ?? 0;
  const author = String(message.nick || message.author || "").trim();
  const text = String(message.text || "");
  return `fallback:${timestamp}:${author}:${text}:${index}`;
}

export function isOwnChatMessage(message, selfNick = "", selfInstallId = "") {
  if (!message || typeof message !== "object") return false;
  const authorInstallId = String(message.installId || "").trim();
  const ownInstallId = String(selfInstallId || "").trim();
  if (authorInstallId && ownInstallId && authorInstallId === ownInstallId) return true;
  const author = normalizeIdentity(message.nick || message.author);
  const ownNick = normalizeIdentity(selfNick);
  return !!author && !!ownNick && author === ownNick;
}

export default function useChatAutoScroll({
  enabled = true,
  layoutKey = "",
  messages = [],
  resetKey = "",
  selfInstallId = "",
  selfNick = "",
  shouldForceOwnMessage = true,
  bottomEpsilonPx = DEFAULT_BOTTOM_EPSILON_PX,
} = {}) {
  const listRef = React.useRef(null);
  const endRef = React.useRef(null);
  const animationFrameRef = React.useRef(null);
  const timerRefs = React.useRef([]);
  const stickToBottomRef = React.useRef(true);
  const lastForcedOwnMessageKeyRef = React.useRef("");
  const safeMessages = Array.isArray(messages) ? messages : [];
  const lastMessage = safeMessages[safeMessages.length - 1] || null;
  const lastMessageKey = getChatMessageKey(lastMessage, safeMessages.length - 1);
  const lastMessageIsOwn = isOwnChatMessage(lastMessage, selfNick, selfInstallId);

  const clearAutoScroll = React.useCallback(() => {
    if (typeof window !== "undefined" && animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = null;
    timerRefs.current.forEach((timerId) => window.clearTimeout(timerId));
    timerRefs.current = [];
  }, []);

  const isNearBottom = React.useCallback(
    (node) => {
      if (!node) return true;
      const remaining = node.scrollHeight - node.clientHeight - node.scrollTop;
      return remaining <= bottomEpsilonPx;
    },
    [bottomEpsilonPx]
  );

  const scrollToBottom = React.useCallback(() => {
    const node = listRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    } else {
      endRef.current?.scrollIntoView({ block: "end" });
    }
    stickToBottomRef.current = true;
  }, []);

  const scheduleAutoScroll = React.useCallback(
    ({ force = false } = {}) => {
      if (typeof window === "undefined" || !enabled) return;
      if (!force && !stickToBottomRef.current) return;
      clearAutoScroll();
      scrollToBottom();
      const firstFrame = window.requestAnimationFrame(() => {
        scrollToBottom();
        animationFrameRef.current = window.requestAnimationFrame(scrollToBottom);
      });
      animationFrameRef.current = firstFrame;
      [80, 180, 360].forEach((delayMs) => {
        timerRefs.current.push(window.setTimeout(scrollToBottom, delayMs));
      });
    },
    [clearAutoScroll, enabled, scrollToBottom]
  );

  const handleScroll = React.useCallback(
    (event) => {
      const node = event?.currentTarget || listRef.current;
      const nearBottom = isNearBottom(node);
      stickToBottomRef.current = nearBottom;
      // Une remontée manuelle annule les rappels différés qui pourraient ramener en bas.
      if (!nearBottom) clearAutoScroll();
    },
    [clearAutoScroll, isNearBottom]
  );

  React.useEffect(() => {
    if (!enabled) return clearAutoScroll;
    stickToBottomRef.current = true;
    scheduleAutoScroll({ force: true });
    return clearAutoScroll;
  }, [enabled, resetKey, scheduleAutoScroll, clearAutoScroll]);

  React.useEffect(() => {
    if (!enabled) return clearAutoScroll;
    const forceOwnMessage =
      shouldForceOwnMessage &&
      lastMessageIsOwn &&
      lastMessageKey !== lastForcedOwnMessageKeyRef.current;
    if (forceOwnMessage) {
      lastForcedOwnMessageKeyRef.current = lastMessageKey;
    }
    scheduleAutoScroll({ force: forceOwnMessage });
    return clearAutoScroll;
  }, [
    enabled,
    layoutKey,
    lastMessageKey,
    lastMessageIsOwn,
    shouldForceOwnMessage,
    scheduleAutoScroll,
    clearAutoScroll,
  ]);

  React.useEffect(() => clearAutoScroll, [clearAutoScroll]);

  return {
    clearAutoScroll,
    endRef,
    handleScroll,
    isNearBottom,
    listRef,
    scheduleAutoScroll,
    stickToBottomRef,
  };
}
