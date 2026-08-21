export function registerPlayerProgressHandlers(
  socket,
  {
    ensureUserIdentityMigration,
    getTrophyStatus,
    getVocabularyCountForInstallIds,
    getWeeklyVocabularyCountForInstallIds,
    listIdentityInstallIds,
    requireSocketPlayerIdentity,
    runDailyStartFlow,
    runDailySubmitFlow,
    sanitizeDailyMode,
    sanitizeDailyNick,
  }
) {
  socket.on("getVocabCount", async (payload, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const installId = identity.installId;
    if (!installId) {
      cb?.({ count: 0 });
      return;
    }
    try {
      await ensureUserIdentityMigration(identity.user);
      const installIds = await listIdentityInstallIds({
        userId: identity.userId,
        currentInstallId: installId,
        primaryInstallId: identity.user?.primaryInstallId,
      });
      const count = await getVocabularyCountForInstallIds(
        installIds.length ? installIds : [installId]
      );
      const weeklyCount = await getWeeklyVocabularyCountForInstallIds(
        installIds.length ? installIds : [installId]
      );
      cb?.({ count, weeklyCount });
    } catch (err) {
      console.warn("getVocabCount failed", err);
      cb?.({ count: 0 });
    }
  });

  socket.on("getTrophyStatus", async (payload, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const installId = identity.installId;
    if (!installId) {
      cb?.({ ok: false, status: null });
      return;
    }
    try {
      const status = await getTrophyStatus(installId);
      cb?.({ ok: true, status });
    } catch (err) {
      console.warn("getTrophyStatus failed", err);
      cb?.({ ok: false, status: null });
    }
  });

  socket.on("daily:start", async (payload, cb) => {
    try {
      const identity = requireSocketPlayerIdentity(socket, cb);
      if (!identity) return;
      const installId = identity.installId;
      const pseudo = sanitizeDailyNick(payload?.pseudo || socket.data?.nick || "");
      const dailyMode = sanitizeDailyMode(payload?.dailyMode);
      if (!installId || !pseudo) {
        cb?.({ ok: false, error: "bad_request" });
        return;
      }
      const result = await runDailyStartFlow({ installId, pseudo, dailyMode });
      if (!result || typeof result !== "object") {
        cb?.({ ok: false, error: "internal" });
        return;
      }
      cb?.(result);
    } catch (err) {
      console.warn("daily:start socket failed", err);
      cb?.({ ok: false, error: "internal" });
    }
  });

  socket.on("daily:submit", async (payload, cb) => {
    try {
      const identity = requireSocketPlayerIdentity(socket, cb);
      if (!identity) return;
      const installId = identity.installId;
      const pseudo = sanitizeDailyNick(payload?.pseudo || socket.data?.nick || "");
      const dailyMode = sanitizeDailyMode(payload?.dailyMode);
      if (!installId || !pseudo) {
        cb?.({ ok: false, error: "bad_request" });
        return;
      }
      const result = await runDailySubmitFlow({
        dateId: typeof payload?.dateId === "string" ? payload.dateId : null,
        installId,
        pseudo,
        foundWords: payload?.foundWords,
        wordSubmissions: payload?.wordSubmissions,
        specialPlacements: payload?.specialPlacements,
        dailyMode,
        durationMs: payload?.durationMs,
      });
      if (!result || typeof result !== "object") {
        cb?.({ ok: false, error: "internal" });
        return;
      }
      cb?.(result);
    } catch (err) {
      console.warn("daily:submit socket failed", err);
      cb?.({ ok: false, error: "internal" });
    }
  });
}
