export function registerSessionHandlers(
  socket,
  {
    NICK_MAX_LEN,
    appendConnectionLog,
    buildModerationBanResponse,
    buildPlaytimeBlockedResponse,
    buildRankingUpdatePayload,
    buildRoundStartedPayload,
    buildSessionSnapshot,
    buildTournamentLobbyPayload,
    clearPendingDisconnect,
    clearPlayerAfkTimer,
    cleanupExpiredMedals,
    emitMedals,
    emitPlayers,
    emitRoomsStats,
    emitTournamentLobby,
    ensurePlayerInRound,
    expandTargetRevealed,
    findPlayerByInstallId,
    getActiveModerationBan,
    getClientIpFromSocket,
    getPlaytimeLimitStatus,
    getRoom,
    getTargetHintScheduleMs,
    getTeamDot,
    getTeamForInstallCached,
    io,
    isBotToken,
    isRoundActive,
    joinSocketToChatRoom,
    markPresenceJoinAnnounced,
    normalizeInstallId,
    normalizeTargetRevealIndices,
    persistenceClient,
    pushSystemChatMessage,
    refreshInstallDuelCache,
    requireSocketPlayerIdentity,
    resolveTargetHintCells,
    schedulePlayerAfkTransition,
  }
) {
  socket.on("session:resume", async (payload, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const activeBan = getActiveModerationBan(identity);
    if (activeBan) {
      cb?.(buildModerationBanResponse(activeBan));
      return;
    }
    const playtimeStatus = getPlaytimeLimitStatus(identity.userId);
    if (playtimeStatus?.active && playtimeStatus.exhausted) {
      cb?.({ ...buildPlaytimeBlockedResponse(playtimeStatus), available: false });
      return;
    }
    const installId = identity.installId;
    const roomId = payload?.roomId;
    if (!installId || !roomId) {
      cb?.({ ok: false, available: false, error: "invalid_payload" });
      return;
    }
    const room = getRoom(roomId);
    if (!room) {
      cb?.({ ok: false, available: false, error: "invalid_room" });
      return;
    }
    const match = findPlayerByInstallId(room, installId);
    if (!match?.player) {
      cb?.({ ok: true, available: false });
      return;
    }
    const now = Date.now();
    const takeover = !!payload?.takeover;
    let player = match.player;
    if (takeover) {
      if (match.socketId && match.socketId !== socket.id) {
        clearPendingDisconnect(room, match.socketId);
        clearPlayerAfkTimer(match.player);
        room.players.delete(match.socketId);
        const oldSocket = io.sockets.sockets.get(match.socketId);
        if (oldSocket) {
          try {
            oldSocket.leave(room.id);
          } catch (_) {}
          oldSocket.disconnect(true);
        }
      }
      player = {
        ...player,
        userId: identity.userId,
        installId,
        connected: true,
        lastSeenAt: now,
        lastActivityAt: now,
      };
      room.players.set(socket.id, player);
      schedulePlayerAfkTransition(room, socket.id, player);
      room.nickToInstallId.set(player.nick, player.installId || installId);
      persistenceClient.upsertVocabularyProfile({ installId, nick: player.nick, updatedAt: now });
      try {
        await refreshInstallDuelCache(installId);
      } catch (_) {}
      socket.data.installId = installId;
      socket.data.userId = identity.userId;
      socket.data.nick = player.nick;
      socket.data.roomId = room.id;
      socket.data.playtimeUsageLastAt = Date.now();
      socket.roomId = room.id;
      socket.join(room.id);
      joinSocketToChatRoom(socket, room.id);
      emitPlayers(room);
      emitTournamentLobby(room);
      emitMedals(room);
      emitRoomsStats();
    }
    const snapshot = buildSessionSnapshot(room, player);
    cb?.({
      ok: true,
      available: true,
      attached: takeover || match.socketId === socket.id,
      snapshot,
      playtimeLimit: getPlaytimeLimitStatus(identity.userId),
    });
  });

  socket.on("login", async (payload, cb) => {
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const activeBan = getActiveModerationBan(identity);
    if (activeBan) {
      cb?.(buildModerationBanResponse(activeBan));
      return;
    }
    const playtimeStatus = getPlaytimeLimitStatus(identity.userId);
    if (playtimeStatus?.active && playtimeStatus.exhausted) {
      cb?.(buildPlaytimeBlockedResponse(playtimeStatus));
      return;
    }
    const nick = typeof payload === "string" ? payload : payload?.nick;
    const token = typeof payload === "object" ? payload?.clientId : null;
    const installId = identity.installId;
    const requestedRoomId =
      typeof payload === "object" && payload?.roomId
        ? payload.roomId
        : "room-4x4";
    const room = getRoom(requestedRoomId);

    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }

    const trimmed = (nick || "").trim();
    if (!trimmed) {
      cb?.({ ok: false, error: "empty_nick" });
      return;
    }

    if (trimmed.length > NICK_MAX_LEN) {
      cb?.({ ok: false, error: "nick_too_long" });
      return;
    }

    const now = Date.now();
    let resumeSocketId = null;
    for (const [socketId, p] of room.players.entries()) {
      if (p.nick !== trimmed) continue;
      const sameInstall = normalizeInstallId(p.installId) === installId;
      if (sameInstall) {
        resumeSocketId = socketId;
        break;
      }
      cb?.({ ok: false, error: "pseudo_taken" });
      return;
    }

    if (resumeSocketId && resumeSocketId !== socket.id) {
      clearPendingDisconnect(room, resumeSocketId);
      clearPlayerAfkTimer(room.players.get(resumeSocketId));
      room.players.delete(resumeSocketId);
      const oldSocket = io.sockets.sockets.get(resumeSocketId);
      if (oldSocket) {
        try {
          oldSocket.leave(room.id);
        } catch (_) {}
        oldSocket.disconnect(true);
      }
    }

    // Réservation de pseudo désactivée (trop gênant sur mobile lors des retours d'appli)
    cleanupExpiredMedals(room);
    const isResumeLogin = !!resumeSocketId;

    room.players.set(socket.id, {
      nick: trimmed,
      token: token || null,
      userId: identity.userId,
      installId,
      connected: true,
      lastSeenAt: now,
      lastActivityAt: now,
    });
    schedulePlayerAfkTransition(room, socket.id, room.players.get(socket.id));
    room.nickToInstallId.set(trimmed, installId);
    persistenceClient.upsertVocabularyProfile({ installId, nick: trimmed, updatedAt: now });
    try {
      await refreshInstallDuelCache(installId);
    } catch (_) {}
    socket.data.installId = installId;
    socket.data.userId = identity.userId;
    socket.data.nick = trimmed;
    socket.data.roomId = room.id;
    socket.data.playtimeUsageLastAt = Date.now();
    socket.roomId = room.id;
    socket.join(room.id);
    joinSocketToChatRoom(socket, room.id);
    if (!isBotToken(token) && !isResumeLogin) {
      const team = getTeamForInstallCached(installId);
      pushSystemChatMessage(
        room,
        `${trimmed} ${getTeamDot(team)} a rejoint le tournoi`,
        { installId, team, nick: trimmed, meta: { kind: "join_tournament" } }
      );
      markPresenceJoinAnnounced(room, installId);
    }
    console.log("Login:", socket.id, trimmed, "->", room.id);
    appendConnectionLog({
      nick: trimmed,
      roomId: room.id,
      ip: getClientIpFromSocket(socket),
      userAgent: socket?.handshake?.headers?.["user-agent"],
    });
    cb?.({ ok: true, roomId: room.id });

    emitPlayers(room);
    emitTournamentLobby(room);
    emitMedals(room);
    emitRoomsStats();
    socket.emit("chat:history", room.chatMessages);

    if (room.currentRound && isRoundActive(room.currentRound)) {
      ensurePlayerInRound(room, trimmed);

      const roundStartedPayload = buildRoundStartedPayload(room);
      if (roundStartedPayload) {
        socket.emit("roundStarted", roundStartedPayload);
      }

      // Si on rejoint en cours de manche "cible", renvoyer l'etat courant de l'indice
      // (sinon le joueur ne verra le pattern qu'au hint suivant).
      const specialType = room.currentRound?.special?.type;
      const isTargetRound = specialType === "target_long" || specialType === "target_score";
      if (isTargetRound && typeof room.currentRound.targetWord === "string" && room.currentRound.targetWord) {
        const startedAt =
          (Number.isFinite(room.currentRound.startsAt) ? room.currentRound.startsAt : null) ||
          ((room.currentRound.endsAt || Date.now()) -
            (room.currentRound.durationMs || room.config.durationMs || 0));
        const elapsed = Date.now() - startedAt;
        const targetHintScheduleMs =
          Array.isArray(room.currentRound.targetHintScheduleMs) &&
          room.currentRound.targetHintScheduleMs.length
            ? room.currentRound.targetHintScheduleMs
            : getTargetHintScheduleMs({
                targetWord: room.currentRound.targetWord,
                targetLength: room.currentRound.targetLength,
                roundDurationMs:
                  room.currentRound.durationMs || room.config.durationMs || 90 * 1000,
                roundType: specialType,
              });
        const firstHintMs =
          targetHintScheduleMs.length > 0 ? targetHintScheduleMs[0] : Number.POSITIVE_INFINITY;
        if (elapsed >= firstHintMs) {
      const word = room.currentRound.targetWord || "";
      const revealed = room.currentRound.targetRevealed || new Set();
      const expanded = expandTargetRevealed(word, revealed);
      if (expanded.size !== revealed.size) {
        room.currentRound.targetRevealed = expanded;
      }
      const chars = word.split("");
      const pattern = chars
        .map((ch, idx) => (expanded.has(idx) ? ch.toUpperCase() : "_"))
        .join(" ");
      const revealWordIndices = normalizeTargetRevealIndices(Array.from(expanded));
      socket.emit("specialHint", {
        roomId: room.id,
        roundId: room.currentRound.id,
        kind: specialType,
        length: chars.length,
        pattern,
        revealCells: resolveTargetHintCells(room, revealWordIndices),
        revealWordIndices,
      });
    }
      }
      const builtRanking = buildRankingUpdatePayload(room);
      if (builtRanking?.payload) {
        socket.emit("rankingUpdate", builtRanking.payload);
      }
    } else if (room.breakState && typeof room.breakState.nextStartAt === "number") {
      socket.emit("breakStarted", {
        roomId: room.id,
        nextStartAt: room.breakState.nextStartAt,
        breakKind: room.breakState.breakKind,
        tournament: room.breakState.tournament,
        nextSpecial: room.breakState.nextSpecial || null,
        tournamentSummary: room.breakState.tournamentSummary || null,
        tournamentSummaryAt: room.breakState.tournamentSummaryAt || null,
        targetSummary: room.breakState.targetSummary || null,
      });
    } else {
      socket.emit("tournamentLobbyUpdate", buildTournamentLobbyPayload(room));
    }
  });
}
