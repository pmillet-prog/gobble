export function registerDisconnectHandler(
  socket,
  {
    DISCONNECT_GRACE_MS,
    MEDALS_TTL_AFTER_DISCONNECT_MS,
    clearPendingDisconnect,
    clearPlayerAfkTimer,
    clearPresenceAnnouncement,
    emitMedals,
    emitPlayers,
    emitRoomsStats,
    emitTournamentLobby,
    ensureTournamentLobby,
    getMedalKeyForPlayer,
    getPlayerReadyKey,
    getRoom,
    getTeamDot,
    getTeamForInstallCached,
    isBotToken,
    maybeStartTournamentCountdown,
    normalizeInstallId,
    persistRoomMedals,
    pushSystemChatMessage,
    wasPresenceJoinAnnounced,
  }
) {
  socket.on("disconnect", () => {
    const room = getRoom(socket.roomId);
    if (!room) return;
    const player = room.players.get(socket.id);
    const now = Date.now();
    const medalKey = getMedalKeyForPlayer(player);
    const isBot = isBotToken(player?.token);
    if (medalKey && isBot) {
      room.medals.delete(medalKey);
      room.medalExpiry.delete(medalKey);
      persistRoomMedals(room);
    }
    if (medalKey && !medalKey.startsWith("install:") && !isBot) {
      room.medalExpiry.set(medalKey, now + MEDALS_TTL_AFTER_DISCONNECT_MS);
      persistRoomMedals(room);
    }
    if (!player) return;
    clearPlayerAfkTimer(player);
    const readyKey = getPlayerReadyKey(player);
    if (readyKey) {
      ensureTournamentLobby(room).readyKeys.delete(readyKey);
    }
    player.connected = false;
    player.lastSeenAt = now;
    clearPendingDisconnect(room, socket.id);
    emitPlayers(room);
    emitTournamentLobby(room);
    emitRoomsStats();
    maybeStartTournamentCountdown(room);
    const timer = setTimeout(() => {
      clearPendingDisconnect(room, socket.id);
      const current = room.players.get(socket.id);
      if (current) {
        clearPlayerAfkTimer(current);
        room.players.delete(socket.id);
        if (!isBotToken(current?.token)) {
          const currentInstallId = normalizeInstallId(current?.installId || "");
          if (wasPresenceJoinAnnounced(room, currentInstallId)) {
            const team = getTeamForInstallCached(currentInstallId);
            pushSystemChatMessage(
              room,
              `${current?.nick || "Joueur"} ${getTeamDot(team)} a quitté le tournoi`,
              {
                installId: currentInstallId,
                team,
                nick: current?.nick || "",
                meta: { kind: "leave_tournament" },
              }
            );
            clearPresenceAnnouncement(room, currentInstallId);
          }
        }
        console.log("Client déconnecté", socket.id, current?.nick, "from", room.id);
        emitPlayers(room);
        emitMedals(room);
        emitRoomsStats();
      }
    }, DISCONNECT_GRACE_MS);
    room.pendingDisconnects.set(socket.id, {
      timer,
      installId: player.installId || null,
      nick: player.nick || "",
    });
  });
}
