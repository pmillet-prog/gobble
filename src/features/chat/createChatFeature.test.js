import assert from "node:assert/strict";
import test from "node:test";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { chatAvatarRevisions } from "../avatar/chatAvatarRevisions.js";
import {
  createChatFeature,
  isCapelloInterventionMessage,
  isPivotInterventionMessage,
  isRomejkoInterventionMessage,
} from "./createChatFeature.js";

function createMemoryStorage(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));
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

test("chat keeps bot messages disabled by default and persists the preference", () => {
  const storage = createMemoryStorage();
  const scope = createResourceScope("chat-test");
  const chat = createChatFeature({ scope }, { storage });
  chat.start();

  assert.equal(chat.store.getState().showBotMessages, false);
  assert.equal("botVisibility" in chat.store.getState(), true);

  chat.set("blockedInstallIds", ["install-blocked"]);
  chat.set("showBotMessages", true);
  chat.set("activeArea", "chat");

  assert.deepEqual(JSON.parse(storage.writes[0].value), ["install-blocked"]);
  assert.equal(storage.writes.at(-1).value, "1");
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
    socket,
  });
  chat.start();

  assert.deepEqual([...handlers.keys()].sort(), [
    "avatar:updated",
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

  const unchangedMessages = chat.store.getState().messages;
  socket.fire("avatar:updated", { userId: 9035, revision: 2 });
  assert.match(chatAvatarRevisions.url(9035), /\/9035\/chat\.png\?v=2/);
  assert.equal(chat.store.getState().messages, unchangedMessages, "editing an avatar does not rebuild the message list");

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

test("presented bot interventions leave chat for their overlays", () => {
  const handlers = new Map();
  const socket = {
    bind(nextHandlers) {
      for (const [eventName, handler] of Object.entries(nextHandlers)) {
        handlers.set(eventName, handler);
      }
      return () => handlers.clear();
    },
    fire(eventName, payload) {
      handlers.get(eventName)?.(payload);
    },
  };
  const scope = createResourceScope("capello-chat-test");
  const chat = createChatFeature(
    { ports: { realtime: socket }, scope },
    {
      storage: createMemoryStorage({
        gobble_chat_bot_visibility_v1: JSON.stringify({
          coach: false,
          detective: false,
          linguist: false,
        }),
        gobble_chat_show_bot_messages: "0",
      }),
    }
  );
  chat.configureRealtime({
    installIdRef: { current: "install-self" },
    isLoggedInRef: { current: true },
    isMobileLayoutRef: { current: true },
    nicknameRef: { current: "Tigre" },
    socket,
  });
  const interventions = [];
  const pivotInterventions = [];
  const romejkoInterventions = [];
  chat.subscribeCapelloInterventions((event) => interventions.push(event));
  chat.subscribePivotInterventions((event) => pivotInterventions.push(event));
  chat.subscribeRomejkoInterventions((event) => romejkoInterventions.push(event));
  chat.start();

  const suffixMessage = {
    id: "suffix-1",
    installId: "ambient-bot:coach",
    isBot: true,
    meta: { category: "coach", kind: "ambient_bot_chat" },
    nick: "Maître Gobbello",
    roomId: "room-4x4",
    t: 123,
    text: "Le suffixe -able permet encore 4 mots.",
  };
  assert.equal(isCapelloInterventionMessage(suffixMessage), true);
  assert.equal(
    isCapelloInterventionMessage({ ...suffixMessage, meta: { category: "coach" } }),
    false
  );

  socket.fire("chatMessage", suffixMessage);
  assert.deepEqual(interventions, [
    {
      id: "suffix-1",
      roomId: "room-4x4",
      t: 123,
      text: "Le suffixe -able permet encore 4 mots.",
    },
  ]);
  assert.equal(chat.store.getState().messages.length, 0);
  assert.equal(chat.store.getState().mobileUnreadCount, 0);

  const linguistMessage = {
    ...suffixMessage,
    id: "linguist-1",
    installId: "ambient-bot:linguist",
    meta: { category: "linguist", kind: "ambient_bot_chat" },
    nick: "Bernard Pinot",
    text: "Le mot gobelin vient du latin tardif gobelinus.",
  };
  assert.equal(isPivotInterventionMessage(linguistMessage), true);
  assert.equal(
    isPivotInterventionMessage({
      ...linguistMessage,
      meta: { category: "linguist" },
    }),
    false
  );

  socket.fire("chatMessage", linguistMessage);
  assert.deepEqual(pivotInterventions, [
    {
      id: "linguist-1",
      roomId: "room-4x4",
      t: 123,
      text: "Le mot gobelin vient du latin tardif gobelinus.",
    },
  ]);
  assert.equal(chat.store.getState().messages.length, 0);
  assert.equal(chat.store.getState().mobileUnreadCount, 0);
  assert.equal(interventions.length, 1);

  const detectiveMessage = {
    ...suffixMessage,
    id: "detective-1",
    installId: "ambient-bot:detective",
    meta: { category: "detective", kind: "ambient_bot_chat" },
    nick: "Romejko",
    text: "Il y a 3 mots de 9 lettres à trouver : ce sont les plus longs de la grille.",
  };
  assert.equal(isRomejkoInterventionMessage(detectiveMessage), true);
  socket.fire("chatMessage", detectiveMessage);
  assert.deepEqual(romejkoInterventions, [
    {
      id: "detective-1",
      roomId: "room-4x4",
      t: 123,
      text: "Il y a 3 mots de 9 lettres à trouver : ce sont les plus longs de la grille.",
    },
  ]);
  assert.equal(chat.store.getState().messages.length, 0);
  assert.equal(chat.store.getState().mobileUnreadCount, 0);

  socket.fire("chatMessage", {
    ...suffixMessage,
    id: "culture-1",
    installId: "ambient-bot:culture",
    meta: { category: "culture", kind: "ambient_bot_chat" },
    nick: "Julien Lechéper",
  });
  assert.equal(chat.store.getState().messages.length, 1);
  assert.equal(chat.store.getState().mobileUnreadCount, 0);
  assert.equal(interventions.length, 1);
  assert.equal(pivotInterventions.length, 1);
  assert.equal(romejkoInterventions.length, 1);

  socket.fire("chat:history", [suffixMessage, linguistMessage, detectiveMessage]);
  assert.equal(chat.store.getState().messages.length, 1);
  assert.equal(interventions.length, 2);
  assert.equal(pivotInterventions.length, 2);
  assert.equal(romejkoInterventions.length, 2);
  const lateCapelloInterventions = [];
  const latePivotInterventions = [];
  const lateRomejkoInterventions = [];
  chat.subscribeCapelloInterventions((event) => lateCapelloInterventions.push(event));
  chat.subscribePivotInterventions((event) => latePivotInterventions.push(event));
  chat.subscribeRomejkoInterventions((event) => lateRomejkoInterventions.push(event));
  assert.equal(lateCapelloInterventions.at(-1)?.id, "suffix-1");
  assert.equal(latePivotInterventions.at(-1)?.id, "linguist-1");
  assert.equal(lateRomejkoInterventions.at(-1)?.id, "detective-1");
  scope.dispose();
});

test("presenter chat copies are silent, opt-in and deduplicated", () => {
  const scope = createResourceScope("presenter-chat-copy-test");
  const chat = createChatFeature(
    { scope },
    { storage: createMemoryStorage() }
  );
  chat.start();

  const pivotEvent = {
    id: "round-target:pivot",
    roomId: "room-4x4",
    roundId: "round-target",
    t: 123,
    text: "CIBLE — Étymologie : du latin.",
    chatCopyText: "CIBLE — Une définition complète. Étymologie : du latin.",
  };
  assert.equal(chat.recordPresenterActivation("pivot", pivotEvent), true);
  assert.equal(chat.recordPresenterActivation("pivot", pivotEvent), false);
  assert.equal(chat.store.getState().mobileUnreadCount, 0);
  assert.equal(chat.store.getState().messages.length, 0);
  assert.equal(
    chat.recordPresenterPresentationComplete("pivot", pivotEvent),
    true
  );
  assert.equal(chat.store.getState().messages.length, 1);
  assert.equal(chat.store.getState().messages[0].nick, "Bernard Pinot");
  assert.equal(
    chat.store.getState().messages[0].text,
    pivotEvent.chatCopyText
  );

  const lepersChallenge = {
    id: "round-lepers:challenge",
    kind: "challenge",
    roundId: "round-lepers",
    text: "TOP ! Je suis une définition.",
  };
  const lepersAnswer = {
    id: "round-lepers:answer",
    kind: "answer",
    roundId: "round-lepers",
    text: "La réponse était GOBBLE.",
  };
  chat.recordPresenterPresentationComplete("lepers", lepersAnswer);
  assert.equal(chat.store.getState().messages.length, 1);
  chat.recordPresenterActivation("lepers", lepersChallenge);
  chat.recordPresenterPresentationComplete("lepers", lepersChallenge);
  chat.recordPresenterPresentationComplete("lepers", lepersAnswer);
  chat.recordPresenterPresentationComplete("lepers", lepersAnswer);
  assert.deepEqual(
    chat.store
      .getState()
      .messages.map((message) => [message.nick, message.text]),
    [
      ["Bernard Pinot", pivotEvent.chatCopyText],
      ["Julien Lechéper", lepersChallenge.text],
      ["Julien Lechéper", lepersAnswer.text],
    ]
  );
  assert.equal(chat.store.getState().mobileUnreadCount, 0);
  scope.dispose();
});

test("presenter interventions can be restored directly from a round snapshot", () => {
  const scope = createResourceScope("chat-presenter-snapshot-test");
  const chat = createChatFeature(
    { scope },
    { storage: createMemoryStorage() }
  );
  const capelloInterventions = [];
  const pivotInterventions = [];
  const romejkoInterventions = [];
  chat.start();
  chat.subscribeCapelloInterventions((event) => capelloInterventions.push(event));
  chat.subscribePivotInterventions((event) => pivotInterventions.push(event));
  chat.subscribeRomejkoInterventions((event) => romejkoInterventions.push(event));

  chat.hydratePresenterInterventions([
    {
      id: "round-4:coach",
      roomId: "room-4x4",
      roundId: "round-4",
      text: "Cherchez cette terminaison.",
      meta: { category: "coach", kind: "ambient_bot_chat", roundId: "round-4" },
    },
    {
      id: "round-4:detective",
      roomId: "room-4x4",
      roundId: "round-4",
      text: "Trois mots de neuf lettres.",
      meta: { category: "detective", kind: "ambient_bot_chat", roundId: "round-4" },
    },
    {
      id: "round-4:linguist",
      roomId: "room-4x4",
      roundId: "round-4",
      text: "MOT — Étymologie : du latin.",
      meta: {
        category: "linguist",
        kind: "ambient_bot_chat",
        roundId: "round-4",
        chatCopyText: "MOT — Définition complète. Étymologie : du latin.",
      },
    },
  ]);

  assert.equal(capelloInterventions.at(-1)?.roundId, "round-4");
  assert.equal(
    pivotInterventions.at(-1)?.chatCopyText,
    "MOT — Définition complète. Étymologie : du latin."
  );
  assert.equal(romejkoInterventions.at(-1)?.roundId, "round-4");
  scope.dispose();
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

test("chat feature delegates focus to the mounted presentation owner", () => {
  const scope = createResourceScope("chat-focus-owner-test");
  const chat = createChatFeature(
    { scope },
    { storage: createMemoryStorage() }
  );
  const focusCalls = [];
  chat.configureCommands({
    onFocusInput: () => focusCalls.push("fallback"),
  });
  chat.start();

  chat.focusInput();
  const unregister = chat.registerInputFocusHandler(() =>
    focusCalls.push("desktop")
  );
  chat.focusInput();
  unregister();
  chat.focusInput();

  assert.deepEqual(focusCalls, ["fallback", "desktop", "fallback"]);
  scope.dispose();
});
