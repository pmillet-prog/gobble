import assert from "node:assert/strict";
import test from "node:test";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createChatFeature } from "./createChatFeature.js";

function createMemoryStorage() {
  const values = new Map();
  const writes = [];
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
      writes.push({ key, value });
    },
    writes,
  };
}

function createCommandSocket(responses = {}) {
  const emissions = [];
  return {
    connected: true,
    emit(eventName, payload, acknowledge) {
      emissions.push({ eventName, payload });
      acknowledge?.(responses[eventName] || { ok: true });
    },
    emissions,
  };
}

test("chat persistence ignores transient input and unread state", () => {
  const storage = createMemoryStorage();
  const scope = createResourceScope("chat-test");
  const chat = createChatFeature({ scope }, { storage });
  chat.start();

  chat.set("input", "b");
  chat.set("input", "bo");
  chat.set("mobileUnreadCount", 4);

  assert.equal(storage.writes.length, 0);
  scope.dispose();
});

test("chat preferences persist only when their owned values change", () => {
  const storage = createMemoryStorage();
  const scope = createResourceScope("chat-test");
  const chat = createChatFeature({ scope }, { storage });
  chat.start();

  chat.set("showBotMessages", false);
  chat.set("activeArea", "chat");

  assert.equal(storage.writes.length, 1);
  assert.equal(storage.writes[0].value, "0");
  scope.dispose();
});

test("chat feature owns reaction toast state and expiry resources", () => {
  const storage = createMemoryStorage();
  const scope = createResourceScope("chat-reaction-test");
  const chat = createChatFeature({ scope }, { storage });
  chat.start();

  chat.enqueueReactionToast({ emoji: "👍", kind: "bottom", x: 10, y: 20 });
  assert.equal(chat.store.getState().mobileReactionToasts.length, 1);
  scope.dispose();
  assert.equal(chat.store.getState().mobileReactionToasts.length, 0);
});

test("chat feature owns realtime messages, unread counts and socket cleanup", () => {
  const handlers = new Map();
  const socket = {
    bind(nextHandlers) {
      for (const [eventName, handler] of Object.entries(nextHandlers)) {
        handlers.set(eventName, handler);
      }
      return () => {
        for (const [eventName, handler] of Object.entries(nextHandlers)) {
          if (handlers.get(eventName) === handler) handlers.delete(eventName);
        }
      };
    },
    fire(eventName, payload) {
      handlers.get(eventName)?.(payload);
    },
  };
  const scope = createResourceScope("chat-realtime-test");
  const chat = createChatFeature(
    { ports: { realtime: socket }, scope },
    { storage: createMemoryStorage() }
  );
  const deferredLabels = [];
  const reactionToasts = [];
  let autoScrolls = 0;
  chat.configureRealtime({
    deferNonessentialUiDuringTrace: (_task, label) => {
      deferredLabels.push(label);
      return false;
    },
    installIdRef: { current: "install-self" },
    isLoggedInRef: { current: true },
    isMobileLayoutRef: { current: true },
    nicknameRef: { current: "Tigre" },
    onReactionToast: (...args) => reactionToasts.push(args),
    scheduleDesktopChatAutoScroll: () => {
      autoScrolls += 1;
    },
    socket,
  });
  chat.start();

  assert.deepEqual([...handlers.keys()].sort(), [
    "chat:history",
    "chat:message_delete",
    "chat:message_reaction",
    "chat:message_update",
    "chatMessage",
  ]);

  socket.fire("chatMessage", {
    createdAt: 1,
    id: "message-other",
    installId: "install-other",
    nick: "Autre",
    text: "Salut",
  });
  assert.equal(chat.store.getState().mobileUnreadCount, 1);

  socket.fire("chatMessage", {
    createdAt: 2,
    id: "message-self",
    installId: "install-self",
    nick: "Tigre",
    text: "Bonjour",
  });
  assert.equal(chat.store.getState().mobileUnreadCount, 1);

  socket.fire("chat:message_reaction", {
    messageId: "message-self",
    reactions: {
      "👍": [{ installId: "install-other", nick: "Autre" }],
    },
  });
  assert.deepEqual(reactionToasts, [
    ["👍", { actorNick: "Autre", messageId: "message-self" }],
  ]);

  chat.patch({
    editTarget: { id: "message-self" },
    replyTarget: { id: "message-other" },
  });
  socket.fire("chat:message_update", {
    message: { id: "message-self", text: "Bonjour !" },
  });
  assert.equal(chat.store.getState().editTarget, null);
  assert.equal(
    chat.store.getState().messages.find((entry) => entry.id === "message-self")
      .text,
    "Bonjour !"
  );

  socket.fire("chat:message_delete", { messageId: "message-other" });
  assert.equal(chat.store.getState().replyTarget, null);
  assert.equal(
    chat.store.getState().messages.some((entry) => entry.id === "message-other"),
    false
  );
  assert.ok(autoScrolls >= 5);
  assert.deepEqual(deferredLabels, [
    "chat-message",
    "chat-message",
    "chat-reaction",
    "chat-update",
    "chat-delete",
  ]);

  scope.dispose();
  assert.equal(handlers.size, 0);
});

test("chat feature owns draft targets, send history and guest payloads", () => {
  const scope = createResourceScope("chat-command-guest-test");
  const socket = createCommandSocket();
  const chat = createChatFeature(
    { scope },
    { storage: createMemoryStorage() }
  );
  const connectionErrors = [];
  let focusCount = 0;
  chat.configureCommands({
    ensureAuthenticated: () => true,
    installIdRef: { current: "install-self" },
    isLoggedInRef: { current: false },
    nicknameRef: { current: "Tigre" },
    onFocusInput: () => {
      focusCount += 1;
    },
    roomIdRef: { current: "room-test" },
    setConnectionError: (message) => connectionErrors.push(message),
    socket,
  });
  chat.start();
  chat.patch({ rulesAccepted: true, tab: "system" });

  chat.appendEmoji("👍");
  assert.equal(chat.store.getState().input, "👍");

  chat.setReplyTargetFromMessage({
    createdAt: 123,
    id: "message-other",
    installId: "install-other",
    nick: "Autre",
    text: "Question",
  });
  assert.equal(chat.store.getState().tab, "messages");
  assert.deepEqual(chat.store.getState().replyTarget, {
    id: "message-other",
    installId: "install-other",
    nick: "Autre",
    text: "Question",
    t: 123,
  });

  chat.set("input", "Réponse");
  assert.equal(chat.submit(null), true);
  assert.deepEqual(socket.emissions, [
    {
      eventName: "chat:send",
      payload: {
        installId: "install-self",
        lobby: true,
        nick: "Tigre",
        replyTo: {
          id: "message-other",
          installId: "install-other",
          nick: "Autre",
          text: "Question",
          t: 123,
        },
        roomId: "room-test",
        text: "Réponse",
      },
    },
  ]);
  assert.equal(chat.store.getState().input, "");
  assert.equal(chat.store.getState().replyTarget, null);
  assert.deepEqual(connectionErrors, [""]);

  chat.cycleHistory(-1);
  assert.equal(chat.store.getState().input, "Réponse");
  chat.cycleHistory(1);
  assert.equal(chat.store.getState().input, "");
  assert.ok(focusCount >= 4);

  scope.dispose();
});

test("chat feature owns authenticated edit, reaction and delete commands", () => {
  const scope = createResourceScope("chat-command-auth-test");
  const socket = createCommandSocket({
    "chat:delete": { error: "forbidden", ok: false },
    "chat:react": { error: "invalid_emoji", ok: false },
  });
  const chat = createChatFeature(
    { scope },
    { storage: createMemoryStorage() }
  );
  const toasts = [];
  chat.configureCommands({
    ensureAuthenticated: () => true,
    installIdRef: { current: "install-self" },
    isLoggedInRef: { current: true },
    nicknameRef: { current: "Tigre" },
    roomIdRef: { current: "room-test" },
    setConnectionError: () => {},
    showToast: (message) => toasts.push(message),
    socket,
  });
  chat.start();
  chat.set("rulesAccepted", true);

  const ownMessage = {
    id: "message-self",
    installId: "install-self",
    text: "Avant",
  };
  chat.beginEditFromMessage(ownMessage);
  assert.deepEqual(chat.store.getState().editTarget, {
    id: "message-self",
    text: "Avant",
  });
  chat.set("input", "Après");
  assert.equal(chat.submit(null), true);
  chat.sendReaction("message-other", "👍");
  chat.deleteOwnMessage(ownMessage);

  assert.deepEqual(socket.emissions, [
    {
      eventName: "chat:edit",
      payload: {
        messageId: "message-self",
        roomId: "room-test",
        text: "Après",
      },
    },
    {
      eventName: "chat:react",
      payload: {
        emoji: "👍",
        messageId: "message-other",
        roomId: "room-test",
      },
    },
    {
      eventName: "chat:delete",
      payload: {
        messageId: "message-self",
        roomId: "room-test",
      },
    },
  ]);
  assert.equal(chat.store.getState().editTarget, null);
  assert.deepEqual(toasts, ["Réaction indisponible", "Suppression refusée"]);

  scope.dispose();
});
