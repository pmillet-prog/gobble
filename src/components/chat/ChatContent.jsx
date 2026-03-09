import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const LONG_PRESS_MS = 420;
const SWIPE_REPLY_TRIGGER_PX = 72;
const SWIPE_REPLY_MAX_PX = 96;
const GESTURE_MOVE_CANCEL_PX = 10;

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

const THREE_LINE_CLAMP_STYLE = {
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
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
  visibleMessages,
  showBlockedList,
  blockedEntries,
  blockedCount,
  onToggleBlockedList,
  onUnblockInstallId,
  onOpenRules,
  onOpenUserMenu,
  selfNick,
  selfInstallId,
  chatInput,
  setChatInput,
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
}) {
  const isSystemTab = chatTab === "system";
  const messagesEndRef = useRef(null);
  const messagesListRef = useRef(null);
  const localTextareaRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const pointerStateRef = useRef(null);
  const suppressClickRef = useRef(false);
  const [swipePreview, setSwipePreview] = React.useState(null);
  const [reactionPicker, setReactionPicker] = React.useState(null);
  const [reactionDetails, setReactionDetails] = React.useState(null);
  const [ownMessageMenu, setOwnMessageMenu] = React.useState(null);
  const safeReactionEmojis = React.useMemo(() => {
    if (!Array.isArray(reactionEmojis)) return ["👍", "❤️", "😂", "😮", "😢", "🔥"];
    const filtered = reactionEmojis
      .map((emoji) => (typeof emoji === "string" ? emoji.trim() : ""))
      .filter(Boolean);
    return filtered.length ? filtered : ["👍", "❤️", "😂", "😮", "😢", "🔥"];
  }, [reactionEmojis]);
  const lastVisibleMessageKey = React.useMemo(() => {
    if (!Array.isArray(visibleMessages) || visibleMessages.length === 0) {
      return "empty";
    }
    const last = visibleMessages[visibleMessages.length - 1];
    if (!last || typeof last !== "object") return "missing";
    const id = typeof last.id === "string" ? last.id.trim() : "";
    if (id) return `id:${id}`;
    const ts = parseMessageTimestampMs(last);
    const author = String(last.nick || last.author || "").trim();
    const text = String(last.text || "");
    return `fallback:${ts || 0}:${author}:${text}`;
  }, [visibleMessages]);

  const clearLongPressTimer = React.useCallback(() => {
    if (!longPressTimerRef.current) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
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
    if (!isOpen) return undefined;
    let raf1 = null;
    let raf2 = null;
    let timeout1 = null;
    let timeout2 = null;
    const scrollToBottom = () => {
      const listEl = messagesListRef.current;
      if (listEl) {
        listEl.scrollTop = listEl.scrollHeight;
        return;
      }
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    };

    scrollToBottom();
    raf1 = window.requestAnimationFrame(() => {
      scrollToBottom();
      raf2 = window.requestAnimationFrame(scrollToBottom);
    });
    timeout1 = window.setTimeout(scrollToBottom, 80);
    timeout2 = window.setTimeout(scrollToBottom, 180);

    return () => {
      if (raf1 !== null) window.cancelAnimationFrame(raf1);
      if (raf2 !== null) window.cancelAnimationFrame(raf2);
      if (timeout1 !== null) window.clearTimeout(timeout1);
      if (timeout2 !== null) window.clearTimeout(timeout2);
    };
  }, [isOpen, chatTab, lastVisibleMessageKey, chatKeyboardInsetPx, keyboardInsetReservePx]);

  useEffect(() => {
    const el = localTextareaRef.current;
    if (!el || isSystemTab) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [chatInput, chatTab, isOpen, isSystemTab]);

  useEffect(() => {
    if (!isOpen || isSystemTab) return undefined;
    let rafId = null;
    const syncBottom = () => {
      const listEl = messagesListRef.current;
      if (listEl) {
        listEl.scrollTop = listEl.scrollHeight;
      }
    };
    rafId = window.requestAnimationFrame(syncBottom);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [chatInput, isOpen, isSystemTab]);

  useEffect(
    () => () => {
      clearLongPressTimer();
    },
    [clearLongPressTimer]
  );

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
    }
  };

  const handleMessagePointerDown = React.useCallback(
    (event, message, isSystem, isOwn) => {
      if (isSystem || isSystemTab) return;
      if (!message?.id) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const rawTarget = event?.target;
      if (
        typeof Element !== "undefined" &&
        rawTarget instanceof Element &&
        rawTarget.closest("button, a, input, textarea, select, label")
      ) {
        abortPointerGesture();
        return;
      }

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
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
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
        suppressClickRef.current = true;
        onSelectChatReply?.(message);
      }
      if (state.longPressTriggered || shouldReply) {
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      } else {
        suppressClickRef.current = false;
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

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      <div
        className={`flex items-center justify-between px-4 py-3 border-b ${
          darkMode
            ? "border-slate-700 bg-slate-900/95 text-slate-100"
            : "border-slate-200 bg-white/95 text-slate-900"
        }`}
      >
        <div className="font-extrabold text-base">Chat</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`text-[11px] font-semibold ${
              darkMode ? "text-slate-300" : "text-slate-600"
            }`}
            onClick={onOpenRules}
          >
            Règles
          </button>
          <button
            type="button"
            className={`text-[11px] font-semibold ${
              darkMode ? "text-amber-300" : "text-blue-600"
            }`}
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
            className={`h-10 px-4 text-sm font-semibold rounded-xl border ${
              darkMode
                ? "bg-slate-800 border-slate-600 text-slate-100"
                : "bg-slate-50 border-slate-200 text-slate-900"
            }`}
          >
            Fermer
          </button>
        </div>
      </div>

      <div className="px-3 pt-2">
        <div
          className={`inline-flex rounded-full border p-1 ${
            darkMode ? "border-white/10 bg-slate-800/70" : "border-slate-200 bg-slate-100"
          }`}
        >
          <button
            type="button"
            className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${
              !isSystemTab
                ? "bg-blue-600 text-white"
                : darkMode
                ? "text-slate-200"
                : "text-slate-700"
            }`}
            onClick={() => onChangeChatTab?.("messages")}
          >
            Messages{formatUnreadSuffix(messagesUnreadCount)}
          </button>
          <button
            type="button"
            className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${
              isSystemTab
                ? "bg-orange-500 text-white"
                : darkMode
                ? "text-slate-200"
                : "text-slate-700"
            }`}
            onClick={() => onChangeChatTab?.("system")}
          >
            Logs serveur
          </button>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0 px-3 py-2 gap-2">
        {showBlockedList ? (
          <div
            className={`rounded-lg border px-2 py-2 text-[11px] ${
              darkMode
                ? "bg-slate-900/70 border-slate-600 text-slate-100"
                : "bg-gray-50 border-gray-200 text-gray-700"
            }`}
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
                      className={`text-[11px] font-semibold ${
                        darkMode ? "text-amber-300" : "text-blue-600"
                      }`}
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
          className={`flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 text-sm rounded-lg border p-2 ${
            darkMode
              ? "bg-slate-900/70 border-slate-700 text-slate-100"
              : "bg-white/80 border-slate-200 text-slate-900"
          }`}
          style={{ overscrollBehavior: "contain", touchAction: "pan-y" }}
          onClick={() => {
            if (reactionPicker) setReactionPicker(null);
            if (ownMessageMenu) setOwnMessageMenu(null);
            suppressClickRef.current = false;
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
              const isYou = authorInstallId
                ? authorInstallId === selfInstallId
                : author === selfNick;
              const isOwn = !!isYou;
              const isSystem = isSystemAuthor(author);
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

              return (
                <div
                  key={messageKey}
                  className={
                    isSystem
                      ? "px-2 py-0.5 text-sm italic text-orange-700 dark:text-amber-300"
                      : `px-2 py-1 rounded-lg transition-transform duration-75 ${
                          isYou
                            ? "bg-blue-600 text-white self-end"
                            : darkMode
                            ? "bg-slate-800 text-slate-100 self-start"
                            : "bg-slate-100 text-slate-900 self-start"
                        }`
                  }
                  style={
                    isSystem
                      ? undefined
                      : { transform: `translateX(${dx}px)`, touchAction: "pan-y" }
                  }
                  onPointerDown={(event) => handleMessagePointerDown(event, msg, isSystem, isOwn)}
                  onPointerMove={(event) => handleMessagePointerMove(event, msg)}
                  onPointerUp={(event) => handleMessagePointerUp(event, msg)}
                  onPointerCancel={(event) => handleMessagePointerCancel(event, msg)}
                  onClickCapture={(event) => {
                    if (!suppressClickRef.current) return;
                    suppressClickRef.current = false;
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
                          className={`mb-1 rounded-md border-l-4 px-2 py-1 text-[11px] ${
                            replyTargetsSelf
                              ? "border-blue-500 bg-blue-50 text-slate-700"
                              : darkMode
                              ? "border-slate-600 bg-slate-700/80 text-slate-200"
                              : "border-slate-300 bg-slate-50 text-slate-700"
                          }`}
                        >
                          <div className="font-semibold">{replyPreview.nick}</div>
                          <div style={THREE_LINE_CLAMP_STYLE}>{replyPreview.text}</div>
                        </div>
                      ) : null}
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        {canOpenMenu ? (
                          <button
                            type="button"
                            className="font-semibold hover:underline"
                            onClick={(e) =>
                              onOpenUserMenu?.(e, {
                                nick: author,
                                installId: authorInstallId,
                                messageId: msg.id,
                              })
                            }
                          >
                            {author}:
                          </button>
                        ) : (
                          <span className="font-semibold">{author}:</span>
                        )}
                        {messageTime ? (
                          <span className="text-[10px] leading-none opacity-70">
                            {messageTime}
                          </span>
                        ) : null}
                        {isEdited ? (
                          <span className="text-[10px] leading-none opacity-60">(modifié)</span>
                        ) : null}
                        <span>{msg.text}</span>
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
                                ? "bg-slate-700 border-slate-500 text-slate-100"
                                : "bg-white border-slate-300 text-slate-700"
                            }`;
                            return (
                              <button
                                key={`${msg.id || messageKey}:${entry.emoji}`}
                                type="button"
                                className={badgeClass}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openReactionDetails(msg, entry.emoji);
                                }}
                              >
                                <span>{entry.emoji}</span>
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
          <div className="shrink-0">
            {chatEditTarget ? (
              <div
                className={`mb-2 rounded-lg border px-2 py-1.5 ${
                  darkMode
                    ? "bg-amber-900/35 border-amber-700 text-amber-100"
                    : "bg-amber-50 border-amber-200 text-slate-700"
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
                        ? "border-slate-500 bg-slate-700 text-slate-200"
                        : "border-slate-300 bg-white text-slate-600"
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
                    ? "bg-slate-800/80 border-slate-600 text-slate-100"
                    : "bg-blue-50 border-blue-200 text-slate-700"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold">
                      Réponse à {chatReplyTarget.nick || "Anonyme"}
                    </div>
                    <div className="text-[11px]" style={THREE_LINE_CLAMP_STYLE}>
                      {chatReplyTarget.text || ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`h-6 w-6 rounded-full text-xs font-bold border shrink-0 ${
                      darkMode
                        ? "border-slate-500 bg-slate-700 text-slate-200"
                        : "border-slate-300 bg-white text-slate-600"
                    }`}
                    onClick={() => onClearChatReply?.()}
                    aria-label="Annuler la réponse"
                  >
                    x
                  </button>
                </div>
              </div>
            ) : null}
            <div className="flex items-end gap-2 pt-1 pb-1 border-t border-slate-200 dark:border-slate-700">
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
                onFocus={onChatInputFocus}
                value={chatInput}
                onChange={(e) => setChatInput?.(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 border rounded px-3 py-2 text-sm ios-input chat-input bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 resize-none min-h-[44px] max-h-[168px]"
                placeholder={chatInputPlaceholder}
              />
              <button
                type="button"
                className="px-3 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
                disabled={!chatInput.trim() || chatInputDisabled}
                onPointerDown={(e) => {
                  if (!chatInput.trim() || chatInputDisabled) return;
                  e.preventDefault();
                  submitChat?.();
                  const el = localTextareaRef.current;
                  if (!el) return;
                  try {
                    el.focus({ preventScroll: true });
                  } catch (_) {
                    el.focus();
                  }
                }}
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
              className="fixed inset-0 z-[20130]"
              onClick={() => {
                setOwnMessageMenu(null);
              }}
            >
              <div
                className={`fixed -translate-x-1/2 -translate-y-full rounded-full border px-2 py-1 flex items-center gap-1 shadow-xl ${
                  darkMode
                    ? "bg-slate-800 border-slate-600 text-slate-100"
                    : "bg-white border-slate-200 text-slate-900"
                }`}
                style={{ left: `${ownMessageMenu.x}px`, top: `${ownMessageMenu.y}px` }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className={`h-9 w-9 rounded-full flex items-center justify-center ${
                    darkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"
                  }`}
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
              className="fixed inset-0 z-[20130]"
              onClick={() => {
                setReactionPicker(null);
              }}
            >
              <div
                className={`fixed -translate-x-1/2 -translate-y-full rounded-full border px-2 py-1 flex items-center gap-1 shadow-xl ${
                  darkMode
                    ? "bg-slate-800 border-slate-600 text-slate-100"
                    : "bg-white border-slate-200 text-slate-900"
                }`}
                style={{ left: `${reactionPicker.x}px`, top: `${reactionPicker.y}px` }}
                onClick={(event) => event.stopPropagation()}
              >
                {safeReactionEmojis.map((emoji) => (
                  <button
                    key={`chat-react-${emoji}`}
                    type="button"
                    className={`h-9 w-9 rounded-full text-xl leading-none flex items-center justify-center ${
                      darkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"
                    }`}
                    onClick={() => {
                      onReactToMessage?.(reactionPicker.messageId, emoji);
                      setReactionPicker(null);
                    }}
                    aria-label={`Reagir avec ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}

      {reactionDetails && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[20140] bg-black/45 flex items-center justify-center px-4"
              onClick={() => setReactionDetails(null)}
            >
              <div
                className={`w-full max-w-sm rounded-xl border p-3 shadow-xl ${
                  darkMode
                    ? "bg-slate-900 border-slate-700 text-slate-100"
                    : "bg-white border-slate-200 text-slate-900"
                }`}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="font-bold text-sm">
                    {reactionDetails.emoji} Reactions ({reactionDetails.users.length})
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
