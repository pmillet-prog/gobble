function normalizeInstallIdFromPlayerKey(raw) {
  const key = String(raw || "").trim();
  return key.startsWith("install:") ? key.slice("install:".length).trim() : "";
}

function normalizeWord(raw) {
  return String(raw || "").trim().slice(0, 40);
}

function finiteInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
}

function collectBoardEntries(board) {
  return board && typeof board === "object" && !Array.isArray(board)
    ? Object.entries(board)
    : [];
}

function getWeekObjects(payload) {
  const weeks = [];
  const history = payload?.history && typeof payload.history === "object" ? payload.history : {};
  for (const week of Object.values(history)) {
    if (week && typeof week === "object") weeks.push(week);
  }
  if (payload && typeof payload === "object") weeks.push(payload);
  return weeks;
}

function shouldReplaceScored(current, candidate) {
  if (!candidate) return false;
  if (!current) return true;
  const scoreDiff = finiteInt(candidate.pts) - finiteInt(current.pts);
  if (scoreDiff !== 0) return scoreDiff > 0;
  return finiteInt(candidate.achievedAt) < finiteInt(current.achievedAt);
}

export function buildRestoredWeeklyScoreStats(current, snapshot, cutoffAt = 0) {
  const currentWeekStartTs = finiteInt(current?.weekStartTs);
  const snapshotWeekStartTs = finiteInt(snapshot?.weekStartTs);
  const safeCutoffAt = finiteInt(cutoffAt);
  if (!currentWeekStartTs || !snapshotWeekStartTs || !safeCutoffAt) {
    throw new Error("Current week, snapshot week and cutoff are required for the rollback");
  }
  const restored = {
    ...current,
    history:
      current?.history && typeof current.history === "object" ? { ...current.history } : {},
  };
  const snapshotBoards = {
    bestWord:
      snapshot?.bestWord && typeof snapshot.bestWord === "object" ? snapshot.bestWord : {},
    bestRoundScore:
      snapshot?.bestRoundScore && typeof snapshot.bestRoundScore === "object"
        ? snapshot.bestRoundScore
        : {},
  };
  let snapshotWeekFound = false;

  if (currentWeekStartTs === snapshotWeekStartTs) {
    Object.assign(restored, snapshotBoards);
    snapshotWeekFound = true;
  } else if (restored.history[String(snapshotWeekStartTs)]) {
    restored.history[String(snapshotWeekStartTs)] = {
      ...restored.history[String(snapshotWeekStartTs)],
      ...snapshotBoards,
    };
    snapshotWeekFound = true;
  }
  if (!snapshotWeekFound) {
    throw new Error(
      `Weekly snapshot week ${snapshotWeekStartTs} is absent from current stats ${currentWeekStartTs}`
    );
  }

  if (currentWeekStartTs > snapshotWeekStartTs) {
    restored.bestWord = {};
    restored.bestRoundScore = {};
  }
  for (const [weekKey, week] of Object.entries(restored.history)) {
    if (finiteInt(week?.weekStartTs || weekKey) <= snapshotWeekStartTs) continue;
    restored.history[weekKey] = {
      ...week,
      bestWord: {},
      bestRoundScore: {},
    };
  }
  return restored;
}

export function collectLifetimeScoreRecords(weeklyStats) {
  const byInstallId = new Map();
  for (const week of getWeekObjects(weeklyStats)) {
    for (const [entryKey, entry] of collectBoardEntries(week.bestWord)) {
      if (!entry || typeof entry !== "object") continue;
      const installId = normalizeInstallIdFromPlayerKey(entry.playerKey || entryKey);
      const word = normalizeWord(entry.word);
      const pts = finiteInt(entry.pts);
      if (!installId || !word || pts <= 0) continue;
      const records = byInstallId.get(installId) || {};
      const candidate = { word, pts, achievedAt: finiteInt(entry.achievedAt) };
      if (shouldReplaceScored(records.bestWord, candidate)) records.bestWord = candidate;
      byInstallId.set(installId, records);
    }

    for (const [entryKey, entry] of collectBoardEntries(week.bestRoundScore)) {
      if (!entry || typeof entry !== "object") continue;
      const installId = normalizeInstallIdFromPlayerKey(entry.playerKey || entryKey);
      const pts = finiteInt(entry.pts);
      if (!installId || pts <= 0) continue;
      const records = byInstallId.get(installId) || {};
      const candidate = {
        pts,
        roundId: String(entry.roundId || "").slice(0, 120),
        achievedAt: finiteInt(entry.achievedAt),
      };
      if (shouldReplaceScored(records.bestRoundScore, candidate)) {
        records.bestRoundScore = candidate;
      }
      byInstallId.set(installId, records);
    }
  }
  return byInstallId;
}

function collectPostCutoffBestWords(currentWeeklyStats, cutoffAt) {
  const byInstallId = new Map();
  for (const week of getWeekObjects(currentWeeklyStats)) {
    for (const [entryKey, entry] of collectBoardEntries(week?.bestWord)) {
      if (!entry || typeof entry !== "object") continue;
      const installId = normalizeInstallIdFromPlayerKey(entry.playerKey || entryKey);
      if (!installId || finiteInt(entry.achievedAt) < cutoffAt) continue;
      const candidate = {
        word: normalizeWord(entry.word),
        pts: finiteInt(entry.pts),
        achievedAt: finiteInt(entry.achievedAt),
      };
      const current = byInstallId.get(installId);
      if (shouldReplaceScored(current, candidate)) byInstallId.set(installId, candidate);
    }
  }
  return byInstallId;
}

export function getRoundStartedAt(roundId) {
  const match = String(roundId || "").match(/(?:^|#)(\d{12,})$/);
  return match ? finiteInt(match[1]) : 0;
}

export function buildLifetimeScoreRollbackChanges({
  rows,
  currentWeeklyStats,
  restoredWeeklyStats,
  cutoffAt,
}) {
  const safeCutoffAt = finiteInt(cutoffAt);
  if (!safeCutoffAt) throw new Error("A positive rollback cutoff is required");
  const validRecords = collectLifetimeScoreRecords(restoredWeeklyStats);
  const postCutoffBestWords = collectPostCutoffBestWords(currentWeeklyStats, safeCutoffAt);
  const changes = [];

  for (const row of rows || []) {
    const installId = String(row?.installId || "").trim();
    if (!installId) continue;
    const current = {
      bestWord: normalizeWord(row.bestWord),
      bestWordScore: finiteInt(row.bestWordScore),
      bestRoundScore: finiteInt(row.bestRoundScore),
      bestRoundId: String(row.bestRoundId || "").slice(0, 120),
    };
    const postCutoffBestWord = postCutoffBestWords.get(installId);
    const rollbackBestWord =
      !!postCutoffBestWord &&
      postCutoffBestWord.word === current.bestWord &&
      current.bestWordScore > 0;
    const rollbackBestRoundScore = getRoundStartedAt(current.bestRoundId) >= safeCutoffAt;
    if (!rollbackBestWord && !rollbackBestRoundScore) continue;

    const valid = validRecords.get(installId) || {};
    const next = { ...current };
    if (rollbackBestWord) {
      next.bestWord = valid.bestWord?.word || "";
      next.bestWordScore = finiteInt(valid.bestWord?.pts);
    }
    if (rollbackBestRoundScore) {
      next.bestRoundScore = finiteInt(valid.bestRoundScore?.pts);
      next.bestRoundId = String(valid.bestRoundScore?.roundId || "").slice(0, 120);
    }
    changes.push({
      installId,
      rollbackBestWord,
      rollbackBestRoundScore,
      current,
      next,
    });
  }
  return changes;
}

export function countChangedBoardEntries(currentBoard, restoredBoard) {
  const keys = new Set([
    ...Object.keys(currentBoard || {}),
    ...Object.keys(restoredBoard || {}),
  ]);
  let changed = 0;
  for (const key of keys) {
    if (JSON.stringify(currentBoard?.[key] || null) !== JSON.stringify(restoredBoard?.[key] || null)) {
      changed += 1;
    }
  }
  return changed;
}
