export function registerSessionUtilityHandlers(
  socket,
  {
    addPlaytimeUsage,
    getPlaytimeLimitStatus,
    now = Date.now,
    requireSocketPlayerIdentity,
    setPlaytimeLimit,
  }
) {
  socket.on("timeSync", (_payload, cb) => {
    cb?.({ ok: true, serverNow: now() });
  });

  socket.on("playtimeLimit:status", (_payload, cb) => {
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    cb?.({ ok: true, playtimeLimit: getPlaytimeLimitStatus(identity.userId) });
  });

  socket.on("playtimeLimit:set", (payload, cb) => {
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const limitMs = Math.round(Number(payload?.limitMs) || 0);
    const username =
      identity.user?.usernameDisplay ||
      identity.user?.usernameNormalized ||
      socket.data?.nick ||
      "";
    const result = setPlaytimeLimit({ userId: identity.userId, username, limitMs });
    cb?.(
      result.ok
        ? { ok: true, playtimeLimit: result.status }
        : {
            ok: false,
            error: result.error || "playtime_limit_failed",
            playtimeLimit: getPlaytimeLimitStatus(identity.userId),
          }
    );
  });

  socket.on("playtimeLimit:usage", (payload, cb) => {
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const requestedDeltaMs = Math.max(0, Math.round(Number(payload?.deltaMs) || 0));
    const deltaMs = Math.min(5 * 60 * 1000, requestedDeltaMs);
    socket.data.playtimeUsageLastAt = now();
    const username =
      identity.user?.usernameDisplay ||
      identity.user?.usernameNormalized ||
      socket.data?.nick ||
      "";
    const result = addPlaytimeUsage({ userId: identity.userId, username, deltaMs });
    cb?.({
      ok: result.ok !== false,
      playtimeLimit: result.status || getPlaytimeLimitStatus(identity.userId),
    });
  });
}
