export function formatWeeklyDate(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return "";
  }
}

export function formatWeeklyDayTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("fr-FR", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return "";
  }
}

export function formatMsShort(ms) {
  if (!Number.isFinite(ms)) return "";
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(2)}s`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}m${secs.toString().padStart(2, "0")}s`;
}

export function getWeeklyEntryKey(entry) {
  if (!entry) return "";
  if (entry.playerKey) return entry.playerKey;
  if (entry.nick) return `nick:${String(entry.nick).trim().toLowerCase()}`;
  return "";
}

export function getWeeklyMetricValue(boardKey, entry) {
  if (!entry) return null;
  if (boardKey === "medals") return Number(entry.total) || 0;
  if (boardKey === "mostWordsInGame") return Number(entry.wordsCount) || 0;
  if (boardKey === "totalScore") return Number(entry.totalScore) || 0;
  if (boardKey === "bestWord") return Number(entry.pts) || 0;
  if (boardKey === "longestWord") return Number(entry.len) || 0;
  if (boardKey === "bestSpecial3Score") return Number(entry.pts) || 0;
  if (boardKey === "bestRoundScore") return Number(entry.pts) || 0;
  if (boardKey === "vocab") return Number(entry.vocabCount) || 0;
  if (boardKey === "weeklyVocab") {
    return Number(entry.weeklyVocabCount ?? entry.vocabCount) || 0;
  }
  if (boardKey === "bestTimeTargetLong" || boardKey === "bestTimeTargetScore") {
    return Number.isFinite(Number(entry.ms)) ? Number(entry.ms) : null;
  }
  if (boardKey === "mostGobbles") return Number(entry.gobbles) || 0;
  return null;
}

export function hasWeeklyChanges(
  boardKey,
  currentEntries,
  baselineRankMap,
  baselineValueMap
) {
  if (!baselineRankMap || baselineRankMap.size === 0) return false;
  const isTimeBoard =
    boardKey === "bestTimeTargetLong" || boardKey === "bestTimeTargetScore";
  for (let i = 0; i < currentEntries.length; i += 1) {
    const entry = currentEntries[i];
    const entryKey = getWeeklyEntryKey(entry);
    if (!entryKey) continue;
    const prevRank = baselineRankMap.get(entryKey);
    if (Number.isFinite(prevRank) && prevRank !== i + 1) return true;
    const currentValue = getWeeklyMetricValue(boardKey, entry);
    const baseValue = baselineValueMap?.get(entryKey);
    if (Number.isFinite(currentValue) && Number.isFinite(baseValue)) {
      if (isTimeBoard && currentValue < baseValue) return true;
      if (!isTimeBoard && currentValue > baseValue) return true;
    }
  }
  return false;
}

export function createWeeklyStatsRuntimeModel(
  installIdRef,
  nicknameRef,
  weeklyStats,
) {
  function getWeeklyValue(boardKey, entry) {
    if (!entry) return null;
    switch (boardKey) {
      case "medals":
        return Number(entry.total) || 0;
      case "mostWordsInGame":
        return Number(entry.wordsCount) || 0;
      case "totalScore":
        return Number(entry.totalScore) || 0;
      case "bestWord":
        return Number(entry.pts) || 0;
      case "longestWord":
        return Number(entry.len) || 0;
      case "bestSpecial3Score":
        return Number(entry.pts) || 0;
      case "bestRoundScore":
        return Number(entry.pts) || 0;
      case "vocab":
        return Number(entry.vocabCount) || 0;
      case "weeklyVocab":
        return Number(entry.weeklyVocabCount ?? entry.vocabCount) || 0;
      case "bestTimeTargetLong":
      case "bestTimeTargetScore":
        return Number.isFinite(entry.ms) ? Number(entry.ms) : null;
      case "mostGobbles":
        return Number(entry.gobbles) || 0;
      default:
        return null;
    }
  }

  function dedupeWeeklyEntries(boardKey, entries, limit = 50) {
    if (!Array.isArray(entries)) return [];
    const installKeyByNick = new Map();
    const isVocabBoard = boardKey === "vocab" || boardKey === "weeklyVocab";
    if (isVocabBoard) {
      for (const entry of entries) {
        const playerKey = typeof entry?.playerKey === "string" ? entry.playerKey.trim() : "";
        const nickKey = entry?.nick ? String(entry.nick).trim().toLowerCase() : "";
        if (!playerKey.startsWith("install:") || !nickKey) continue;
        if (!installKeyByNick.has(nickKey)) installKeyByNick.set(nickKey, playerKey);
      }
    }
    const byPlayer = new Map();
    for (const entry of entries) {
      const nickKey = entry?.nick ? String(entry.nick).trim().toLowerCase() : null;
      const rawKey = entry?.playerKey || nickKey;
      const key =
        isVocabBoard && nickKey && (!rawKey || String(rawKey).startsWith("nick:"))
          ? installKeyByNick.get(nickKey) || rawKey
          : rawKey;
      if (!key) continue;
      const current = byPlayer.get(key);
      const value = getWeeklyValue(boardKey, entry);
      if (
        (boardKey === "totalScore" ||
          boardKey === "bestRoundScore" ||
          boardKey === "bestSpecial3Score") &&
        (!Number.isFinite(value) || value <= 0)
      ) {
        continue;
      }
      const timeBoard =
        boardKey === "bestTimeTargetLong" || boardKey === "bestTimeTargetScore";
      const achieved = Number.isFinite(entry?.achievedAt) ? entry.achievedAt : Infinity;
      const pick = () => byPlayer.set(key, entry);
      if (!current) {
        pick();
        continue;
      }
      const currentValue = getWeeklyValue(boardKey, current);
      const currentAchieved = Number.isFinite(current?.achievedAt)
        ? current.achievedAt
        : Infinity;
      if (timeBoard) {
        if (value == null) continue;
        if (currentValue == null || value < currentValue) {
          pick();
        } else if (value === currentValue && achieved < currentAchieved) {
          pick();
        }
      } else {
        if (value == null) continue;
        if (currentValue == null || value > currentValue) {
          pick();
        } else if (value === currentValue && achieved < currentAchieved) {
          pick();
        }
      }
    }

    const deduped = Array.from(byPlayer.values());
    const timeBoard =
      boardKey === "bestTimeTargetLong" || boardKey === "bestTimeTargetScore";
    deduped.sort((a, b) => {
      const va = getWeeklyValue(boardKey, a);
      const vb = getWeeklyValue(boardKey, b);
      if (timeBoard) {
        const vaOk = Number.isFinite(va);
        const vbOk = Number.isFinite(vb);
        if (vaOk && vbOk && va !== vb) return va - vb;
        if (vaOk !== vbOk) return vaOk ? -1 : 1;
      } else {
        const vaNum = Number.isFinite(va) ? va : -Infinity;
        const vbNum = Number.isFinite(vb) ? vb : -Infinity;
        if (vaNum !== vbNum) return vbNum - vaNum;
      }
      const ta = Number.isFinite(a?.achievedAt) ? a.achievedAt : Infinity;
      const tb = Number.isFinite(b?.achievedAt) ? b.achievedAt : Infinity;
      if (ta !== tb) return ta - tb;
      const na = (a?.nick || "").toLowerCase();
      const nb = (b?.nick || "").toLowerCase();
      return na.localeCompare(nb);
    });
    return deduped.slice(0, limit);
  }

  function getWeeklyVocabRankForCount(countValue, statsSource = weeklyStats) {
    const entries = statsSource?.boards?.weeklyVocab;
    if (!Array.isArray(entries) || entries.length === 0) return null;
    const currentInstallId =
      typeof installIdRef.current === "string" ? installIdRef.current.trim() : "";
    const currentSelfNick = String(nicknameRef.current || "").trim();
    const installKey = currentInstallId ? `install:${currentInstallId}` : null;
    const nickKey = currentSelfNick ? `nick:${currentSelfNick}` : null;
    const nickLower = currentSelfNick ? currentSelfNick.toLowerCase() : null;
    if (!installKey && !nickKey && !nickLower) return null;
    let replaced = false;
    const now = Date.now();
    const withOverride = entries.map((entry) => {
      if (!entry) return entry;
      const entryNick = entry.nick ? String(entry.nick).trim().toLowerCase() : null;
      const matches =
        (installKey && entry.playerKey === installKey) ||
        (nickKey && entry.playerKey === nickKey) ||
        (nickLower && entryNick === nickLower);
      if (!matches) return entry;
      replaced = true;
      return { ...entry, weeklyVocabCount: countValue, achievedAt: now };
    });
    if (!replaced) {
      withOverride.push({
        nick: currentSelfNick || "Toi",
        playerKey: installKey || nickKey,
        weeklyVocabCount: countValue,
        achievedAt: now,
      });
    }
    const weeklyLimit = statsSource?.topN || statsSource?.limits?.topN || 50;
    const ranked = dedupeWeeklyEntries("weeklyVocab", withOverride, Math.max(weeklyLimit, 200));
    const idx = ranked.findIndex((entry) => {
      if (!entry) return false;
      if (installKey && entry.playerKey === installKey) return true;
      if (nickKey && entry.playerKey === nickKey) return true;
      const entryNick = entry.nick ? String(entry.nick).trim().toLowerCase() : null;
      return !!(nickLower && entryNick && entryNick === nickLower);
    });
    return idx >= 0 ? idx + 1 : null;
  }

  function getSelfWeeklyVocabRankFromStats(statsSource = weeklyStats) {
    const entries = statsSource?.boards?.weeklyVocab;
    if (!Array.isArray(entries) || entries.length === 0) return null;
    const currentInstallId =
      typeof installIdRef.current === "string" ? installIdRef.current.trim() : "";
    const currentSelfNick = String(nicknameRef.current || "").trim();
    const installKey = currentInstallId ? `install:${currentInstallId}` : null;
    const nickKey = currentSelfNick ? `nick:${currentSelfNick}` : null;
    const nickLower = currentSelfNick ? currentSelfNick.toLowerCase() : null;
    if (!installKey && !nickKey && !nickLower) return null;
    const ranked = dedupeWeeklyEntries(
      "weeklyVocab",
      entries,
      Math.max(statsSource?.topN || statsSource?.limits?.topN || 50, 200)
    );
    const idx = ranked.findIndex((entry) => {
      if (!entry) return false;
      if (installKey && entry.playerKey === installKey) return true;
      if (nickKey && entry.playerKey === nickKey) return true;
      const entryNick = entry.nick ? String(entry.nick).trim().toLowerCase() : null;
      return !!(nickLower && entryNick && entryNick === nickLower);
    });
    return idx >= 0 ? idx + 1 : null;
  }

  function buildVocabOverlayRaceSnapshot({
    statsSource = weeklyStats,
    roundResults = null,
    weeklyBaseCount = null,
    weeklyTargetCount = null,
    rankStart = null,
    rankEnd = null,
  } = {}) {
    const baseCount = Number.isFinite(weeklyBaseCount) ? Math.max(0, weeklyBaseCount) : null;
    const targetCount = Number.isFinite(weeklyTargetCount)
      ? Math.max(0, weeklyTargetCount)
      : baseCount;
    if (!Number.isFinite(baseCount) || !Number.isFinite(targetCount)) return null;
    const entries = statsSource?.boards?.weeklyVocab;
    const currentInstallId =
      typeof installIdRef.current === "string" ? installIdRef.current.trim() : "";
    const currentSelfNick = String(nicknameRef.current || "").trim();
    const installKey = currentInstallId ? `install:${currentInstallId}` : null;
    const nickKey = currentSelfNick ? `nick:${currentSelfNick}` : null;
    const nickLower = currentSelfNick ? currentSelfNick.toLowerCase() : "";
    const selfLabel = currentSelfNick || "Toi";
    const now = Date.now();
    const withSelf = Array.isArray(entries) ? [...entries] : [];
    if (Array.isArray(roundResults)) {
      roundResults.forEach((entry) => {
        const afterCount = Number(entry?.vocabWeeklyRace?.afterCount);
        if (!Number.isFinite(afterCount) || afterCount <= 0) return;
        const nick = typeof entry?.nick === "string" && entry.nick.trim() ? entry.nick.trim() : "";
        if (!nick) return;
        const playerKey = entry?.installId
          ? `install:${entry.installId}`
          : Number.isInteger(Number(entry?.userId))
          ? `user:${Number(entry.userId)}`
          : `nick:${nick}`;
        withSelf.push({
          nick,
          playerKey,
          weeklyVocabCount: afterCount,
          achievedAt: now,
        });
      });
    }
    let replaced = false;
    const normalizedSelfEntries = withSelf.map((entry) => {
      if (!entry) return entry;
      const entryNick = entry.nick ? String(entry.nick).trim().toLowerCase() : "";
      const matches =
        (installKey && entry.playerKey === installKey) ||
        (nickKey && entry.playerKey === nickKey) ||
        (nickLower && entryNick === nickLower);
      if (!matches) return entry;
      replaced = true;
      return {
        ...entry,
        nick: entry.nick || selfLabel,
        weeklyVocabCount: targetCount,
        achievedAt: now,
      };
    });
    if (!replaced) {
      normalizedSelfEntries.push({
        nick: selfLabel,
        playerKey: installKey || nickKey || `nick:${selfLabel}`,
        weeklyVocabCount: targetCount,
        achievedAt: now,
      });
    }
    const limit = Math.max(statsSource?.topN || statsSource?.limits?.topN || 50, 200);
    const ranked = dedupeWeeklyEntries("weeklyVocab", normalizedSelfEntries, limit);
    const isSelfEntry = (entry) => {
      if (!entry) return false;
      const entryNick = entry.nick ? String(entry.nick).trim().toLowerCase() : "";
      return (
        (installKey && entry.playerKey === installKey) ||
        (nickKey && entry.playerKey === nickKey) ||
        (!!nickLower && entryNick === nickLower)
      );
    };
    const selfIdx = ranked.findIndex(isSelfEntry);
    const rankAfter = selfIdx >= 0 ? selfIdx + 1 : Number.isFinite(rankEnd) ? rankEnd : null;
    const passed = [];
    const ahead = [];
    ranked.forEach((entry, idx) => {
      if (!entry || isSelfEntry(entry)) return;
      const count = Number(entry.weeklyVocabCount ?? entry.vocabCount ?? entry.count);
      if (!Number.isFinite(count) || count <= 0) return;
      const item = {
        nick: entry.nick || "?",
        count,
        rank: idx + 1,
        playerKey: entry.playerKey || null,
      };
      if (count > baseCount && count <= targetCount) {
        passed.push(item);
      } else if (count > targetCount) {
        ahead.push({ ...item, gap: count - targetCount });
      }
    });
    passed.sort((a, b) => a.count - b.count || a.rank - b.rank);
    ahead.sort((a, b) => a.gap - b.gap || a.rank - b.rank);
    const nextAhead = ahead[0] || null;
    const selected = [
      ...passed.slice(Math.max(0, passed.length - 6)),
      ...(nextAhead ? [nextAhead] : []),
    ];
    const maxCount = Math.max(
      baseCount + 1,
      nextAhead ? nextAhead.count : targetCount
    );
    return {
      min: baseCount,
      max: maxCount,
      baseCount,
      targetCount,
      rankStart: Number.isFinite(rankStart) ? rankStart : null,
      rankEnd: Number.isFinite(rankAfter) ? rankAfter : Number.isFinite(rankEnd) ? rankEnd : null,
      nextAhead,
      competitors: selected.map((entry) => ({
        nick: entry.nick,
        count: entry.count,
        rank: entry.rank,
        playerKey: entry.playerKey || null,
        clipped: false,
        status: entry.count <= targetCount ? "passed" : "ahead",
      })),
    };
  }

  return {
    buildVocabOverlayRaceSnapshot,
    dedupeWeeklyEntries,
    getSelfWeeklyVocabRankFromStats,
    getWeeklyVocabRankForCount,
  };
}
