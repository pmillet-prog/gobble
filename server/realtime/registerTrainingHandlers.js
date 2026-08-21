export function registerTrainingHandlers(
  socket,
  {
    appendRecentTrainingGridId,
    buildMaintenanceBlockedPayload,
    buildModerationBanResponse,
    buildPlaytimeBlockedResponse,
    buildSessionSnapshot,
    buildStandaloneTrainingLiveStatus,
    buildStandaloneTrainingPayload,
    buildTournamentLobbyPayload,
    clearPlayerAfkTimer,
    clearPresenceAnnouncement,
    emitMedals,
    emitPlayers,
    emitRoomsStats,
    emitTournamentLobby,
    ensurePlayerInRound,
    ensureStandaloneTrainingPresence,
    ensureTournamentLobby,
    getActiveModerationBan,
    getPlayerReadyKey,
    getPlaytimeLimitStatus,
    getRoom,
    getStandaloneTrainingObserverRoomId,
    getTeamDot,
    getTeamForInstallCached,
    isHumanPlayer,
    isInterTournamentLobbyOpen,
    isMaintenanceModeActive,
    isRoundActive,
    isStandaloneTrainingEnabled,
    isStandaloneTrainingPlayer,
    joinSocketToChatRoom,
    markPresenceJoinAnnounced,
    markSocketPlayerActivity,
    maybeStartTournamentCountdown,
    normalizeTrainingDurationMs,
    normalizeTrainingMode,
    pushSystemChatMessage,
    randomUUID,
    requireSocketPlayerIdentity,
    startTrainingRound,
    trainingPoolStore,
    wasPresenceJoinAnnounced,
  }
) {
  socket.on("tournament:ready", (payload, cb) => {
    const room = getRoom(socket.roomId || payload?.roomId);
    const player = room?.players.get(socket.id);
    if (!room || !player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    if (isStandaloneTrainingPlayer(player)) {
      cb?.({ ok: false, error: "in_training", lobby: buildTournamentLobbyPayload(room) });
      return;
    }
    if (isMaintenanceModeActive()) {
      cb?.({ ...buildMaintenanceBlockedPayload(), lobby: buildTournamentLobbyPayload(room) });
      emitTournamentLobby(room);
      return;
    }
    if (!isInterTournamentLobbyOpen(room)) {
      cb?.({ ok: false, error: "room_busy", lobby: buildTournamentLobbyPayload(room) });
      return;
    }
    markSocketPlayerActivity(room, socket, "ready");
    const readyKey = getPlayerReadyKey(player);
    if (!readyKey) {
      cb?.({ ok: false, error: "invalid_player" });
      return;
    }
    const lobby = ensureTournamentLobby(room);
    const requestedReady = payload && typeof payload === "object" && "ready" in payload
      ? !!payload.ready
      : !lobby.readyKeys.has(readyKey);
    if (requestedReady) lobby.readyKeys.add(readyKey);
    else lobby.readyKeys.delete(readyKey);
    emitPlayers(room);
    maybeStartTournamentCountdown(room);
    cb?.({ ok: true, ready: requestedReady, lobby: buildTournamentLobbyPayload(room) });
  });

  socket.on("player:activity", (payload = {}, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = {};
    }
    const room = getRoom(socket.roomId || payload?.roomId);
    if (!room?.players.has(socket.id)) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    const rawKind = typeof payload?.kind === "string" ? payload.kind.trim() : "interaction";
    const kind = /^[a-z0-9:_-]{1,40}$/i.test(rawKind) ? rawKind : "interaction";
    const wasAfk = markSocketPlayerActivity(room, socket, kind);
    if (wasAfk) {
      emitPlayers(room);
      emitTournamentLobby(room);
      emitRoomsStats();
      maybeStartTournamentCountdown(room);
    }
    cb?.({ ok: true, active: true, transitioned: wasAfk });
  });

  socket.on("training:start", (payload, cb) => {
    const room = getRoom(socket.roomId || payload?.roomId);
    const player = room?.players.get(socket.id);
    if (!room || !player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    if (isMaintenanceModeActive()) {
      cb?.({ ...buildMaintenanceBlockedPayload(), lobby: buildTournamentLobbyPayload(room) });
      emitTournamentLobby(room);
      return;
    }
    markSocketPlayerActivity(room, socket, "training");
    startTrainingRound(room, payload?.type || "normal")
      .then((result) => cb?.(result))
      .catch((err) => {
        console.warn(`[${room.id}] training:start failed`, err);
        cb?.({ ok: false, error: "internal" });
      });
  });

  socket.on("training:standalone:start", async (payload, cb) => {
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const activeBan = getActiveModerationBan(identity);
    if (activeBan) {
      cb?.(buildModerationBanResponse(activeBan));
      return;
    }
    const room = getRoom(payload?.roomId || socket.roomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    if (isMaintenanceModeActive() || !isStandaloneTrainingEnabled()) {
      cb?.({ ...buildMaintenanceBlockedPayload(), lobby: buildTournamentLobbyPayload(room) });
      return;
    }
    const mode = normalizeTrainingMode(payload?.type);
    if (!mode) {
      cb?.({ ok: false, error: "training_mode_unsupported" });
      return;
    }
    const player = ensureStandaloneTrainingPresence(room, socket, identity, payload);
    if (!player || !isHumanPlayer(player)) {
      cb?.({ ok: false, error: "invalid_player" });
      return;
    }
    const durationMs = normalizeTrainingDurationMs(payload?.durationMs);
    try {
      const entry = await trainingPoolStore.getRandomEntry(mode, {
        excludeIds: player.trainingRecentGridIds,
      });
      const startedAt = Date.now();
      const sessionId = randomUUID();
      player.trainingRecentGridIds = appendRecentTrainingGridId(
        player.trainingRecentGridIds,
        entry.id
      );
      player.standaloneTraining = {
        sessionId,
        mode,
        gridId: entry.id,
        startedAt,
        durationMs,
      };
      const readyKey = getPlayerReadyKey(player);
      if (readyKey) ensureTournamentLobby(room).readyKeys.delete(readyKey);
      player.lastActivityReason = "standalone_training";
      clearPlayerAfkTimer(player);
      emitPlayers(room);
      emitRoomsStats();
      maybeStartTournamentCountdown(room);
      cb?.({
        ok: true,
        training: buildStandaloneTrainingPayload({
          entry,
          durationMs,
          sessionId,
          startedAt,
        }),
        liveStatus: buildStandaloneTrainingLiveStatus(room),
      });
    } catch (error) {
      console.warn(`[${room.id}] training:standalone:start failed`, error);
      if (player.trainingPresenceOnly === true && !isStandaloneTrainingPlayer(player)) {
        room.players.delete(socket.id);
        socket.leave(getStandaloneTrainingObserverRoomId(room.id));
        joinSocketToChatRoom(socket, room.id);
        emitPlayers(room);
        emitRoomsStats();
      }
      cb?.({ ok: false, error: "training_pool_unavailable" });
    }
  });

  socket.on("training:standalone:presence", (payload, cb) => {
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const room = getRoom(payload?.roomId || socket.roomId || "room-4x4");
    const sessionId = String(payload?.sessionId || "").trim();
    const mode = normalizeTrainingMode(payload?.type);
    if (!room || !sessionId || !mode) {
      cb?.({ ok: false, error: "invalid_training_presence" });
      return;
    }
    const player = ensureStandaloneTrainingPresence(room, socket, identity, payload);
    if (!player || !isHumanPlayer(player)) {
      cb?.({ ok: false, error: "invalid_training_presence" });
      return;
    }
    player.standaloneTraining = {
      sessionId,
      mode,
      gridId: String(payload?.gridId || "").trim() || null,
      startedAt: Number(payload?.startedAt) || Date.now(),
      durationMs: normalizeTrainingDurationMs(payload?.durationMs),
    };
    const readyKey = getPlayerReadyKey(player);
    if (readyKey) ensureTournamentLobby(room).readyKeys.delete(readyKey);
    player.lastActivityReason = "standalone_training";
    clearPlayerAfkTimer(player);
    emitPlayers(room);
    emitRoomsStats();
    maybeStartTournamentCountdown(room);
    cb?.({ ok: true, liveStatus: buildStandaloneTrainingLiveStatus(room) });
  });

  socket.on("training:standalone:status", (payload, cb) => {
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const room = getRoom(payload?.roomId || socket.roomId || "room-4x4");
    const sessionId = String(payload?.sessionId || "").trim();
    const mode = normalizeTrainingMode(payload?.type);
    if (!room || !sessionId || !mode) {
      cb?.({ ok: false, error: "invalid_training_presence" });
      return;
    }
    const player = ensureStandaloneTrainingPresence(room, socket, identity, payload);
    if (!player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    if (sessionId && mode) {
      const presenceChanged = !isStandaloneTrainingPlayer(player);
      if (presenceChanged) {
        player.standaloneTraining = {
          sessionId,
          mode,
          gridId: null,
          startedAt: Date.now(),
          durationMs: normalizeTrainingDurationMs(null),
        };
      }
      clearPlayerAfkTimer(player);
      if (presenceChanged) {
        emitPlayers(room);
        emitRoomsStats();
      }
    }
    cb?.({ ok: true, liveStatus: buildStandaloneTrainingLiveStatus(room) });
  });

  socket.on("training:standalone:stop", (payload, cb) => {
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    if (payload?.joinLive) {
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
    }
    const room = getRoom(payload?.roomId || socket.roomId || "room-4x4");
    const player =
      room?.players.get(socket.id) ||
      (payload?.joinLive
        ? ensureStandaloneTrainingPresence(room, socket, identity, payload)
        : null);
    if (!room || !player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    const wasPresenceOnly = player.trainingPresenceOnly === true;
    player.standaloneTraining = null;
    if (payload?.joinLive) {
      player.trainingPresenceOnly = false;
      socket.leave(getStandaloneTrainingObserverRoomId(room.id));
      socket.join(room.id);
      joinSocketToChatRoom(socket, room.id);
      markSocketPlayerActivity(room, socket, "join_live");
      if (!wasPresenceJoinAnnounced(room, player.installId)) {
        const team = getTeamForInstallCached(player.installId);
        pushSystemChatMessage(
          room,
          `${player.nick} ${getTeamDot(team)} a rejoint le tournoi`,
          {
            installId: player.installId,
            team,
            nick: player.nick,
            meta: { kind: "join_tournament" },
          }
        );
        markPresenceJoinAnnounced(room, player.installId);
      }
    }
    if (payload?.joinLive && isRoundActive(room.currentRound)) {
      ensurePlayerInRound(room, player.nick);
    }
    const snapshot = payload?.joinLive ? buildSessionSnapshot(room, player) : null;
    if (!payload?.joinLive && wasPresenceOnly) {
      clearPlayerAfkTimer(player);
      const readyKey = getPlayerReadyKey(player);
      if (readyKey) ensureTournamentLobby(room).readyKeys.delete(readyKey);
      room.players.delete(socket.id);
      socket.leave(getStandaloneTrainingObserverRoomId(room.id));
      socket.leave(room.id);
      clearPresenceAnnouncement(room, player.installId);
    } else if (!payload?.joinLive) {
      player.trainingPresenceOnly = false;
      socket.leave(getStandaloneTrainingObserverRoomId(room.id));
      socket.join(room.id);
      markSocketPlayerActivity(room, socket, "training_exit");
    }
    cb?.({
      ok: true,
      snapshot,
      liveStatus: buildStandaloneTrainingLiveStatus(room),
    });
    emitPlayers(room);
    emitMedals(room);
    emitRoomsStats();
    maybeStartTournamentCountdown(room);
  });
}
