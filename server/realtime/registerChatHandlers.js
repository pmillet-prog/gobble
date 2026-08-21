export function registerChatHandlers(
  socket,
  {
    NICK_MAX_LEN,
    censorTargetSpoilersInChatText,
    checkTargetChatRateLimit,
    deleteChatMessage,
    emitChatSocketEvent,
    emitPlayers,
    emitRoomsStats,
    emitTournamentLobby,
    getPlaytimeLimitStatus,
    getRoom,
    getSocketPlayerIdentity,
    getTeamForInstallCached,
    getWeeklyVocabPodiumRankForInstallId,
    isDailyChampionInstallId,
    isInstallIdMuted,
    isWeeklyVocabChampionInstallId,
    io,
    joinSocketToChatRoom,
    markSocketPlayerActivity,
    normalizeChatReactionEmoji,
    pushChatMessage,
    randomUUID,
    requireSocketPlayerIdentity,
    resolveReplyPreviewFromPayload,
    updateChatMessageReactions,
    updateChatMessageText,
  }
) {
  socket.on("chat:send", (text, cb) => {
    let payload = text;
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    const isPayloadObject = payload && typeof payload === "object";
    const roomIdFromPayload =
      isPayloadObject && typeof payload.roomId === "string"
        ? payload.roomId
        : null;
    const room = getRoom(
      roomIdFromPayload || socket.roomId || socket.data?.chatRoomId || "room-4x4"
    );
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const rawText = isPayloadObject ? payload.text : payload;
    if (typeof rawText !== "string") {
      cb?.({ ok: false });
      return;
    }
    const trimmed = rawText.trim();
    if (!trimmed) {
      cb?.({ ok: false });
      return;
    }
    const player = room.players.get(socket.id);
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const lobbyNick =
      isPayloadObject && typeof payload.nick === "string" ? payload.nick.trim() : "";
    const isLobbyPayload = !player && isPayloadObject && payload?.lobby === true;
    const authorNick = player?.nick || lobbyNick;
    if (!authorNick) {
      cb?.({ ok: false, error: "empty_nick" });
      return;
    }
    if (authorNick.length > NICK_MAX_LEN) {
      cb?.({ ok: false, error: "nick_too_long" });
      return;
    }
    const installId = identity.installId;
    if (!installId) {
      cb?.({ ok: false, error: "invalid_install_id" });
      return;
    }
    if (isInstallIdMuted(installId)) {
      cb?.({ ok: false, error: "muted" });
      return;
    }
    if (isLobbyPayload) {
      socket.data.chatInstallId = installId;
      socket.data.chatNick = authorNick;
      joinSocketToChatRoom(socket, room.id);
    } else if (!player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    const resumedFromAfk = player
      ? markSocketPlayerActivity(room, socket, "chat")
      : false;
    if (resumedFromAfk) {
      emitPlayers(room);
      emitTournamentLobby(room);
      emitRoomsStats();
    }
    const rateLimit = checkTargetChatRateLimit(room, installId);
    if (!rateLimit.ok) {
      cb?.({
        ok: false,
        error: "rate_limited",
        retryMs: rateLimit.retryMs,
        message: "Attends quelques secondes avant de renvoyer un message.",
      });
      return;
    }
    const safeText = censorTargetSpoilersInChatText(room, trimmed);
    const replyTo = isPayloadObject ? resolveReplyPreviewFromPayload(room, payload.replyTo) : null;
    const message = {
      id: randomUUID(),
      t: Date.now(),
      roomId: room.id,
      nick: authorNick,
      userId: identity.userId,
      installId,
      text: safeText,
      team: getTeamForInstallCached(installId),
      isDailyChampion: isDailyChampionInstallId(installId),
      weeklyVocabPodiumRank: getWeeklyVocabPodiumRankForInstallId(installId, authorNick),
      isWeeklyVocabChampion: isWeeklyVocabChampionInstallId(installId, authorNick),
    };
    if (replyTo) {
      message.replyTo = replyTo;
    }
    pushChatMessage(room, message);
    cb?.({ ok: true });
  });

  socket.on("chat:react", (payload, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    if (!payload || typeof payload !== "object") {
      cb?.({ ok: false, error: "invalid_payload" });
      return;
    }
    const roomIdFromPayload =
      typeof payload.roomId === "string" && payload.roomId.trim() ? payload.roomId.trim() : null;
    const room = getRoom(
      roomIdFromPayload || socket.roomId || socket.data?.chatRoomId || "room-4x4"
    );
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : "";
    const emoji = normalizeChatReactionEmoji(payload.emoji);
    if (!messageId || !emoji) {
      cb?.({ ok: false, error: "invalid_payload" });
      return;
    }

    const player = room.players.get(socket.id);
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const lobbyNick = typeof payload.nick === "string" ? payload.nick.trim() : "";
    const isLobbyPayload = !player && payload?.lobby === true;
    const authorNick = (player?.nick || lobbyNick || socket.data?.chatNick || "").trim();
    if (!authorNick) {
      cb?.({ ok: false, error: "empty_nick" });
      return;
    }
    if (authorNick.length > NICK_MAX_LEN) {
      cb?.({ ok: false, error: "nick_too_long" });
      return;
    }
    const installId = identity.installId;
    if (!installId) {
      cb?.({ ok: false, error: "invalid_install_id" });
      return;
    }
    if (isInstallIdMuted(installId)) {
      cb?.({ ok: false, error: "muted" });
      return;
    }
    if (isLobbyPayload) {
      socket.data.chatInstallId = installId;
      socket.data.chatNick = authorNick;
      joinSocketToChatRoom(socket, room.id);
    } else if (!player && !socket.data?.chatInstallId) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }

    const result = updateChatMessageReactions(room, {
      messageId,
      emoji,
      installId,
      nick: authorNick,
    });
    if (!result.ok) {
      cb?.({ ok: false, error: result.error || "reaction_failed" });
      return;
    }

    emitChatSocketEvent(io, room.id, "chat:message_reaction", {
      roomId: room.id,
      messageId,
      reactions: result.reactions,
      updatedAt: result.message?.reactionsUpdatedAt || Date.now(),
    });
    cb?.({ ok: true, reactions: result.reactions });
  });

  socket.on("chat:edit", (payload, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    if (!payload || typeof payload !== "object") {
      cb?.({ ok: false, error: "invalid_payload" });
      return;
    }
    const roomIdFromPayload =
      typeof payload.roomId === "string" && payload.roomId.trim() ? payload.roomId.trim() : null;
    const room = getRoom(
      roomIdFromPayload || socket.roomId || socket.data?.chatRoomId || "room-4x4"
    );
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const player = room.players.get(socket.id);
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const isLobbyPayload = !player && payload?.lobby === true;
    const installId = identity.installId;
    if (!installId) {
      cb?.({ ok: false, error: "invalid_install_id" });
      return;
    }
    if (isLobbyPayload) {
      socket.data.chatInstallId = installId;
      joinSocketToChatRoom(socket, room.id);
    } else if (!player && !socket.data?.chatInstallId) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    const result = updateChatMessageText(room, {
      messageId: payload.messageId,
      installId,
      text: payload.text,
    });
    if (!result.ok) {
      cb?.({ ok: false, error: result.error || "edit_failed" });
      return;
    }
    emitChatSocketEvent(io, room.id, "chat:message_update", {
      roomId: room.id,
      message: result.message,
    });
    cb?.({ ok: true, message: result.message });
  });

  socket.on("chat:delete", (payload, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    if (!payload || typeof payload !== "object") {
      cb?.({ ok: false, error: "invalid_payload" });
      return;
    }
    const roomIdFromPayload =
      typeof payload.roomId === "string" && payload.roomId.trim() ? payload.roomId.trim() : null;
    const room = getRoom(
      roomIdFromPayload || socket.roomId || socket.data?.chatRoomId || "room-4x4"
    );
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const player = room.players.get(socket.id);
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const isLobbyPayload = !player && payload?.lobby === true;
    const installId = identity.installId;
    if (!installId) {
      cb?.({ ok: false, error: "invalid_install_id" });
      return;
    }
    if (isLobbyPayload) {
      socket.data.chatInstallId = installId;
      joinSocketToChatRoom(socket, room.id);
    } else if (!player && !socket.data?.chatInstallId) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    const result = deleteChatMessage(room, {
      messageId: payload.messageId,
      installId,
    });
    if (!result.ok) {
      cb?.({ ok: false, error: result.error || "delete_failed" });
      return;
    }
    emitChatSocketEvent(io, room.id, "chat:message_delete", {
      roomId: room.id,
      messageId: result.messageId,
      deletedAt: result.deletedAt,
    });
    cb?.({ ok: true, messageId: result.messageId });
  });

  socket.on("chat:subscribe", (payload, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    joinSocketToChatRoom(socket, room.id);
    socket.emit("chat:history", Array.isArray(room.chatMessages) ? room.chatMessages : []);
    const identity = getSocketPlayerIdentity(socket);
    cb?.({
      ok: true,
      roomId: room.id,
      playtimeLimit: identity ? getPlaytimeLimitStatus(identity.userId) : null,
    });
  });
}
