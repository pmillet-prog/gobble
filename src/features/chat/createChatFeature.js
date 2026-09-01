import { createStateFeature } from "../../app/core/createStateFeature.js";
import { getDefaultRoomId } from "../../app/adapters/deviceCapabilities.js";
import {
  CHAT_BOT_VISIBILITY_STORAGE_KEY,
  CHAT_SHOW_BOT_MESSAGES_STORAGE_KEY,
  isChatBotMessage,
  normalizeChatBotVisibility,
  shouldDisplayChatMessageForBotSettings,
} from "../../components/chat/chatBotVisibility.js";
import {
  CHAT_MESSAGES_STORAGE_KEY,
  capChatMessagesByType,
  findNewReactionFromOthers,
  isSystemChatMessage,
  normalizeChatReplyPreview,
  normalizeLegacyChatEmoticons,
  normalizeChatMessageShape,
  patchChatMessageById,
  patchChatMessageReactions,
  readStoredChatMessages,
  removeChatMessageById,
} from "../../utils/chatMessages.js";

const BLOCKED_INSTALL_IDS_STORAGE_KEY = "gobble_blocked_install_ids";
const CHAT_MIN_DELAY = 600;

function readBoolean(storage, key, fallback) {
  try {
    const value = storage?.getItem(key);
    return value == null ? fallback : value === "1";
  } catch (_) {
    return fallback;
  }
}

function readJson(storage, key, fallback) {
  try {
    const value = storage?.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (_) {
    return fallback;
  }
}

export function createInitialChatState(storage = globalThis.localStorage) {
  const blocked = readJson(storage, BLOCKED_INSTALL_IDS_STORAGE_KEY, []);
  return {
    activeArea: "game",
    blockedInstallIds: Array.isArray(blocked)
      ? blocked
          .filter((id) => typeof id === "string" && id.trim())
          .map((id) => id.trim())
          .filter((id) => !id.startsWith("dev-bot:"))
      : [],
    botVisibility: normalizeChatBotVisibility(
      readJson(storage, CHAT_BOT_VISIBILITY_STORAGE_KEY, null)
    ),
    desktopEmojiPickerOpen: false,
    desktopReactionDetails: {
      emoji: "",
      left: 0,
      messageId: null,
      open: false,
      top: 0,
      users: [],
    },
    desktopReactionPicker: {
      left: 0,
      messageId: null,
      open: false,
      top: 0,
    },
    editTarget: null,
    homeBotUnreadCount: 0,
    homeChatOpen: false,
    homeUnreadCount: 0,
    input: "",
    messages: readStoredChatMessages(),
    mobileBotUnreadCount: 0,
    mobileChatClosing: false,
    mobileChatOpen: false,
    mobileChatOpenedAtMs: 0,
    mobileReactionToasts: [],
    mobileUnreadCount: 0,
    replyTarget: null,
    reportDialog: {
      details: "",
      messageId: null,
      open: false,
      reportedInstallId: null,
      reportedNick: "",
      reason: "",
    },
    rulesAccepted: false,
    rulesOpen: false,
    showBlockedList: false,
    showBotMessages: readBoolean(storage, CHAT_SHOW_BOT_MESSAGES_STORAGE_KEY, true),
    tab: "messages",
    userMenu: {
      installId: null,
      left: 0,
      messageId: null,
      nick: "",
      open: false,
      top: 0,
      userId: null,
    },
    viewportHeight: 0,
    keyboardInsetPx: 0,
  };
}

export function createChatFeature(context, options = {}) {
  const storage = options.storage || globalThis.localStorage;
  let active = false;
  let chatHistory = [];
  let chatHistoryIndex = -1;
  let commandConfig = {};
  let lastSentAt = 0;
  let persistTimer = null;
  let realtimeConfig = {};
  let realtimeSocket = null;
  let realtimeUnsubscribe = null;
  const reactionToastTimers = new Set();

  function deferDuringTrace(task, label) {
    try {
      return !!realtimeConfig.deferNonessentialUiDuringTrace?.(task, label);
    } catch (_) {
      return false;
    }
  }

  function scheduleAutoScroll() {
    try {
      realtimeConfig.scheduleDesktopChatAutoScroll?.();
    } catch (_) {}
  }

  function onChatHistory(history = []) {
    if (deferDuringTrace(() => onChatHistory(history), "chat-history")) return;
    if (!Array.isArray(history)) return;
    const normalizedHistory = history
      .map((entry) => normalizeChatMessageShape(entry))
      .filter(Boolean);
    if (!normalizedHistory.length) return;
    feature.set("messages", (previous) =>
      capChatMessagesByType([...previous, ...normalizedHistory])
    );
    scheduleAutoScroll();
  }

  function onChatNew(message) {
    if (deferDuringTrace(() => onChatNew(message), "chat-message")) return;
    const normalizedMessage = normalizeChatMessageShape(message);
    if (!normalizedMessage) return;
    feature.set("messages", (previous) =>
      capChatMessagesByType([...previous, normalizedMessage])
    );
    scheduleAutoScroll();
    if (isSystemChatMessage(normalizedMessage)) return;

    const authorInstallId =
      typeof normalizedMessage.installId === "string"
        ? normalizedMessage.installId.trim()
        : "";
    const selfInstallId = String(
      realtimeConfig.installIdRef?.current || ""
    ).trim();
    if (authorInstallId && authorInstallId === selfInstallId) return;
    const author = String(
      normalizedMessage.author || normalizedMessage.nick || ""
    ).trim();
    const selfNick = String(realtimeConfig.nicknameRef?.current || "").trim();
    if (author && selfNick && author === selfNick) return;

    const state = feature.store.getState();
    if (
      !shouldDisplayChatMessageForBotSettings(
        normalizedMessage,
        state.showBotMessages,
        state.botVisibility
      )
    ) {
      return;
    }
    const unreadIsBot = isChatBotMessage(normalizedMessage);
    const currentTab = state.tab === "system" ? "system" : "messages";
    const isMobile = !!realtimeConfig.isMobileLayoutRef?.current;
    if (realtimeConfig.isLoggedInRef?.current) {
      const messagesVisible =
        currentTab === "messages" &&
        (isMobile
          ? state.mobileChatOpen && !state.mobileChatClosing
          : true);
      if (!messagesVisible) {
        feature.set("mobileUnreadCount", (count) => Math.min(99, count + 1));
        if (unreadIsBot) {
          feature.set("mobileBotUnreadCount", (count) =>
            Math.min(99, count + 1)
          );
        }
      }
      return;
    }
    const messagesVisible =
      currentTab === "messages" &&
      (isMobile
        ? state.mobileChatOpen && !state.mobileChatClosing
        : state.homeChatOpen);
    if (!messagesVisible) {
      feature.set("homeUnreadCount", (count) => Math.min(99, count + 1));
      if (unreadIsBot) {
        feature.set("homeBotUnreadCount", (count) => Math.min(99, count + 1));
      }
    }
  }

  function onChatReactionUpdate(patch) {
    if (
      deferDuringTrace(
        () => onChatReactionUpdate(patch),
        "chat-reaction"
      )
    ) {
      return;
    }
    const messageId =
      typeof patch?.messageId === "string" ? patch.messageId.trim() : "";
    const selfInstallId = String(
      realtimeConfig.installIdRef?.current || ""
    ).trim();
    const selfNick = String(realtimeConfig.nicknameRef?.current || "")
      .trim()
      .toLowerCase();
    const previousMessages = feature.store.getState().messages;
    let toastReaction = null;
    if (messageId) {
      const previousMessage =
        previousMessages.find((entry) => entry?.id === messageId) || null;
      const authorInstallId = String(
        previousMessage?.installId || ""
      ).trim();
      const authorNick = String(
        previousMessage?.nick || previousMessage?.author || ""
      )
        .trim()
        .toLowerCase();
      const isOwnMessage =
        (authorInstallId &&
          selfInstallId &&
          authorInstallId === selfInstallId) ||
        (!authorInstallId && selfNick && authorNick === selfNick);
      if (isOwnMessage) {
        toastReaction = findNewReactionFromOthers(
          previousMessage,
          patch?.reactions,
          selfInstallId
        );
      }
    }
    feature.set("messages", (previous) =>
      patchChatMessageReactions(previous, patch)
    );
    if (toastReaction?.emoji) {
      try {
        realtimeConfig.onReactionToast?.(toastReaction.emoji, {
          actorNick: toastReaction.actorNick,
          messageId,
        });
      } catch (_) {}
    }
    scheduleAutoScroll();
  }

  function onChatMessageUpdate(payload) {
    if (
      deferDuringTrace(() => onChatMessageUpdate(payload), "chat-update")
    ) {
      return;
    }
    const updatedMessage = payload?.message;
    if (!updatedMessage || typeof updatedMessage !== "object") return;
    feature.set("messages", (previous) =>
      capChatMessagesByType(patchChatMessageById(previous, updatedMessage))
    );
    const updatedId =
      typeof updatedMessage.id === "string" ? updatedMessage.id.trim() : "";
    if (updatedId && feature.store.getState().editTarget?.id === updatedId) {
      feature.set("editTarget", null);
    }
    scheduleAutoScroll();
  }

  function onChatMessageDelete(payload) {
    if (
      deferDuringTrace(() => onChatMessageDelete(payload), "chat-delete")
    ) {
      return;
    }
    const deletedId =
      typeof payload?.messageId === "string" ? payload.messageId.trim() : "";
    if (!deletedId) return;
    feature.set("messages", (previous) =>
      capChatMessagesByType(removeChatMessageById(previous, deletedId))
    );
    const state = feature.store.getState();
    if (state.editTarget?.id === deletedId) {
      feature.patch({ editTarget: null, input: "" });
    }
    if (state.replyTarget?.id === deletedId) {
      feature.set("replyTarget", null);
    }
    scheduleAutoScroll();
  }

  function bindRealtime() {
    const nextSocket = realtimeConfig.socket || context.ports?.realtime || null;
    if (realtimeSocket === nextSocket && realtimeUnsubscribe) return;
    realtimeUnsubscribe?.();
    realtimeUnsubscribe = null;
    realtimeSocket = nextSocket;
    if (!active || typeof realtimeSocket?.bind !== "function") return;
    realtimeUnsubscribe = realtimeSocket.bind({
      "chat:history": onChatHistory,
      "chat:message_delete": onChatMessageDelete,
      "chat:message_reaction": onChatReactionUpdate,
      "chat:message_update": onChatMessageUpdate,
      chatMessage: onChatNew,
    });
  }

  function configureRealtime(nextConfig = {}) {
    realtimeConfig = nextConfig;
    bindRealtime();
  }

  function configureCommands(nextConfig = {}) {
    commandConfig = nextConfig;
  }

  function focusInput() {
    try {
      commandConfig.onFocusInput?.();
    } catch (_) {}
  }

  function appendEmoji(emoji) {
    const value = String(emoji || "").trim();
    const state = feature.store.getState();
    if (!value || !state.rulesAccepted) return;
    feature.set("input", (previous) => {
      const base = String(previous || "");
      if (!base) return value;
      return /\s$/.test(base) ? `${base}${value}` : `${base} ${value}`;
    });
    feature.set("activeArea", "chat");
    focusInput();
  }

  function setReplyTargetFromMessage(message) {
    if (!message || typeof message !== "object") return;
    if (isSystemChatMessage(message)) return;
    const replyTarget = normalizeChatReplyPreview({
      id: message.id,
      nick: message.nick || message.author || "Anonyme",
      installId: message.installId || null,
      text: message.text || "",
      t: message.t ?? message.ts ?? message.timestamp ?? message.createdAt,
    });
    if (!replyTarget) return;
    feature.patch({
      activeArea: "chat",
      editTarget: null,
      replyTarget,
      tab: "messages",
    });
    focusInput();
  }

  function clearReplyTarget() {
    feature.set("replyTarget", null);
  }

  function beginEditFromMessage(message) {
    if (!message || typeof message !== "object") return;
    if (isSystemChatMessage(message)) return;
    const messageId = typeof message.id === "string" ? message.id.trim() : "";
    const authorInstallId =
      typeof message.installId === "string" ? message.installId.trim() : "";
    const installId = String(commandConfig.installIdRef?.current || "").trim();
    if (!messageId || !authorInstallId || authorInstallId !== installId) return;
    const text = String(message.text || "");
    feature.patch({
      activeArea: "chat",
      editTarget: { id: messageId, text },
      input: text,
      replyTarget: null,
    });
    focusInput();
  }

  function clearEditTarget() {
    feature.set("editTarget", null);
  }

  function deleteOwnMessage(message) {
    if (!message || typeof message !== "object") return;
    if (!commandConfig.ensureAuthenticated?.({ source: "chat" })) return;
    const messageId = typeof message.id === "string" ? message.id.trim() : "";
    const authorInstallId =
      typeof message.installId === "string" ? message.installId.trim() : "";
    const installId = String(commandConfig.installIdRef?.current || "").trim();
    if (!messageId || !authorInstallId || authorInstallId !== installId) return;
    const socket = commandConfig.socket || context.ports?.realtime;
    if (!socket?.connected) {
      commandConfig.setConnectionError?.(
        "Connecte-toi au serveur pour supprimer un message."
      );
      return;
    }
    const payload = {
      messageId,
      roomId: commandConfig.roomIdRef?.current || getDefaultRoomId(),
    };
    if (!commandConfig.isLoggedInRef?.current) {
      const nickForLobby = String(
        commandConfig.nicknameRef?.current || ""
      ).trim();
      if (!nickForLobby) {
        commandConfig.setConnectionError?.("Choisis un pseudo pour discuter.");
        return;
      }
      payload.nick = nickForLobby;
      payload.installId = installId;
      payload.lobby = true;
    }
    socket.emit("chat:delete", payload, (response) => {
      if (response?.ok) return;
      commandConfig.showToast?.(
        response?.error === "forbidden"
          ? "Suppression refusée"
          : "Suppression impossible"
      );
    });
  }

  function sendReaction(messageId, emoji) {
    const safeMessageId = typeof messageId === "string" ? messageId.trim() : "";
    const safeEmoji = typeof emoji === "string" ? emoji.trim() : "";
    if (!safeMessageId || !safeEmoji) return;
    if (!commandConfig.ensureAuthenticated?.({ source: "chat" })) return;
    if (!feature.store.getState().rulesAccepted) {
      feature.set("rulesOpen", true);
      return;
    }
    const socket = commandConfig.socket || context.ports?.realtime;
    if (!socket?.connected) {
      if (!commandConfig.isLoggedInRef?.current) {
        commandConfig.subscribeLobbyChat?.();
        commandConfig.setConnectionError?.("Connexion au serveur...");
      } else {
        commandConfig.setConnectionError?.(
          "Connecte-toi au serveur pour réagir."
        );
      }
      return;
    }

    const installId = String(commandConfig.installIdRef?.current || "").trim();
    const payload = {
      messageId: safeMessageId,
      emoji: safeEmoji,
      roomId: commandConfig.roomIdRef?.current || getDefaultRoomId(),
    };
    if (!commandConfig.isLoggedInRef?.current) {
      const nickForLobby = String(
        commandConfig.nicknameRef?.current || ""
      ).trim();
      if (!nickForLobby) {
        commandConfig.setConnectionError?.("Choisis un pseudo pour discuter.");
        return;
      }
      payload.nick = nickForLobby;
      payload.installId = installId;
      payload.lobby = true;
    }

    socket.emit("chat:react", payload, (response) => {
      if (response?.ok) return;
      if (response?.error === "muted") {
        commandConfig.showToast?.("Chat temporairement bloqué");
      } else if (response?.error === "empty_nick") {
        commandConfig.setConnectionError?.("Choisis un pseudo pour discuter.");
      } else if (response?.error === "invalid_emoji") {
        commandConfig.showToast?.("Réaction indisponible");
      } else if (response?.error === "message_not_found") {
        commandConfig.showToast?.("Message introuvable");
      }
    });
  }

  function pushHistory(text) {
    if (!text) return;
    if (chatHistory[0] !== text) {
      chatHistory = [text, ...chatHistory].slice(0, 50);
    }
    chatHistoryIndex = -1;
  }

  function cycleHistory(direction) {
    if (!chatHistory.length) return;
    let nextIndex = chatHistoryIndex;
    if (direction < 0) {
      nextIndex =
        nextIndex === -1 ? 0 : Math.min(chatHistory.length - 1, nextIndex + 1);
    } else if (direction > 0) {
      nextIndex = nextIndex === -1 ? -1 : nextIndex - 1;
    }
    chatHistoryIndex = nextIndex;
    feature.set("input", nextIndex === -1 ? "" : chatHistory[nextIndex] || "");
    focusInput();
  }

  function submit(event, forcedText = null) {
    event?.preventDefault?.();
    const state = feature.store.getState();
    const text = normalizeLegacyChatEmoticons(
      forcedText ?? state.input
    ).trim();
    if (!text) return false;
    if (!commandConfig.ensureAuthenticated?.({ source: "chat" })) return false;
    if (!state.rulesAccepted) {
      feature.set("rulesOpen", true);
      return false;
    }

    const socket = commandConfig.socket || context.ports?.realtime;
    if (!socket?.connected) {
      if (!commandConfig.isLoggedInRef?.current) {
        commandConfig.subscribeLobbyChat?.();
        commandConfig.setConnectionError?.("Connexion au serveur...");
      } else {
        commandConfig.setConnectionError?.(
          "Connecte-toi au serveur pour envoyer un message."
        );
      }
      return false;
    }

    const now = Date.now();
    if (now - lastSentAt < CHAT_MIN_DELAY) return false;
    lastSentAt = now;

    const activeEdit = state.editTarget;
    const editMessageId =
      typeof activeEdit?.id === "string" ? activeEdit.id.trim() : "";
    const replyToPayload = editMessageId
      ? null
      : normalizeChatReplyPreview(state.replyTarget);
    const installId = String(commandConfig.installIdRef?.current || "").trim();
    let payload = text;
    if (editMessageId) {
      payload = {
        messageId: editMessageId,
        text,
        roomId: commandConfig.roomIdRef?.current || getDefaultRoomId(),
      };
      if (!commandConfig.isLoggedInRef?.current) {
        const nickForLobby = String(
          commandConfig.nicknameRef?.current || ""
        ).trim();
        if (!nickForLobby) {
          commandConfig.setConnectionError?.("Choisis un pseudo pour discuter.");
          return false;
        }
        payload.nick = nickForLobby;
        payload.installId = installId;
        payload.lobby = true;
      }
    } else if (!commandConfig.isLoggedInRef?.current) {
      const nickForLobby = String(
        commandConfig.nicknameRef?.current || ""
      ).trim();
      if (!nickForLobby) {
        commandConfig.setConnectionError?.("Choisis un pseudo pour discuter.");
        return false;
      }
      payload = {
        text,
        roomId: commandConfig.roomIdRef?.current || getDefaultRoomId(),
        nick: nickForLobby,
        installId,
        lobby: true,
      };
      if (replyToPayload) payload.replyTo = replyToPayload;
    } else if (replyToPayload) {
      payload = { text, replyTo: replyToPayload };
    }

    const replyTargetIdAtSend = replyToPayload?.id || "";
    const eventName = editMessageId ? "chat:edit" : "chat:send";
    socket.emit(eventName, payload, (response) => {
      if (!response?.ok) {
        if (response?.error === "muted") {
          commandConfig.showToast?.("Chat temporairement bloqué");
        } else if (response?.error === "rate_limited") {
          const retrySeconds = Math.max(
            1,
            Math.ceil((Number(response.retryMs) || 0) / 1000)
          );
          commandConfig.showToast?.(
            `Trop de messages. Réessaie dans ${retrySeconds} s.`
          );
        } else if (response?.error === "empty_nick") {
          commandConfig.setConnectionError?.("Choisis un pseudo pour discuter.");
        } else {
          commandConfig.setConnectionError?.("Message non envoyé");
        }
        return;
      }
      commandConfig.setConnectionError?.("");
      const currentState = feature.store.getState();
      if (editMessageId && currentState.editTarget?.id === editMessageId) {
        feature.set("editTarget", null);
      }
      if (
        replyTargetIdAtSend &&
        currentState.replyTarget?.id === replyTargetIdAtSend
      ) {
        feature.set("replyTarget", null);
      }
    });

    if (!editMessageId) pushHistory(text);
    if (!forcedText) feature.set("input", "");
    return true;
  }

  let feature = createStateFeature(context, () => createInitialChatState(storage), {
    start: ({ scope, store }) => {
      active = true;
      bindRealtime();
      let previous = store.getState();
      const persist = () => {
        const state = store.getState();
        try {
          if (state.showBotMessages !== previous.showBotMessages) {
            storage?.setItem(
              CHAT_SHOW_BOT_MESSAGES_STORAGE_KEY,
              state.showBotMessages ? "1" : "0"
            );
          }
          if (state.botVisibility !== previous.botVisibility) {
            storage?.setItem(
              CHAT_BOT_VISIBILITY_STORAGE_KEY,
              JSON.stringify(normalizeChatBotVisibility(state.botVisibility))
            );
          }
          if (state.blockedInstallIds !== previous.blockedInstallIds) {
            storage?.setItem(
              BLOCKED_INSTALL_IDS_STORAGE_KEY,
              JSON.stringify(state.blockedInstallIds)
            );
          }
        } catch (_) {}
        if (state.messages !== previous.messages) {
          if (persistTimer != null) clearTimeout(persistTimer);
          persistTimer = setTimeout(() => {
            persistTimer = null;
            try {
              storage?.setItem(
                CHAT_MESSAGES_STORAGE_KEY,
                JSON.stringify(capChatMessagesByType(store.getState().messages))
              );
            } catch (_) {}
          }, 650);
        }
        previous = state;
      };
      const unsubscribe = store.subscribe(persist);
      scope.add(unsubscribe);
      scope.add(() => {
        active = false;
        if (persistTimer != null) clearTimeout(persistTimer);
        for (const timerId of reactionToastTimers) clearTimeout(timerId);
        reactionToastTimers.clear();
        realtimeUnsubscribe?.();
        realtimeUnsubscribe = null;
        realtimeSocket = null;
        realtimeConfig = {};
        commandConfig = {};
        chatHistory = [];
        chatHistoryIndex = -1;
        lastSentAt = 0;
        store.set("mobileReactionToasts", []);
      });
    },
  });
  function clearReactionToasts() {
    for (const timerId of reactionToastTimers) clearTimeout(timerId);
    reactionToastTimers.clear();
    feature.set("mobileReactionToasts", []);
  }
  function enqueueReactionToast(toast, durationMs = 2400) {
    if (!toast || typeof toast !== "object") return null;
    const entry = Object.freeze({
      ...toast,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    feature.set("mobileReactionToasts", (current) =>
      [...current, entry].slice(-3)
    );
    const timerId = setTimeout(() => {
      reactionToastTimers.delete(timerId);
      feature.set("mobileReactionToasts", (current) =>
        current.filter((item) => item.id !== entry.id)
      );
    }, Math.max(0, Number(durationMs) || 0));
    reactionToastTimers.add(timerId);
    return entry;
  }
  return Object.freeze({
    ...feature,
    appendEmoji,
    beginEditFromMessage,
    clearEditTarget,
    clearReactionToasts,
    clearReplyTarget,
    configureCommands,
    configureRealtime,
    cycleHistory,
    deleteOwnMessage,
    enqueueReactionToast,
    sendReaction,
    setReplyTargetFromMessage,
    submit,
  });
}
