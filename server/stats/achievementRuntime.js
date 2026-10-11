import { isScoreRecordEligibleRound } from "./roundRecordPolicy.js";
import { getTrophyRewards } from "../../shared/trophyCatalog.js";

const userIdOf = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const roundKey = room => `${room.id}#${room.currentRound.id}`;
const wordText = value => String(typeof value === "string" ? value : value?.word || "").normalize("NFC").toUpperCase();

export function achievementWordEvents({ key, words = [], wordsCount = 0, score = 0, eligible = true, threeWords = false }) {
  const events = [];
  for (const value of words) {
    const word = wordText(value), length = Array.from(word).length;
    if (length === 16 || length === 17) events.push({ id: `word_${length}`, eventKey: `${key}:word:${word}` });
  }
  if (wordsCount >= 100) events.push({ id: "volume_100", eventKey: key });
  if (eligible) for (const reward of getTrophyRewards("round_5000")) {
    if (score >= reward.threshold) events.push({ id: reward.id, eventKey: key });
  }
  if (threeWords && score >= 1000) events.push({ id: "three_words_1000", eventKey: key });
  return events;
}

// Owns only achievement work. Existing round clocks, deferred statistics writes
// and result animations keep their timing. Durable receipts feed the UI.
export function createAchievementRuntime({ persistence, getIo, getWeeklyPodiums, onError = console.warn }) {
  const tasks = new WeakMap();
  const submitted = new WeakMap();
  let weeklyPeriod = null, weeklyTask = Promise.resolve();
  function publish(awards = []) {
    for (const award of awards) for (const client of getIo().sockets.sockets.values()) {
      if (Number(client.data?.authUser?.id) === award.userId) client.emit("achievement:earned", award);
    }
  }
  function track(round, promise) {
    let pending = tasks.get(round);
    if (!pending) { pending = new Set(); tasks.set(round, pending); }
    const guarded = promise.catch(error => { onError("Achievement persistence failed", error); throw error; });
    pending.add(guarded);
    // Attach a rejection handler immediately; finalization still sees the error.
    guarded.catch(() => {});
    return guarded;
  }
  async function record(userId, events, room, progress = null) {
    const round = room.currentRound;
    const startedAt = round.startsAt ?? (round.endsAt - (round.durationMs || room.config?.durationMs || 0));
    const awards = await persistence.achievementCollection({ action: "record", userId, events,
      progress, roundId: roundKey(room),
      ...(events.length && Number.isFinite(startedAt) ? { sourceStartedAt: startedAt } : {}) });
    // Mini-tournament medals intentionally arrive at the delayed podium. Keep
    // that round's reconnect snapshot current without replaying roundEnded.
    const previous = room.lastRoundResults?.payload;
    for (const award of awards) {
      if (String(previous?.roundId) !== String(award.roundId)) continue;
      const entry = previous?.results?.find(result => Number(result.userId) === award.userId);
      if (entry && !entry.achievementAwards?.some(item => item.eventId === award.eventId)) {
        entry.achievementAwards = [...(entry.achievementAwards || []), award];
      }
    }
    publish(awards);
    return awards;
  }
  function word({ room, userId, words, wordsCount, score }) {
    const id = userIdOf(userId);
    if (!id) return;
    let seen = submitted.get(room.currentRound);
    if (!seen) { seen = new Set(); submitted.set(room.currentRound, seen); }
    const isTarget = ["target_long", "target_score"].includes(room.currentRound.special?.type);
    const events = achievementWordEvents({ key: roundKey(room), words, wordsCount, score: isTarget ? 0 : score,
      eligible: isScoreRecordEligibleRound(room.currentRound) }).filter(event => {
      const eventId = `${id}:${event.id}:${event.eventKey}`;
      if (seen.has(eventId)) return false;
      seen.add(eventId);
      return true;
    });
    if (events.length) track(room.currentRound, record(id, events, room)).catch(() => {
      for (const event of events) seen.delete(`${id}:${event.id}:${event.eventKey}`);
    });
  }
  function target({ room, userId, elapsed }) {
    const id = userIdOf(userId);
    if (!id || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 2000) return;
    track(room.currentRound, record(id, [{ id: "target_under_2s", eventKey: roundKey(room) }], room));
  }
  function medal({ room, userId, type, tournamentKey }) {
    const id = userIdOf(userId);
    if (id && room.currentRound && tournamentKey && ["gold", "silver", "bronze"].includes(type)) {
      return track(room.currentRound, record(id, [], room, {
        eventKey: `medal:${tournamentKey}:${type}`, changes: { medals: 1, gold: type === "gold" ? 1 : 0 },
      }));
    }
  }
  async function settleRound(room, results) {
    const round = room.currentRound, key = roundKey(room);
    for (const entry of results) {
      const userId = userIdOf(entry.userId);
      if (!userId || entry.isBot || !entry.participated) continue;
      const words = new Set((Array.isArray(entry.words) ? entry.words : []).map(wordText).filter(Boolean));
      if (round.special?.type === "ocid" && entry.ocid?.validProposal === true) {
        const proposal = wordText(entry.ocid.proposal);
        if (proposal) words.add(proposal);
      }
      const events = achievementWordEvents({ key, words, wordsCount: words.size,
        score: entry.score, eligible: isScoreRecordEligibleRound(round), threeWords: round.special?.type === "self_specials_3_words" });
      const isTarget = ["target_long", "target_score"].includes(round.special?.type);
      const foundTarget = isTarget && round.targetFoundAt?.has(entry.nick);
      if (isTarget) {
        const foundAt = round.targetFoundAt?.get(entry.nick);
        const elapsed = foundAt - (round.endsAt - (round.durationMs || room.config?.durationMs || 0));
        if (Number.isFinite(foundAt) && elapsed >= 0 && elapsed < 2000) events.push({ id: "target_under_2s", eventKey: key });
      }
      const gobbles = Math.max(0, Math.trunc(Number(round.gobbles?.get(entry.nick)) || 0));
      // The game credits a double gobble as two units; its round stat stores
      // one double occurrence. Neither unit belongs to the singles trophy.
      const doubles = gobbles >= 2 ? 1 : 0;
      track(round, record(userId, events, room, {
        eventKey: `round:${key}`,
        startedAt: round.startsAt ?? (round.endsAt - (round.durationMs || room.config?.durationMs || 0)),
        changes: { rounds: 1, words: words.size,
          score: isTarget ? (foundTarget ? 1000 : 0) : Math.max(0, Math.trunc(Number(entry.score) || 0)),
          targets: foundTarget ? 1 : 0, singleGobbles: Math.max(0, gobbles - doubles * 2), doubleGobbles: doubles },
      }));
    }
    await Promise.allSettled(tasks.get(round) || []);
    tasks.delete(round);
    submitted.delete(round);
    const awards = await persistence.achievementCollection({ action: "round", roundId: key });
    for (const entry of results) entry.achievementAwards = awards.filter(award => award.userId === Number(entry.userId));
  }
  async function profile(userId) {
    await weeklyTask;
    return persistence.achievementCollection({ action: "read", userId });
  }
  const bootstrap = () => persistence.achievementCollection({ action: "bootstrap" });
  function reconcileWeekly(period) {
    if (weeklyPeriod === period.weekStartTs) return weeklyTask;
    weeklyPeriod = period.weekStartTs;
    const podiums = getWeeklyPodiums();
    weeklyTask = weeklyTask.then(async () => {
      for (const entry of podiums) {
        const userId = userIdOf(entry.installId);
        if (!userId) continue;
        const id = [null, "weekly_gold", "weekly_silver", "weekly_bronze"][entry.rank];
        const awards = await persistence.achievementCollection({ action: "record", userId,
          events: [{ id, eventKey: `week:${entry.weekStartTs}` }],
          // The persisted activation excludes a week already underway, even
          // when its completed podium is recovered after a restart.
          sourceStartedAt: entry.weekStartTs, earnedAt: entry.awardedAt });
        publish(awards);
      }
    }).catch(error => { weeklyPeriod = null; onError("Weekly achievement reconciliation failed", error); });
    return weeklyTask;
  }
  function register(socket) {
    let lastSync = 0;
    socket.on("achievement:sync", async (_payload, callback) => {
      const reply = typeof callback === "function" ? callback : () => {};
      const userId = userIdOf(socket.data?.authUser?.id);
      if (!userId) return reply({ ok: false, error: "auth_required" });
      if (Date.now() - lastSync < 1000) return reply({ ok: false, error: "rate_limited" });
      lastSync = Date.now();
      try {
        await profile(userId);
        reply({ ok: true, ...await persistence.achievementCollection({ action: "sync", userId }) });
      } catch { reply({ ok: false, error: "achievement_unavailable" }); }
    });
    socket.on("achievement:ack", async (payload, callback) => {
      const reply = typeof callback === "function" ? callback : () => {};
      const userId = userIdOf(socket.data?.authUser?.id);
      if (!userId) return reply({ ok: false, error: "auth_required" });
      try { reply({ ok: await persistence.achievementCollection({ action: "ack", userId, eventIds: payload?.eventIds }) }); }
      catch { reply({ ok: false, error: "achievement_unavailable" }); }
    });
  }
  return { word, target, medal, settleRound, profile, publish, bootstrap, reconcileWeekly, register };
}
