export function registerSubmissionHandlers(
  socket,
  {
    broadcastProvisionalRanking,
    bumpRoomPerfCounter,
    getRoom,
    isStandaloneTrainingPlayer,
    logger = console,
    markSocketPlayerActivity,
    maybeAnnounceCloseFight,
    normalizeWord,
    now = Date.now,
    perfSubmitBatchWarnMs = 140,
    submitWordForNick,
  }
) {
  socket.on("submitWord", ({ roundId, word, path, traceStartedAt = null }, cb) => {
    const room = getRoom(socket.roomId);
    const player = room?.players.get(socket.id);
    if (!room || !player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    if (isStandaloneTrainingPlayer(player)) {
      cb?.({ ok: false, error: "standalone_training" });
      return;
    }
    markSocketPlayerActivity(room, socket, "submit_word");
    const result = submitWordForNick(room, {
      roundId,
      word,
      path,
      nick: player?.nick,
      traceStartedAt,
    });
    cb?.(result);
  });

  socket.on("submitWordsBatch", (payload, cb) => {
    const batchStartedAt = now();
    const clientSeq = Number.isFinite(payload?.clientSeq) ? payload.clientSeq : null;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const room = getRoom(socket.roomId);
    const player = room?.players.get(socket.id);
    const roundId = payload?.roundId || null;

    if (!room || !player) {
      cb?.({ ok: false, error: "not_logged_in", clientSeq, results: [] });
      return;
    }
    if (isStandaloneTrainingPlayer(player)) {
      cb?.({ ok: false, error: "standalone_training", clientSeq, results: [] });
      return;
    }
    markSocketPlayerActivity(room, socket, "submit_words_batch");
    if (!roundId || items.length === 0) {
      cb?.({ ok: false, error: "invalid_payload", clientSeq, results: [] });
      return;
    }

    const results = [];
    let acceptedCount = 0;
    for (const item of items) {
      const rawWord = typeof item?.word === "string" ? item.word : "";
      if (!rawWord) {
        results.push({ word: "", ok: false, error: "empty_word" });
        continue;
      }
      const result = submitWordForNick(room, {
        roundId,
        word: rawWord,
        path: item?.path,
        nick: player.nick,
        traceStartedAt: item?.traceStartedAt,
        deferRankingBroadcast: true,
      });
      if (result?.ok) acceptedCount += 1;
      const normalized = normalizeWord(rawWord) || rawWord;
      results.push({
        word: normalized,
        ...result,
        points:
          Number.isFinite(result?.points) || Number.isFinite(result?.wordScore)
            ? result?.points ?? result?.wordScore
            : undefined,
        totalScore:
          Number.isFinite(result?.totalScore) || Number.isFinite(result?.score)
            ? result?.totalScore ?? result?.score
            : undefined,
      });
    }
    if (acceptedCount > 0) {
      bumpRoomPerfCounter(room, "batchWords", acceptedCount);
      maybeAnnounceCloseFight(room);
      broadcastProvisionalRanking(room);
    }
    const batchElapsed = now() - batchStartedAt;
    if (batchElapsed > perfSubmitBatchWarnMs) {
      logger.warn(
        `[perf:${room.id}] submitWordsBatch ${batchElapsed}ms items=${items.length} accepted=${acceptedCount}`
      );
    }

    cb?.({ ok: true, clientSeq, results });
  });
}
