export function registerDevHandlers(
  socket,
  {
    applyDevSelfRewardTargetPatch,
    applyMaintenanceModeChange,
    areDevToolsAllowedForSocket,
    botManager,
    broadcastCrownUpdate,
    buildDevControlsPayload,
    clearDevChat,
    clearPlaytimeLimit,
    devControlsState,
    emitMedals,
    ensureDevSelfRewardTarget,
    fillDevChat,
    getRoom,
    getSocketDevAccount,
    getTargetWaitDevCatalog,
    io,
    listActivePlaytimeLimits,
    normalizeDevControls,
    persistDevControls,
    requireDevToolsAccess,
    returnRoomToLiveLobby,
    rooms,
    sanitizeDevGlobalAnnouncement,
  }
) {
  let devControls = devControlsState.get();
  socket.on("dev:controls:get", (_payload, cb) => {
    if (!areDevToolsAllowedForSocket(socket)) {
      cb?.({ ok: false, error: "dev_tools_unavailable", ...buildDevControlsPayload(socket) });
      return;
    }
    let targetChanged = false;
    targetChanged = ensureDevSelfRewardTarget(devControls, "selfCrown", socket) || targetChanged;
    targetChanged = ensureDevSelfRewardTarget(devControls, "selfGoldNick", socket) || targetChanged;
    targetChanged = ensureDevSelfRewardTarget(devControls, "selfSilverNick", socket) || targetChanged;
    targetChanged = ensureDevSelfRewardTarget(devControls, "selfBronzeNick", socket) || targetChanged;
    if (targetChanged) {
      persistDevControls();
      broadcastCrownUpdate();
    }
    cb?.({ ok: true, ...buildDevControlsPayload(socket) });
  });

  socket.on("dev:unlock", (payload, cb) => {
    if (!areDevToolsAllowedForSocket(socket)) {
      cb?.({ ok: false, error: "dev_tools_unavailable", ...buildDevControlsPayload(socket) });
      return;
    }
    socket.data.devToolsUnlocked = true;
    cb?.({ ok: true, ...buildDevControlsPayload(socket) });
  });

  socket.on("dev:lock", (_payload, cb) => {
    socket.data.devToolsUnlocked = true;
    cb?.({ ok: true, ...buildDevControlsPayload(socket) });
  });

  socket.on("dev:targetWait:catalog", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    try {
      const catalog = getTargetWaitDevCatalog({ limit: payload?.limit });
      cb?.({ ok: true, ...catalog });
    } catch (error) {
      console.warn("[target-wait] catalogue dev indisponible", error?.message || error);
      cb?.({ ok: false, error: "target_wait_catalog_unavailable" });
    }
  });

  socket.on("dev:controls:set", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const previous = normalizeDevControls(devControls);
    devControls = normalizeDevControls({ ...previous, ...(payload || {}) });
    devControlsState.set(devControls);
    applyDevSelfRewardTargetPatch(previous, devControls, payload, socket);
    persistDevControls();
    applyMaintenanceModeChange(previous, devControls);
    if (previous.botsEnabled !== devControls.botsEnabled) {
      botManager?.setBotsEnabled?.(devControls.botsEnabled);
    }
    if (previous.animatorBotsEnabled !== devControls.animatorBotsEnabled) {
      botManager?.setAnimatorBotsEnabled?.(devControls.animatorBotsEnabled);
    }
    for (const room of rooms.values()) {
      room.nextPreparedGrid = null;
      room.nextPreparedGridPromise = null;
      room.nextPreparedGridPromiseRoundNumber = null;
      room.bufferedPreparedGrid = null;
      room.bufferedPreparedGridPromise = null;
      room.bufferedPreparedGridPromiseMeta = null;
      room.devForcedRoundPickCache = new Map();
      if (!previous.chatFill && devControls.chatFill) {
        fillDevChat(room, 80);
      } else if (previous.chatFill && !devControls.chatFill) {
        clearDevChat(room);
      }
      emitMedals(room);
    }
    if (
      previous.selfCrown !== devControls.selfCrown ||
      previous.selfGoldNick !== devControls.selfGoldNick ||
      previous.selfSilverNick !== devControls.selfSilverNick ||
      previous.selfBronzeNick !== devControls.selfBronzeNick ||
      previous.selfCrownTargetUserId !== devControls.selfCrownTargetUserId ||
      previous.selfCrownTargetInstallId !== devControls.selfCrownTargetInstallId ||
      previous.selfCrownTargetNick !== devControls.selfCrownTargetNick ||
      previous.selfGoldNickTargetUserId !== devControls.selfGoldNickTargetUserId ||
      previous.selfGoldNickTargetInstallId !== devControls.selfGoldNickTargetInstallId ||
      previous.selfGoldNickTargetNick !== devControls.selfGoldNickTargetNick ||
      previous.selfSilverNickTargetUserId !== devControls.selfSilverNickTargetUserId ||
      previous.selfSilverNickTargetInstallId !== devControls.selfSilverNickTargetInstallId ||
      previous.selfSilverNickTargetNick !== devControls.selfSilverNickTargetNick ||
      previous.selfBronzeNickTargetUserId !== devControls.selfBronzeNickTargetUserId ||
      previous.selfBronzeNickTargetInstallId !== devControls.selfBronzeNickTargetInstallId ||
      previous.selfBronzeNickTargetNick !== devControls.selfBronzeNickTargetNick
    ) {
      broadcastCrownUpdate();
    }
    cb?.({ ok: true, ...buildDevControlsPayload(socket) });
  });

  socket.on("dev:returnToLiveLobby", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room", ...buildDevControlsPayload(socket) });
      return;
    }
    const interrupted = returnRoomToLiveLobby(room, "dev_button");
    cb?.({ ok: true, interrupted, ...buildDevControlsPayload(socket) });
  });

  socket.on("dev:chat:fill", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const count = fillDevChat(room, payload?.count || 80);
    cb?.({ ok: true, count });
  });

  socket.on("dev:chat:clear", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const count = clearDevChat(room);
    cb?.({ ok: true, count });
  });

  socket.on("dev:globalAnnouncement", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const body = sanitizeDevGlobalAnnouncement(payload?.message || payload?.body || "");
    if (!body) {
      cb?.({ ok: false, error: "empty_message" });
      return;
    }
    const account = getSocketDevAccount(socket);
    const createdAt = Date.now();
    const message = {
      id: `dev-global-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
      title: "Annonce serveur",
      body,
      createdAt,
      author: account?.label || socket.data?.nick || "",
    };
    io.emit("dev:globalAnnouncement", message);
    console.log(
      `[dev] global announcement by ${message.author || "unknown"}: ${body.slice(0, 140)}`
    );
    cb?.({ ok: true, message, ...buildDevControlsPayload(socket) });
  });

  socket.on("dev:playtimeLimits:list", (_payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    cb?.({ ok: true, limits: listActivePlaytimeLimits() });
  });

  socket.on("dev:playtimeLimits:clear", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const userId = Number(payload?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      cb?.({ ok: false, error: "invalid_user", limits: listActivePlaytimeLimits() });
      return;
    }
    const result = clearPlaytimeLimit(userId);
    cb?.({
      ok: result.ok,
      removed: !!result.removed,
      limits: listActivePlaytimeLimits(),
    });
  });

  socket.on("dev:bots:list", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    cb?.({
      ok: true,
      roomId: room.id,
      bots:
        typeof botManager?.listBotsForRoom === "function"
          ? botManager.listBotsForRoom(room)
          : [],
    });
  });

  socket.on("dev:bots:set", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const nick = typeof payload?.nick === "string" ? payload.nick.trim() : "";
    const active = !!payload?.active;
    const duration = typeof payload?.duration === "string" ? payload.duration : "rounds:3";
    const result =
      typeof botManager?.setBotActive === "function"
        ? botManager.setBotActive(room, nick, active, duration)
        : { ok: false, error: "bots_unavailable" };
    cb?.({
      ...result,
      roomId: room.id,
      bots:
        typeof botManager?.listBotsForRoom === "function"
          ? botManager.listBotsForRoom(room)
          : [],
    });
  });

  socket.on("dev:bots:setAll", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const active = payload?.active !== false;
    const result =
      typeof botManager?.setAllBotsActive === "function"
        ? botManager.setAllBotsActive(room, active, "manual")
        : { ok: false, error: "bots_unavailable" };
    cb?.({
      ...result,
      roomId: room.id,
      bots:
        typeof botManager?.listBotsForRoom === "function"
          ? botManager.listBotsForRoom(room)
          : [],
    });
  });
}
