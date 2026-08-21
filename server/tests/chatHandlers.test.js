import test from "node:test";
import assert from "node:assert/strict";

import { registerChatHandlers } from "../realtime/registerChatHandlers.js";

function createSocket() {
  const handlers = new Map();
  const emitted = [];
  return {
    id: "socket-1",
    roomId: "room-4x4",
    data: {},
    emitted,
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    emit(eventName, payload) {
      emitted.push({ eventName, payload });
    },
    trigger(eventName, ...args) {
      return handlers.get(eventName)?.(...args);
    },
  };
}

function createHarness() {
  const socket = createSocket();
  const player = { nick: "Tigre", installId: "install-1" };
  const room = {
    id: "room-4x4",
    players: new Map([[socket.id, player]]),
    chatMessages: [],
  };
  const pushed = [];
  const socketEvents = [];
  const dependencies = {
    NICK_MAX_LEN: 24,
    censorTargetSpoilersInChatText: (_room, text) => text.replace("secret", "******"),
    checkTargetChatRateLimit: () => ({ ok: true }),
    deleteChatMessage: () => ({ ok: false, error: "unused" }),
    emitChatSocketEvent: (_io, roomId, eventName, payload) => {
      socketEvents.push({ roomId, eventName, payload });
    },
    emitPlayers: () => {},
    emitRoomsStats: () => {},
    emitTournamentLobby: () => {},
    getPlaytimeLimitStatus: () => ({ allowed: true }),
    getRoom: (roomId) => (roomId === room.id ? room : null),
    getSocketPlayerIdentity: () => ({ installId: "install-1", userId: "user-1" }),
    getTeamForInstallCached: () => "red",
    getWeeklyVocabPodiumRankForInstallId: () => 2,
    isDailyChampionInstallId: () => false,
    isInstallIdMuted: () => false,
    isWeeklyVocabChampionInstallId: () => false,
    io: {},
    joinSocketToChatRoom: () => {},
    markSocketPlayerActivity: () => false,
    normalizeChatReactionEmoji: (emoji) => (emoji === "👍" ? emoji : ""),
    pushChatMessage: (_room, message) => pushed.push(message),
    randomUUID: () => "message-1",
    requireSocketPlayerIdentity: () => ({ installId: "install-1", userId: "user-1" }),
    resolveReplyPreviewFromPayload: () => null,
    updateChatMessageReactions: () => ({
      ok: true,
      reactions: [{ emoji: "👍", count: 1 }],
      message: { reactionsUpdatedAt: 123 },
    }),
    updateChatMessageText: () => ({ ok: false, error: "unused" }),
  };

  registerChatHandlers(socket, dependencies);
  return { dependencies, player, pushed, room, socket, socketEvents };
}

test("chat send preserves identity, moderation and decoration contracts", () => {
  const { pushed, socket } = createHarness();
  let response = null;

  socket.trigger("chat:send", { text: "un secret", roomId: "room-4x4" }, (value) => {
    response = value;
  });

  assert.deepEqual(response, { ok: true });
  assert.equal(pushed.length, 1);
  assert.deepEqual(pushed[0], {
    id: "message-1",
    t: pushed[0].t,
    roomId: "room-4x4",
    nick: "Tigre",
    userId: "user-1",
    installId: "install-1",
    text: "un ******",
    team: "red",
    isDailyChampion: false,
    weeklyVocabPodiumRank: 2,
    isWeeklyVocabChampion: false,
  });
  assert.equal(Number.isFinite(pushed[0].t), true);
});

test("chat reaction keeps the existing broadcast event shape", () => {
  const { socket, socketEvents } = createHarness();
  let response = null;

  socket.trigger(
    "chat:react",
    { roomId: "room-4x4", messageId: "message-1", emoji: "👍" },
    (value) => {
      response = value;
    }
  );

  assert.deepEqual(response, { ok: true, reactions: [{ emoji: "👍", count: 1 }] });
  assert.deepEqual(socketEvents, [
    {
      roomId: "room-4x4",
      eventName: "chat:message_reaction",
      payload: {
        roomId: "room-4x4",
        messageId: "message-1",
        reactions: [{ emoji: "👍", count: 1 }],
        updatedAt: 123,
      },
    },
  ]);
});

test("chat subscribe joins the requested room and returns history plus playtime status", () => {
  const harness = createHarness();
  harness.room.chatMessages.push({ id: "history-1", text: "bonjour" });
  let joinedRoomId = null;
  harness.dependencies.joinSocketToChatRoom = (_socket, roomId) => {
    joinedRoomId = roomId;
  };
  registerChatHandlers(harness.socket, harness.dependencies);
  let response = null;

  harness.socket.trigger("chat:subscribe", { roomId: "room-4x4" }, (value) => {
    response = value;
  });

  assert.equal(joinedRoomId, "room-4x4");
  assert.deepEqual(harness.socket.emitted.at(-1), {
    eventName: "chat:history",
    payload: harness.room.chatMessages,
  });
  assert.deepEqual(response, {
    ok: true,
    roomId: "room-4x4",
    playtimeLimit: { allowed: true },
  });
});
