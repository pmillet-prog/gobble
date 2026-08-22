import { createStateFeature } from "../../app/core/createStateFeature.js";
import {
  CHAT_BOT_VISIBILITY_STORAGE_KEY,
  CHAT_SHOW_BOT_MESSAGES_STORAGE_KEY,
  normalizeChatBotVisibility,
} from "../../components/chat/chatBotVisibility.js";
import {
  CHAT_MESSAGES_STORAGE_KEY,
  capChatMessagesByType,
  readStoredChatMessages,
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
  let persistTimer = null;
  return createStateFeature(context, () => createInitialChatState(storage), {
    start: ({ scope, store }) => {
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
        if (persistTimer != null) clearTimeout(persistTimer);
      });
    },
  });
}
