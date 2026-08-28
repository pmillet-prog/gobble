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
