import { createStateFeature } from "../../app/core/createStateFeature.js";
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
  normalizeChatMessageShape,
  patchChatMessageById,
  patchChatMessageReactions,
  readStoredChatMessages,
  removeChatMessageById,
} from "../../utils/chatMessages.js";

const BLOCKED_INSTALL_IDS_STORAGE_KEY = "gobble_blocked_install_ids";

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
    clearReactionToasts,
    configureRealtime,
    enqueueReactionToast,
  });
}
