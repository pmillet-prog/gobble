import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useChatDraft } from "../../features/chat/useChatDraft.js";
import { useChatPresentation } from "../../features/chat/useChatPresentation.js";
import useChatAutoScroll from "./useChatAutoScroll.js";
import NotebookReactionEmoji from "./NotebookReactionEmoji.jsx";

const LONG_PRESS_MS = 420;
const SWIPE_REPLY_TRIGGER_PX = 72;
const SWIPE_REPLY_MAX_PX = 96;
const GESTURE_MOVE_CANCEL_PX = 10;
const POST_GESTURE_CLICK_SUPPRESS_MS = 380;
const FLOATING_MENU_CLOSE_GUARD_MS = 320;

function setCompositeRef(targetRef, value) {
  if (typeof targetRef === "function") {
    targetRef(value);
    return;
  }
  if (targetRef && typeof targetRef === "object") {
    targetRef.current = value;
  }
}

function isSystemAuthor(rawAuthor) {
  if (!rawAuthor) return false;
  const simplified = String(rawAuthor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return simplified === "system" || simplified === "systeme";
}

function isAmbientBotMessage(message) {
  if (!message || typeof message !== "object") return false;
  if (message?.meta?.kind === "ambient_bot_chat") return true;
  const installId = typeof message.installId === "string" ? message.installId : "";
  return installId.startsWith("ambient-bot:");
}

function formatUnreadSuffix(unreadCount) {
  const value = Number(unreadCount) || 0;
  if (value <= 0) return "";
  if (value >= 10) return " (9+)";
  return ` (${value})`;
}

const CHAT_TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

function parseMessageTimestampMs(message) {
  if (!message || typeof message !== "object") return null;
  const candidates = [message.t, message.ts, message.timestamp, message.createdAt];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
    if (typeof candidate === "string") {
      const raw = candidate.trim();
      if (!raw) continue;
      const asNumber = Number(raw);
      if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
      const parsed = Date.parse(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function formatMessageTime(message) {
  const ts = parseMessageTimestampMs(message);
  if (!Number.isFinite(ts)) return "";
  try {
    return CHAT_TIME_FORMATTER.format(new Date(ts));
  } catch (_) {
    return "";
  }
}

function isEditedMessage(message) {
  const editedAt = Number(message?.editedAt);
  return Number.isFinite(editedAt) && editedAt > 0;
}

function getReplyPreview(message) {
  if (!message || typeof message !== "object") return null;
  const reply = message.replyTo;
  if (!reply || typeof reply !== "object") return null;
  const id = typeof reply.id === "string" ? reply.id.trim() : "";
  if (!id) return null;
  const nick = String(reply.nick || reply.author || "Anonyme").trim();
  const installId =
    typeof reply.installId === "string" && reply.installId.trim()
      ? reply.installId.trim()
      : null;
  const text = String(reply.text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return { id, installId, nick: nick || "Anonyme", text };
}

function getMessageReactions(message) {
  if (!message || typeof message !== "object") return [];
  const raw = message.reactions;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out = [];
  for (const [rawEmoji, rawUsers] of Object.entries(raw)) {
    const emoji = typeof rawEmoji === "string" ? rawEmoji.trim() : "";
    if (!emoji) continue;
    const users = [];
    const seen = new Set();
    for (const rawUser of Array.isArray(rawUsers) ? rawUsers : []) {
      const installId =
        typeof rawUser?.installId === "string" ? rawUser.installId.trim() : "";
      if (!installId || seen.has(installId)) continue;
      seen.add(installId);
      const nick = typeof rawUser?.nick === "string" ? rawUser.nick.trim() : "";
      users.push({ installId, nick: nick || "Anonyme" });
    }
    if (users.length > 0) {
      out.push({ emoji, users, count: users.length });
    }
  }
  return out;
}

function clampToViewport(x, y, { marginX = 88, marginY = 92 } = {}) {
  if (typeof window === "undefined") {
    return { x, y };
  }
  const width = window.innerWidth || 320;
  const height = window.innerHeight || 600;
  return {
    x: Math.min(Math.max(marginX, x), Math.max(marginX, width - marginX)),
    y: Math.min(Math.max(marginY, y), Math.max(marginY, height - marginY)),
  };
}

function clearDocumentSelection() {
  if (typeof window === "undefined") return;
  try {
    const selection = window.getSelection?.();
    if (selection && typeof selection.removeAllRanges === "function" && selection.rangeCount > 0) {
      selection.removeAllRanges();
    }
  } catch (_) {}
}

function isFloatingMenuCloseAllowed(menuState) {
  const openedAt = Number(menuState?.openedAt) || 0;
  if (!(openedAt > 0)) return true;
  return Date.now() - openedAt >= FLOATING_MENU_CLOSE_GUARD_MS;
}

const THREE_LINE_CLAMP_STYLE = {
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const NON_SELECTABLE_TOUCH_STYLE = {
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
  WebkitUserDrag: "none",
  WebkitTapHighlightColor: "transparent",
};

function releaseCapturedPointer(state) {
  const captureTarget = state?.captureTarget;
  const pointerId = state?.pointerId;
  if (!captureTarget || pointerId === null || pointerId === undefined) return;
  if (typeof captureTarget.releasePointerCapture !== "function") return;
  try {
    if (!captureTarget.hasPointerCapture || captureTarget.hasPointerCapture(pointerId)) {
      captureTarget.releasePointerCapture(pointerId);
    }
  } catch (_) {}
}

export default function ChatContent({
  darkMode,
  isOpen,
  closeChat,
  chatTab,
  chatKeyboardInsetPx = 0,
  keyboardInsetReservePx = 0,
  onChangeChatTab,
  messagesUnreadCount,
  visibleMessages: visibleMessagesProp,
  showBlockedList,
  blockedEntries,
  blockedCount,
  onToggleBlockedList,
  onUnblockInstallId,
  onOpenRules,
  onOpenUserMenu,
  selfNick,
  selfInstallId,
  chatFocusPreserveKey = "",
  chatInputRef,
  chatInputDisabled,
  chatInputPlaceholder,
  onChatInputFocus,
  submitChat,
  cycleChatHistory,
  chatEditTarget = null,
  onClearChatEdit,
  chatReplyTarget = null,
  onClearChatReply,
  onEditOwnMessage,
  onDeleteOwnMessage,
  onSelectChatReply,
  onReactToMessage,
  reactionEmojis = [],
  getAuthorNickClassName = null,
  showBotMessages = true,
  onToggleShowBotMessages = null,
  onUserActivity = null,
  variant = "default",
}) {
  const { chatInput, setChatInput } = useChatDraft();
  const { visibleMessages: sharedVisibleMessages } = useChatPresentation();
  const visibleMessages = Array.isArray(visibleMessagesProp)
    ? visibleMessagesProp
    : sharedVisibleMessages;
  const isSystemTab = chatTab === "system";
  const isNotebookVariant = variant === "notebook";
  const localTextareaRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const pointerStateRef = useRef(null);
  const inputWasFocusedRef = useRef(false);
  const recentInputFocusUntilRef = useRef(0);
  const suppressClickRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const [swipePreview, setSwipePreview] = React.useState(null);
  const [reactionPicker, setReactionPicker] = React.useState(null);
  const [reactionDetails, setReactionDetails] = React.useState(null);
  const [ownMessageMenu, setOwnMessageMenu] = React.useState(null);
  const panelBorderClass = darkMode ? "border-amber-200/25" : "border-amber-300/55";
  const panelHeaderClass = darkMode
    ? "border-amber-200/25 bg-amber-300/10 text-amber-50"
    : "border-amber-300/55 bg-amber-100/65 text-slate-900";
  const panelSurfaceClass = darkMode
    ? "bg-slate-950/35 border-amber-200/25 text-amber-50"
    : "bg-white/55 border-amber-300/45 text-slate-900";
  const softSurfaceClass = darkMode
    ? "bg-slate-950/35 border-amber-200/25 text-amber-50"
    : "bg-amber-50/70 border-amber-300/45 text-slate-800";
  const inputSurfaceClass = darkMode
    ? "bg-slate-950/45 border-amber-200/30 text-amber-50 placeholder:text-amber-100/45"
    : "bg-white/80 border-amber-300/50 text-slate-900 placeholder:text-slate-500";
  const goldButtonClass =
    "bg-gradient-to-b from-amber-200 to-amber-600 border-amber-300/70 text-slate-950 shadow";
  const inactiveTabClass = darkMode ? "text-amber-50" : "text-slate-700";
  const otherMessageClass = darkMode
    ? "bg-slate-950/45 text-amber-50 border border-amber-200/20 self-start"
    : "bg-white/75 text-slate-900 border border-amber-300/35 self-start";
  const safeReactionEmojis = React.useMemo(() => {
    if (!Array.isArray(reactionEmojis)) {
      return ["👍", "❤️", "😂", "😮", "😢", "😡", "🍻", "🙏", "👏", "🎉", "👋", "😎"];
    }
    const filtered = reactionEmojis
      .map((emoji) => (typeof emoji === "string" ? emoji.trim() : ""))
      .filter(Boolean);
    return filtered.length
      ? filtered
      : ["👍", "❤️", "😂", "😮", "😢", "😡", "🍻", "🙏", "👏", "🎉", "👋", "😎"];
  }, [reactionEmojis]);
  const visibleMessagesLayoutKey = React.useMemo(() => {
    if (!Array.isArray(visibleMessages) || visibleMessages.length === 0) {
      return "empty";
    }
    return visibleMessages
      .map((msg, idx) => {
        const id = typeof msg?.id === "string" && msg.id ? msg.id : `row-${idx}`;
        const updatedAt = Number(msg?.reactionsUpdatedAt) || 0;
        const reactionCount = getMessageReactions(msg).reduce(
          (sum, entry) => sum + (Number(entry?.count) || 0),
          0
        );
        return `${id}:${updatedAt}:${reactionCount}`;
      })
      .join("|");
  }, [visibleMessages]);
  const {
    clearAutoScroll,
    endRef: messagesEndRef,
    handleScroll: handleMessagesScroll,
    listRef: messagesListRef,
    scheduleAutoScroll,
  } = useChatAutoScroll({
    enabled: isOpen,
    layoutKey: `${visibleMessagesLayoutKey}:${chatKeyboardInsetPx}:${keyboardInsetReservePx}`,
    messages: visibleMessages,
    resetKey: chatTab,
    selfInstallId,
    selfNick,
    shouldForceOwnMessage: !isSystemTab,
  });
  const dismissNotebookMobileKeyboard = React.useCallback(() => {
    if (
      !isNotebookVariant ||
      typeof window === "undefined" ||
      !window.matchMedia("(pointer: coarse) and (max-width: 900px)").matches
    ) {
      return false;
    }
    inputWasFocusedRef.current = false;
    recentInputFocusUntilRef.current = 0;
    window.setTimeout(() => {
      localTextareaRef.current?.blur?.();
      scheduleAutoScroll({ force: true });
    }, 0);
    window.setTimeout(() => scheduleAutoScroll({ force: true }), 180);
    window.setTimeout(() => scheduleAutoScroll({ force: true }), 420);
    return true;
  }, [isNotebookVariant, scheduleAutoScroll]);
  const clearLongPressTimer = React.useCallback(() => {
    if (!longPressTimerRef.current) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  const isClickSuppressed = React.useCallback(() => {
    return suppressClickRef.current || Date.now() < suppressClickUntilRef.current;
  }, []);

  const resetPointerGesture = React.useCallback(() => {
    clearLongPressTimer();
    releaseCapturedPointer(pointerStateRef.current);
    pointerStateRef.current = null;
    setSwipePreview(null);
  }, [clearLongPressTimer]);

  const abortPointerGesture = React.useCallback(() => {
    resetPointerGesture();
    suppressClickRef.current = false;
    suppressClickUntilRef.current = 0;
  }, [resetPointerGesture]);

  useEffect(() => {
    if (!isOpen) {
      setReactionPicker(null);
      setReactionDetails(null);
      setOwnMessageMenu(null);
      setSwipePreview(null);
      resetPointerGesture();
    }
  }, [isOpen, resetPointerGesture]);

  useEffect(() => {
    const el = localTextareaRef.current;
    if (!el || isSystemTab) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [chatInput, chatTab, isOpen, isSystemTab]);

  useEffect(() => {
    if (!isOpen || isSystemTab || chatInputDisabled || typeof window === "undefined") {
      return undefined;
    }
    const el = localTextareaRef.current;
    if (!el || typeof document === "undefined") return undefined;
    if (document.activeElement === el) {
      inputWasFocusedRef.current = true;
      return undefined;
    }
    const recentlyFocused = recentInputFocusUntilRef.current > Date.now();
    if (!inputWasFocusedRef.current && !recentlyFocused) return undefined;

    const rafId = window.requestAnimationFrame(() => {
      const active = document.activeElement;
      const focusMovedElsewhere =
        active &&
        active !== document.body &&
        active !== document.documentElement &&
        active !== el;
      if (focusMovedElsewhere) return;
      try {
        el.focus({ preventScroll: true });
      } catch (_) {
        try {
          el.focus();
        } catch (_) {}
      }
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [chatFocusPreserveKey, isOpen, isSystemTab, chatInputDisabled]);

  useEffect(
    () => () => {
      clearLongPressTimer();
      clearAutoScroll();
    },
    [clearLongPressTimer, clearAutoScroll]
  );

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return undefined;
    const handleSelectionChange = () => {
      const listEl = messagesListRef.current;
      if (!listEl) return;
      const selection = window.getSelection?.();
      if (!selection || selection.rangeCount <= 0) return;
      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      const selectionInsideList =
        (anchorNode && listEl.contains(anchorNode)) || (focusNode && listEl.contains(focusNode));
      if (selectionInsideList) {
        clearDocumentSelection();
      }
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [isOpen]);

  const handleKeyDown = (e) => {
    if (e.key === "ArrowUp" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (!chatInput.includes("\n")) {
        e.preventDefault();
        cycleChatHistory?.(-1);
      }
      return;
    }
    if (e.key === "ArrowDown" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (!chatInput.includes("\n")) {
        e.preventDefault();
        cycleChatHistory?.(1);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!chatInput.trim() || chatInputDisabled) return;
      submitChat?.(null);
      dismissNotebookMobileKeyboard();
    }
  };

  const handleMessagePointerDown = React.useCallback(
    (event, message, isSystem, isOwn) => {
      if (isSystem || isSystemTab) return;
      if (!message?.id) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const rawTarget = event?.target;
      const targetIsAuthorButton =
        typeof Element !== "undefined" &&
        rawTarget instanceof Element &&
        !!rawTarget.closest("[data-chat-author-button='true']");
      if (
        typeof Element !== "undefined" &&
        rawTarget instanceof Element &&
        rawTarget.closest("button, a, input, textarea, select, label") &&
        !targetIsAuthorButton
      ) {
        abortPointerGesture();
        return;
      }
      clearDocumentSelection();

      abortPointerGesture();
      const pointerState = {
        pointerId: event.pointerId,
        messageId: message.id,
        startX: Number(event.clientX) || 0,
        startY: Number(event.clientY) || 0,
        messageRect: event.currentTarget?.getBoundingClientRect?.() || null,
        captureTarget: event.currentTarget || null,
        ownMessage: !!isOwn,
        horizontalSwipe: false,
        lastDx: 0,
        longPressTriggered: false,
      };
      if (typeof event.currentTarget?.setPointerCapture === "function") {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch (_) {}
      }
      pointerStateRef.current = pointerState;
      suppressClickRef.current = false;
      if (!isOwn) {
        setSwipePreview({ messageId: message.id, dx: 0 });
      }

      longPressTimerRef.current = window.setTimeout(() => {
        const active = pointerStateRef.current;
        if (!active || active.pointerId !== event.pointerId) return;
        active.longPressTriggered = true;
        suppressClickRef.current = true;
        setSwipePreview(null);
        const anchorX = Number.isFinite(active?.messageRect?.left)
          ? active.messageRect.left + ((active.messageRect.width || 0) / 2)
          : active.startX;
        const anchorY = Number.isFinite(active?.messageRect?.top)
          ? active.messageRect.top - 8
          : active.startY - 8;
        const point = clampToViewport(anchorX, anchorY, {
          marginX: 88,
          marginY: 68,
        });
        if (active.ownMessage) {
          setOwnMessageMenu({
            message,
            x: point.x,
            y: point.y,
            openedAt: Date.now(),
          });
        } else {
          const centeredX =
            typeof window !== "undefined" && Number.isFinite(window.innerWidth)
              ? window.innerWidth / 2
              : point.x;
          setReactionPicker({
            messageId: message.id,
            x: centeredX,
            y: point.y,
            openedAt: Date.now(),
          });
        }
        if (navigator?.vibrate) {
          navigator.vibrate(10);
        }
        // On clôt explicitement le geste ici pour éviter tout état bloqué
        // (pointer capture / suppressClick) après un appui long sur message perso.
        releaseCapturedPointer(active);
        pointerStateRef.current = null;
        clearLongPressTimer();
        suppressClickUntilRef.current = Date.now() + POST_GESTURE_CLICK_SUPPRESS_MS;
        suppressClickRef.current = false;
      }, LONG_PRESS_MS);
    },
    [abortPointerGesture, clearLongPressTimer, isSystemTab]
  );

  const handleMessagePointerMove = React.useCallback(
    (event, message) => {
      const state = pointerStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (state.messageId !== message?.id) {
        abortPointerGesture();
        return;
      }
      if (state.longPressTriggered) return;
      const dx = (Number(event.clientX) || 0) - state.startX;
      const dy = (Number(event.clientY) || 0) - state.startY;
      if (
        Math.abs(dx) > GESTURE_MOVE_CANCEL_PX ||
        Math.abs(dy) > GESTURE_MOVE_CANCEL_PX
      ) {
        clearLongPressTimer();
      }
      if (state.ownMessage) return;

      if (!state.horizontalSwipe && dx > 0 && Math.abs(dx) > Math.abs(dy) && dx > 8) {
        state.horizontalSwipe = true;
      }
      if (!state.horizontalSwipe) return;
      const clampedDx = Math.max(0, Math.min(SWIPE_REPLY_MAX_PX, dx));
      state.lastDx = clampedDx;
      setSwipePreview({ messageId: message.id, dx: clampedDx });
      event.preventDefault();
    },
    [abortPointerGesture, clearLongPressTimer]
  );

  const handleMessagePointerUp = React.useCallback(
    (event, message) => {
      const state = pointerStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (state.messageId !== message?.id) {
        abortPointerGesture();
        return;
      }
      clearLongPressTimer();

      const shouldReply =
        !state.longPressTriggered &&
        !state.ownMessage &&
        state.horizontalSwipe &&
        state.lastDx >= SWIPE_REPLY_TRIGGER_PX;
      if (shouldReply) {
        onSelectChatReply?.(message);
      }
      if (state.longPressTriggered || shouldReply) {
        suppressClickUntilRef.current = Date.now() + POST_GESTURE_CLICK_SUPPRESS_MS;
        suppressClickRef.current = false;
      } else {
        suppressClickRef.current = false;
        suppressClickUntilRef.current = 0;
      }
      releaseCapturedPointer(state);
      pointerStateRef.current = null;
      setSwipePreview(null);
    },
    [abortPointerGesture, clearLongPressTimer, onSelectChatReply]
  );

  const handleMessagePointerCancel = React.useCallback(
    (event, message) => {
      const state = pointerStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (state.messageId !== message?.id) {
        abortPointerGesture();
        return;
      }
      suppressClickRef.current = false;
      resetPointerGesture();
    },
    [abortPointerGesture, resetPointerGesture]
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerCancel = () => {
      if (pointerStateRef.current) {
        abortPointerGesture();
      }
    };
    window.addEventListener("pointercancel", onPointerCancel, true);
    return () => {
      window.removeEventListener("pointercancel", onPointerCancel, true);
    };
  }, [abortPointerGesture, isOpen]);

  const openReactionDetails = React.useCallback((message, emoji) => {
    const entries = getMessageReactions(message);
    const target = entries.find((entry) => entry.emoji === emoji);
    if (!target || !target.users.length) return;
    setReactionDetails({
      messageId: message.id,
      emoji: target.emoji,
      users: target.users,
    });
  }, []);

  const openReactionPickerFromButton = React.useCallback((event, messageId) => {
    const safeMessageId = typeof messageId === "string" ? messageId.trim() : "";
    if (!safeMessageId) return;
    event?.stopPropagation?.();
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    const point = clampToViewport(
      Number.isFinite(rect?.left) ? rect.left + (rect.width || 0) / 2 : 0,
      Number.isFinite(rect?.top) ? rect.top - 8 : 0,
      { marginX: 88, marginY: 68 }
    );
    setReactionPicker({
      messageId: safeMessageId,
      x: point.x,
      y: point.y,
      openedAt: Date.now(),
    });
  }, []);

  return (
    <div className={`chat-content chat-content-${variant} flex flex-col h-full min-h-0 relative`}>
      <div
        className={`chat-content-header flex items-center justify-between px-4 py-3 border-b ${panelHeaderClass}`}
      >
        <div className="font-extrabold text-base">Chat</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`text-[11px] font-semibold ${darkMode ? "text-amber-50/75" : "text-slate-600"}`}
            onClick={onOpenRules}
          >
            Règles
          </button>
          <button
            type="button"
            className={`text-[11px] font-semibold ${darkMode ? "text-amber-200" : "text-blue-700"}`}
            onClick={onToggleBlockedList}
          >
            Joueurs bloqués ({blockedCount})
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              closeChat?.();
            }}
            onClick={(e) => e.preventDefault()}
            className={`h-10 px-4 text-sm font-semibold rounded-xl border ${goldButtonClass}`}
          >
            Fermer
          </button>
        </div>
      </div>

      <div className="chat-content-toolbar px-3 pt-2 flex items-center justify-between gap-2">
        <div
          className={`inline-flex rounded-full border p-1 ${panelSurfaceClass}`}
        >
          <button
            type="button"
            className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${
              !isSystemTab
                ? goldButtonClass
                : inactiveTabClass
            }`}
            onClick={() => onChangeChatTab?.("messages")}
          >
            Messages{formatUnreadSuffix(messagesUnreadCount)}
          </button>
          <button
            type="button"
            className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${
              isSystemTab
                ? goldButtonClass
                : inactiveTabClass
            }`}
            onClick={() => onChangeChatTab?.("system")}
          >
            Logs serveur
          </button>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={showBotMessages ? "true" : "false"}
          aria-label={showBotMessages ? "Masquer les messages bots" : "Afficher les messages bots"}
          className={`shrink-0 inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] font-bold transition ${panelSurfaceClass}`}
          onClick={() => onToggleShowBotMessages?.()}
        >
          <span className={darkMode ? "text-amber-50/85" : "text-slate-700"}>Bots</span>
          <span
            className={`relative h-5 w-9 rounded-full transition ${
              showBotMessages ? "bg-emerald-500" : darkMode ? "bg-slate-700" : "bg-slate-300"
            }`}
            aria-hidden="true"
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                showBotMessages ? "left-[18px]" : "left-0.5"
              }`}
            />
          </span>
        </button>
      </div>

      <div className="chat-content-body flex flex-col flex-1 min-h-0 px-3 py-2 gap-2">
        {showBlockedList ? (
          <div
            className={`chat-content-blocked rounded-lg border px-2 py-2 text-[11px] ${softSurfaceClass}`}
          >
            {blockedEntries.length === 0 ? (
              <div className="text-center">Aucun joueur bloque.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {blockedEntries.map((entry) => (
                  <div key={entry.id} className="inline-flex items-center gap-2">
                    <span className="font-semibold">{entry.label}</span>
                    <button
                      type="button"
                      className={`text-[11px] font-semibold ${darkMode ? "text-amber-200" : "text-blue-700"}`}
                      onClick={() => onUnblockInstallId?.(entry.id)}
                    >
                      Reactiver
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div
          ref={messagesListRef}
          className={`chat-content-messages flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 text-sm rounded-lg border p-2 ${panelSurfaceClass}`}
          style={{
            overscrollBehavior: "contain",
            touchAction: "pan-y",
            userSelect: "none",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
            WebkitUserDrag: "none",
          }}
          onTouchStartCapture={() => {
            clearDocumentSelection();
          }}
          onTouchEndCapture={() => {
            clearDocumentSelection();
          }}
          onSelectStart={(event) => {
            event.preventDefault();
          }}
          onDragStart={(event) => {
            event.preventDefault();
          }}
          onContextMenu={(event) => {
            event.preventDefault();
          }}
          onScroll={(event) => {
            handleMessagesScroll(event);
            if (event?.nativeEvent?.isTrusted !== false) {
              onUserActivity?.("chat_scroll");
            }
          }}
          onClick={(event) => {
            if (isClickSuppressed()) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (reactionPicker) setReactionPicker(null);
            if (ownMessageMenu) setOwnMessageMenu(null);
            suppressClickRef.current = false;
            suppressClickUntilRef.current = 0;
            resetPointerGesture();
          }}
        >
          {visibleMessages.length === 0 ? (
            <div className="text-sm text-slate-400 text-center mt-4">
              {isSystemTab
                ? "Aucun log de connexion/déconnexion."
                : "Aucun message pour l'instant."}
            </div>
          ) : (
            visibleMessages.map((msg, idx) => {
              const author = (msg.nick || msg.author || "Anonyme").trim();
              const authorInstallId =
                typeof msg.installId === "string" ? msg.installId : "";
              const messageTime = formatMessageTime(msg);
              const isEdited = isEditedMessage(msg);
              const systemAuthor = author || "Système";
              const isSystem = isSystemAuthor(author);
              const isAmbientBot = !isSystem && isAmbientBotMessage(msg);
              const isYou =
                !isAmbientBot &&
                (authorInstallId ? authorInstallId === selfInstallId : author === selfNick);
              const isOwn = !!isYou;
              const canOpenMenu =
                !isSystem && authorInstallId && authorInstallId !== selfInstallId;
              const replyPreview = getReplyPreview(msg);
              const replyTargetsSelf = !!(
                replyPreview &&
                ((replyPreview.installId &&
                  String(replyPreview.installId).trim() === String(selfInstallId || "").trim()) ||
                  (!replyPreview.installId &&
                    String(replyPreview.nick || "").trim() === String(selfNick || "").trim()))
              );
              const reactions = getMessageReactions(msg);
              const messageKey =
                typeof msg.id === "string" && msg.id ? msg.id : `chat-row-${idx}`;
              const dx =
                swipePreview?.messageId === msg.id && Number.isFinite(swipePreview?.dx)
                  ? swipePreview.dx
                  : 0;
              const podiumRank = Number(msg?.weeklyVocabPodiumRank) || (msg?.isWeeklyVocabChampion ? 1 : 0);
              const podiumClass =
                podiumRank === 1
                  ? "nick-podium-gold"
                  : podiumRank === 2
                  ? "nick-podium-silver"
                  : podiumRank === 3
                  ? "nick-podium-bronze"
                  : "";
              const authorNickClass =
                (typeof getAuthorNickClassName === "function"
                  ? getAuthorNickClassName(msg, author)
                  : "") || podiumClass;
              const authorBaseClass = isAmbientBot
                ? "font-semibold not-italic"
                : authorNickClass || "font-semibold";

              return (
                <div
                  key={messageKey}
                  data-chat-message-id={!isSystem && msg?.id ? msg.id : undefined}
                  data-chat-own={isOwn ? "true" : "false"}
                  data-chat-system={isSystem ? "true" : "false"}
                  data-chat-ambient={isAmbientBot ? "true" : "false"}
                  className={
                    isSystem
                      ? "px-2 py-0.5 text-sm italic text-orange-700 dark:text-amber-300"
                      : isAmbientBot
                      ? `px-2 py-0.5 text-[12px] italic rounded-md border select-none ${
                          darkMode
                            ? "bg-slate-950/45 border-slate-800 text-slate-400"
                            : "bg-amber-50/55 border-amber-100 text-amber-900/70"
                        }`
                      : `px-2 py-1 rounded-lg transition-transform duration-75 select-none ${
                          isYou
                            ? "bg-blue-600 text-white self-end"
                            : otherMessageClass
                        }`
                  }
                  style={
                    isSystem
                      ? undefined
                      : {
                          transform: `translateX(${dx}px)`,
                          touchAction: "pan-y",
                          ...NON_SELECTABLE_TOUCH_STYLE,
                        }
                  }
                  onPointerDown={(event) => {
                    if (isAmbientBot) return;
                    handleMessagePointerDown(event, msg, isSystem, isOwn);
                  }}
                  onPointerMove={(event) => handleMessagePointerMove(event, msg)}
                  onPointerUp={(event) => handleMessagePointerUp(event, msg)}
                  onPointerCancel={(event) => handleMessagePointerCancel(event, msg)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                  }}
                  onSelectStart={(event) => {
                    event.preventDefault();
                  }}
                  onDragStart={(event) => {
                    event.preventDefault();
                  }}
                  onClickCapture={(event) => {
                    if (!isClickSuppressed()) return;
                    suppressClickRef.current = false;
                    suppressClickUntilRef.current = 0;
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                >
                  {isSystem ? (
                    <div className="flex items-baseline gap-1 flex-wrap">
                      <span className="font-semibold">{systemAuthor}:</span>
                      {messageTime ? (
                        <span className="text-[10px] leading-none opacity-70">
                          {messageTime}
                        </span>
                      ) : null}
                      <span>{msg.text}</span>
                    </div>
                  ) : (
                    <>
                      {replyPreview ? (
                        <div
                          className={`chat-message-reply-preview mb-1 rounded-md border-l-4 px-2 py-1 text-[11px] ${
                            replyTargetsSelf
                              ? "border-blue-500 bg-blue-50 text-slate-700"
                              : darkMode
                              ? "border-amber-200/25 bg-slate-950/45 text-amber-50/85"
                              : "border-amber-300/45 bg-amber-50/80 text-slate-700"
                          }`}
                          style={NON_SELECTABLE_TOUCH_STYLE}
                        >
                          <div className="font-semibold" style={NON_SELECTABLE_TOUCH_STYLE}>
                            {replyPreview.nick}
                          </div>
                          <div style={{ ...THREE_LINE_CLAMP_STYLE, ...NON_SELECTABLE_TOUCH_STYLE }}>
                            {replyPreview.text}
                            <span className="chat-quote-close" aria-hidden="true">”</span>
                          </div>
                        </div>
                      ) : null}
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        {canOpenMenu ? (
                          <button
                            type="button"
                            className={`chat-message-author ${authorBaseClass} hover:underline`}
                            style={NON_SELECTABLE_TOUCH_STYLE}
                            data-chat-author-button="true"
                            onClick={(e) =>
                              onOpenUserMenu?.(e, {
                                nick: author,
                                userId: msg.userId,
                                installId: authorInstallId,
                                messageId: msg.id,
                              })
                            }
                          >
                            {author}:
                          </button>
                        ) : (
                          <span className={`chat-message-author ${authorBaseClass}`} style={NON_SELECTABLE_TOUCH_STYLE}>
                            {author}:
                          </span>
                        )}
                        {messageTime ? (
                          <span
                            className="text-[10px] leading-none opacity-70"
                            style={NON_SELECTABLE_TOUCH_STYLE}
                          >
                            {messageTime}
                          </span>
                        ) : null}
                        {isEdited ? (
                          <span
                            className="text-[10px] leading-none opacity-60"
                            style={NON_SELECTABLE_TOUCH_STYLE}
                          >
                            (modifié)
                          </span>
                        ) : null}
                        <span className="chat-message-text" style={NON_SELECTABLE_TOUCH_STYLE}>{msg.text}</span>
                        {!isAmbientBot && !isOwn ? (
                          <button
                            type="button"
                            className={`${isNotebookVariant ? "inline-flex" : "hidden md:inline-flex"} chat-message-reaction-trigger h-6 w-6 shrink-0 items-center justify-center rounded-full border opacity-70 transition hover:opacity-100 ${
                              darkMode
                                ? "border-amber-200/25 bg-slate-950/45 text-amber-50"
                                : "border-amber-300/45 bg-white/80 text-slate-700"
                            }`}
                            onClick={(event) => openReactionPickerFromButton(event, msg.id)}
                            aria-label="Réagir au message"
                            title="Réagir"
                          >
                            <span
                              className="material-icons-outlined text-[15px] leading-none"
                              aria-hidden="true"
                            >
                              add_reaction
                            </span>
                          </button>
                        ) : null}
                        {!isAmbientBot && isOwn && isNotebookVariant ? (
                          <button
                            type="button"
                            className="chat-message-edit-trigger inline-flex h-6 w-6 shrink-0 items-center justify-center"
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                              event.stopPropagation();
                              onEditOwnMessage?.(msg);
                            }}
                            aria-label="Modifier mon message"
                            title="Modifier"
                          >
                            <svg
                              width="17"
                              height="17"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M20.5 3.5c-4.8.3-8.8 2.1-11.6 5.4-2.5 2.9-3.6 6.4-3.4 10.6" />
                              <path d="M20.5 3.5c-.2 4.6-2 8.2-5.2 10.7-2.4 1.8-5.3 2.8-8.8 2.8" />
                              <path d="M6 19c2.8-3.6 6-6.5 9.7-8.8" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
                      {reactions.length ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {reactions.map((entry) => {
                            const reactedByMe = entry.users.some(
                              (user) => user.installId === selfInstallId
                            );
                            const badgeClass = `h-6 rounded-full border px-2 text-[11px] font-semibold leading-none inline-flex items-center gap-1 ${
                              reactedByMe
                                ? darkMode
                                ? "bg-blue-600/30 border-blue-300 text-blue-100"
                                : "bg-blue-100 border-blue-400 text-blue-700"
                              : darkMode
                              ? "bg-slate-950/45 border-amber-200/25 text-amber-50"
                              : "bg-white/80 border-amber-300/45 text-slate-700"
                            }`;
                            return (
                              <button
                                key={`${msg.id || messageKey}:${entry.emoji}`}
                                type="button"
                                className={`chat-message-reaction-badge ${badgeClass}`}
                                style={NON_SELECTABLE_TOUCH_STYLE}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openReactionDetails(msg, entry.emoji);
                                }}
                              >
                                {isNotebookVariant ? (
                                  <NotebookReactionEmoji
                                    className="chat-message-reaction-emoji"
                                    emoji={entry.emoji}
                                  />
                                ) : (
                                  <span className="chat-message-reaction-emoji">{entry.emoji}</span>
                                )}
                                <span>{entry.count}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {!isSystemTab ? (
          <div className="chat-content-compose shrink-0">
            {chatEditTarget ? (
              <div
                className={`chat-content-reply-target mb-2 rounded-lg border px-2 py-1.5 ${
                  softSurfaceClass
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold">Modification du message</div>
                    <div className="text-[11px]" style={THREE_LINE_CLAMP_STYLE}>
                      {chatEditTarget.text || ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`h-6 w-6 rounded-full text-xs font-bold border shrink-0 ${
                      darkMode
                        ? "border-amber-200/25 bg-slate-950/45 text-amber-50"
                        : "border-amber-300/45 bg-white/80 text-slate-700"
                    }`}
                    onClick={() => onClearChatEdit?.()}
                    aria-label="Annuler la modification"
                  >
                    x
                  </button>
                </div>
              </div>
            ) : null}
            {chatReplyTarget ? (
              <div
                className={`mb-2 rounded-lg border px-2 py-1.5 ${
                  darkMode
                    ? "bg-slate-950/35 border-amber-200/25 text-amber-50"
                    : "bg-blue-50/80 border-blue-200 text-slate-700"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold">
                      Réponse à {chatReplyTarget.nick || "Anonyme"}
                    </div>
                    <div className="text-[11px]" style={THREE_LINE_CLAMP_STYLE}>
                      {chatReplyTarget.text || ""}
                      <span className="chat-quote-close" aria-hidden="true">”</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`h-6 w-6 rounded-full text-xs font-bold border shrink-0 ${
                      darkMode
                        ? "border-amber-200/25 bg-slate-950/45 text-amber-50"
                        : "border-amber-300/45 bg-white/80 text-slate-700"
                    }`}
                    onClick={() => onClearChatReply?.()}
                    aria-label="Annuler la réponse"
                  >
                    x
                  </button>
                </div>
              </div>
            ) : null}
            <div className={`chat-content-compose-row flex items-end gap-2 pt-1 pb-1 border-t ${panelBorderClass}`}>
              <textarea
                ref={(el) => {
                  localTextareaRef.current = el;
                  setCompositeRef(chatInputRef, el);
                }}
                rows={1}
                autoComplete="on"
                autoCapitalize="on"
                spellCheck
                inputMode="text"
                enterKeyHint="send"
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-autofill="off"
                aria-autocomplete="none"
                aria-label="Message du chat"
                readOnly={chatInputDisabled}
                aria-disabled={chatInputDisabled}
                onFocus={() => {
                  inputWasFocusedRef.current = true;
                  recentInputFocusUntilRef.current = Date.now() + 2500;
                  onChatInputFocus?.();
                }}
                onBlur={() => {
                  inputWasFocusedRef.current = false;
                  recentInputFocusUntilRef.current = Date.now() + 1500;
                }}
                value={chatInput}
                onChange={(e) => {
                  setChatInput?.(e.target.value);
                  onUserActivity?.("chat_input");
                }}
                onKeyDown={handleKeyDown}
                className={`chat-content-input flex-1 border rounded px-3 py-2 text-sm ios-input chat-input resize-none min-h-[44px] max-h-[168px] ${inputSurfaceClass}`}
                placeholder={chatInputPlaceholder}
              />
              <button
                type="button"
                className={`chat-content-send px-3 py-2 text-sm rounded border disabled:opacity-50 select-none ${goldButtonClass}`}
                style={NON_SELECTABLE_TOUCH_STYLE}
                disabled={!chatInput.trim() || chatInputDisabled}
                onPointerDown={(e) => {
                  if (!chatInput.trim() || chatInputDisabled) return;
                  e.preventDefault();
                  submitChat?.();
                  if (dismissNotebookMobileKeyboard()) return;
                  const el = localTextareaRef.current;
                  if (!el) return;
                  try {
                    el.focus({ preventScroll: true });
                  } catch (_) {
                    el.focus();
                  }
                }}
                onContextMenu={(event) => event.preventDefault()}
                onSelectStart={(event) => event.preventDefault()}
                onClick={(e) => e.preventDefault()}
              >
                Envoyer
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {ownMessageMenu && !isSystemTab && typeof document !== "undefined"
        ? createPortal(
            <div
              className={`chat-reaction-portal fixed inset-0 z-[20130] ${
                isNotebookVariant ? "chat-reaction-portal-notebook" : ""
              }`}
              style={NON_SELECTABLE_TOUCH_STYLE}
              onClick={() => {
                if (!isFloatingMenuCloseAllowed(ownMessageMenu)) return;
                setOwnMessageMenu(null);
              }}
              onContextMenu={(event) => event.preventDefault()}
              onSelectStart={(event) => event.preventDefault()}
            >
              <div
                className={`fixed -translate-x-1/2 -translate-y-full rounded-full border px-2 py-1 flex items-center gap-1 shadow-xl ${
                  darkMode
                    ? "bg-slate-800 border-slate-600 text-slate-100"
                    : "bg-white border-slate-200 text-slate-900"
                }`}
                style={{
                  left: `${ownMessageMenu.x}px`,
                  top: `${ownMessageMenu.y}px`,
                  ...NON_SELECTABLE_TOUCH_STYLE,
                }}
                onClick={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
                onSelectStart={(event) => event.preventDefault()}
              >
                <button
                  type="button"
                  className={`h-9 w-9 rounded-full flex items-center justify-center ${
                    darkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"
                  }`}
                  style={NON_SELECTABLE_TOUCH_STYLE}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onEditOwnMessage?.(ownMessageMenu.message);
                    setOwnMessageMenu(null);
                  }}
                  aria-label="Modifier le message"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`h-9 w-9 rounded-full flex items-center justify-center ${
                    darkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"
                  }`}
                  style={NON_SELECTABLE_TOUCH_STYLE}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onDeleteOwnMessage?.(ownMessageMenu.message);
                    setOwnMessageMenu(null);
                  }}
                  aria-label="Supprimer le message"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                    <path d="M9 6V4h6v2" />
                  </svg>
                </button>
              </div>
            </div>,
            document.body
          )
        : null}

      {reactionPicker && !isSystemTab && typeof document !== "undefined"
        ? createPortal(
            <div
              className={`fixed inset-0 z-[20130] ${
                isNotebookVariant ? "chat-reaction-portal-notebook" : ""
              }`}
              style={NON_SELECTABLE_TOUCH_STYLE}
              onClick={() => {
                if (!isFloatingMenuCloseAllowed(reactionPicker)) return;
                setReactionPicker(null);
              }}
              onContextMenu={(event) => event.preventDefault()}
              onSelectStart={(event) => event.preventDefault()}
            >
              {(() => {
                const isMobileViewport = typeof window !== "undefined" && window.innerWidth <= 768;
                const sideInset = "max(10px, env(safe-area-inset-left), env(safe-area-inset-right))";
                return (
              <div
                className={`chat-reaction-picker fixed -translate-x-1/2 -translate-y-full rounded-2xl border px-2 py-2 shadow-xl ${
                  darkMode
                    ? "bg-slate-800 border-slate-600 text-slate-100"
                    : "bg-white border-slate-200 text-slate-900"
                }`}
                style={
                  isMobileViewport
                    ? {
                        left: sideInset,
                        right: sideInset,
                        top: `${reactionPicker.y}px`,
                        transform: "translateY(-100%)",
                        width: `calc(100vw - (${sideInset} * 2))`,
                        maxWidth: "none",
                        ...NON_SELECTABLE_TOUCH_STYLE,
                      }
                    : {
                        left: `${reactionPicker.x}px`,
                        top: `${reactionPicker.y}px`,
                        ...NON_SELECTABLE_TOUCH_STYLE,
                      }
                }
                onClick={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
                onSelectStart={(event) => event.preventDefault()}
              >
                <div className={`grid grid-cols-6 ${isMobileViewport ? "gap-2" : "gap-1"}`}>
                  {safeReactionEmojis.map((emoji) => (
                  <button
                    key={`chat-react-${emoji}`}
                    type="button"
                    className={`chat-reaction-choice rounded-full text-xl leading-none flex items-center justify-center ${
                      isMobileViewport ? "h-11 w-full" : "h-9 w-9"
                    } ${
                      darkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"
                    }`}
                    style={NON_SELECTABLE_TOUCH_STYLE}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onReactToMessage?.(reactionPicker.messageId, emoji);
                      setReactionPicker(null);
                    }}
                    aria-label={`Reagir avec ${emoji}`}
                  >
                    {isNotebookVariant ? (
                      <NotebookReactionEmoji
                        className="chat-reaction-choice-ink"
                        emoji={emoji}
                      />
                    ) : (
                      <span className="chat-reaction-choice-ink">{emoji}</span>
                    )}
                  </button>
                  ))}
                </div>
              </div>
                );
              })()}
            </div>,
            document.body
          )
        : null}

      {reactionDetails && typeof document !== "undefined"
        ? createPortal(
            <div
              className={`chat-reaction-details-portal fixed inset-0 z-[20140] bg-black/45 flex items-center justify-center px-4 ${
                isNotebookVariant ? "chat-reaction-portal-notebook" : ""
              }`}
              onClick={() => setReactionDetails(null)}
            >
              <div
                className={`chat-reaction-details-panel w-full max-w-sm rounded-xl border p-3 shadow-xl ${
                  darkMode
                    ? "bg-slate-900 border-slate-700 text-slate-100"
                    : "bg-white border-slate-200 text-slate-900"
                }`}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="font-bold text-sm">
                    {isNotebookVariant ? (
                      <NotebookReactionEmoji
                        className="chat-reaction-details-emoji"
                        emoji={reactionDetails.emoji}
                      />
                    ) : (
                      <span className="chat-reaction-details-emoji">{reactionDetails.emoji}</span>
                    )}{" "}
                    Reactions ({reactionDetails.users.length})
                  </div>
                  <button
                    type="button"
                    className={`h-7 px-2 rounded-md text-xs border ${
                      darkMode
                        ? "bg-slate-800 border-slate-600 text-slate-100"
                        : "bg-slate-50 border-slate-300 text-slate-700"
                    }`}
                    onClick={() => setReactionDetails(null)}
                  >
                    Fermer
                  </button>
                </div>
                <div className="max-h-[40vh] overflow-y-auto pr-1 space-y-1.5">
                  {reactionDetails.users.map((user) => {
                    const isMe = user.installId === selfInstallId;
                    return (
                      <div
                        key={`${reactionDetails.messageId}:${reactionDetails.emoji}:${user.installId}`}
                        className={`rounded-md px-2 py-1 text-sm ${
                          isMe
                            ? darkMode
                              ? "bg-blue-600/25 text-blue-100"
                              : "bg-blue-100 text-blue-700"
                            : darkMode
                            ? "bg-slate-800 text-slate-100"
                            : "bg-slate-50 text-slate-700"
                        }`}
                      >
                        {user.nick}
                        {isMe ? " (toi)" : ""}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
