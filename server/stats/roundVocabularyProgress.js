export async function recordRoundVocabularyProgress(
  { results, entries, atTs, roundId, roomId },
  { recordVocabularyBatch, computeWeeklyVocabRankMap, recordVocabCount, recordWeeklyVocabCount, logger = console }
) {
  if (!entries.length) return;
  const byNick = new Map(results.map((entry) => [entry.nick, entry]));
  let summaries;
  try {
    summaries = await recordVocabularyBatch(entries);
  } catch (error) {
    logger.warn("Vocabulary round transaction failed", { roundId, roomId }, error);
    for (const entry of entries) {
      const result = byNick.get(entry.nick);
      if (!result) continue;
      result.newVocabWords = null;
      result.newWeeklyVocabWords = null;
      result.vocabProgress = { status: "unavailable" };
    }
    return;
  }
  const beforeOverrides = [];
  const afterOverrides = [];
  for (const entry of entries) {
    const summary = summaries[entry.installId];
    const result = byNick.get(entry.nick);
    if (!summary || !result) continue;
    result.newVocabWords = summary.newWords;
    result.newWeeklyVocabWords = summary.newWeeklyWords;
    result.vocabProgress = {
      status: "recorded",
      beforeCount: summary.beforeTotal,
      afterCount: summary.total,
      weekStartTs: summary.weekStartTs,
    };
    result.vocabWeeklyRace = {
      beforeCount: summary.beforeWeeklyTotal,
      afterCount: summary.weeklyTotal,
    };
    recordVocabCount(entry.playerKey, entry.nick, summary.total, atTs);
    recordWeeklyVocabCount(entry.playerKey, entry.nick, summary.weeklyTotal, atTs);
    const rankEntry = { playerKey: entry.playerKey, nick: entry.nick, achievedAt: atTs };
    beforeOverrides.push({ ...rankEntry, weeklyVocabCount: summary.beforeWeeklyTotal });
    afterOverrides.push({ ...rankEntry, weeklyVocabCount: summary.weeklyTotal });
  }
  try {
    const beforeRanks = await computeWeeklyVocabRankMap(atTs, beforeOverrides);
    const afterRanks = await computeWeeklyVocabRankMap(atTs, afterOverrides);
    for (const entry of entries) {
      const result = byNick.get(entry.nick);
      if (!result || !summaries[entry.installId]) continue;
      const before = beforeRanks.get(entry.playerKey) || null;
      const after = afterRanks.get(entry.playerKey) || null;
      result.vocabWeeklyRank = {
        before, after,
        delta: Number.isFinite(before) && Number.isFinite(after) ? before - after : 0,
      };
    }
  } catch (error) {
    logger.warn("Vocabulary ranks unavailable", { roundId, roomId }, error);
  }
}
