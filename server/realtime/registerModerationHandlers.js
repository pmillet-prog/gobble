export function registerModerationHandlers(
  socket,
  {
    MODERATION_BAN_5_MIN_MS,
    appendModerationLog,
    buildModerationPayload,
    findModerationTarget,
    getClientIpFromSocket,
    getRoom,
    getSocketPlayerIdentity,
    listModerationPlayers,
    moderationInstallBans,
    moderationUserBans,
    normalizeInstallId,
    removeSocketPlayerFromRoom,
    requireModerationAccess,
  }
) {
  socket.on("moderation:state", (payload, cb) => {
    const account = requireModerationAccess(socket, cb);
    if (!account) return;
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room", ...buildModerationPayload(socket) });
      return;
    }
    cb?.({
      ok: true,
      ...buildModerationPayload(socket),
      roomId: room.id,
      players: listModerationPlayers(room),
    });
  });

  socket.on("moderation:action", (payload, cb) => {
    const moderator = requireModerationAccess(socket, cb);
    if (!moderator) return;
    const action = typeof payload?.action === "string" ? payload.action.trim() : "";
    if (action !== "kick" && action !== "ban_5m") {
      cb?.({ ok: false, error: "invalid_action", ...buildModerationPayload(socket) });
      return;
    }
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room", ...buildModerationPayload(socket) });
      return;
    }
    const target = findModerationTarget(room, payload || {});
    if (!target?.player) {
      cb?.({
        ok: false,
        error: "target_not_found",
        ...buildModerationPayload(socket),
        players: listModerationPlayers(room),
      });
      return;
    }
    const moderatorIdentity = getSocketPlayerIdentity(socket);
    const targetUserId = Number.isInteger(Number(target.player?.userId))
      ? Number(target.player.userId)
      : null;
    const targetInstallId = normalizeInstallId(target.player?.installId || "");
    if (
      (targetUserId && Number(moderatorIdentity?.userId) === targetUserId) ||
      (targetInstallId && normalizeInstallId(moderatorIdentity?.installId || "") === targetInstallId)
    ) {
      cb?.({ ok: false, error: "cannot_target_self", ...buildModerationPayload(socket) });
      return;
    }
    const now = Date.now();
    const until = action === "ban_5m" ? now + MODERATION_BAN_5_MIN_MS : null;
    if (until) {
      if (targetInstallId) {
        moderationInstallBans.set(targetInstallId, {
          expiresAt: until,
          action,
          moderator: moderator.label || "",
          targetNick: target.player.nick || "",
        });
      }
      if (targetUserId) {
        moderationUserBans.set(String(targetUserId), {
          expiresAt: until,
          action,
          moderator: moderator.label || "",
          targetNick: target.player.nick || "",
        });
      }
    }
    const message =
      action === "ban_5m"
        ? "Tu as été exclu du live pendant 5 minutes par modération."
        : "Tu as été retiré du live par modération.";
    const notice = {
      action,
      roomId: room.id,
      message,
      until,
      durationMs: until ? MODERATION_BAN_5_MIN_MS : null,
      targetNick: target.player.nick || "",
    };
    appendModerationLog({
      t: now,
      roomId: room.id,
      action,
      moderatorUserId: moderator.userId || null,
      moderator: moderator.label || "",
      targetSocketId: target.socketId,
      targetUserId,
      targetInstallId,
      targetNick: target.player.nick || "",
      until,
      ip: getClientIpFromSocket(socket),
    });
    removeSocketPlayerFromRoom(room, target.socketId, notice);
    cb?.({
      ok: true,
      ...buildModerationPayload(socket),
      roomId: room.id,
      action,
      targetNick: target.player.nick || "",
      until,
      players: listModerationPlayers(room),
    });
  });
}
