import { TROPHY_REWARDS, TROPHY_BY_ID, getTrophyRewards } from "../../../shared/trophyCatalog.js";
import { getTrophyCollectionPoints } from "../../../shared/trophyCollectionScoring.js";

export const trophyCount = value => Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
export const trophyRewardCount = (rewardOrId, value) => {
  const reward = typeof rewardOrId === "string" ? TROPHY_BY_ID[rewardOrId] : rewardOrId;
  const count = trophyCount(value);
  return reward?.repeat === "once" ? Math.min(1, count) : count;
};
export const getTrophyMetal = trophy => trophy?.metal || (trophy?.id === "weekly_bronze" ? "bronze" : trophy?.id === "weekly_silver" ? "silver" : "gold");
export const getTrophyRewardName = trophy => `${trophy?.name || "Trophée"}${trophy?.metalLabel ? ` · ${trophy.metalLabel}` : ""}`;
export function getDisplayedTrophyReward(category, counts = {}) {
  const rewards = getTrophyRewards(category);
  return [...rewards].reverse().find(reward => trophyRewardCount(reward, counts[reward.id]) > 0) || rewards.at(-1);
}
export function getTrophyCountLabel(reward, count) {
  const obtained = trophyRewardCount(reward, count);
  return obtained ? reward.repeat === "once" ? "Obtenu une fois" : `Obtenu ${obtained.toLocaleString("fr-FR")} fois` : "Pas encore obtenu";
}
export function getTrophyAwardPoints(award) {
  const reward = TROPHY_BY_ID[award?.id];
  if (!reward || !Number.isFinite(reward.points)) return null;
  if (award.dev === true) return 0;
  const count = trophyRewardCount(reward, award.count);
  const delta = Math.min(count, trophyRewardCount(reward, award.delta));
  if (!delta) return 0;
  const rewards = getTrophyRewards(reward);
  const preceding = rewards[rewards.findIndex(item => item.id === reward.id) - 1];
  // Real grants cross tiers in bronze/silver/gold order. Stored count/delta
  // also identify the first gold when a pending receipt is replayed later.
  const previousPoints = count === delta && preceding ? preceding.points : 0;
  if (!Number.isFinite(previousPoints)) return null;
  return delta * reward.points - previousPoints;
}

export function normalizeTrophyAward(value) {
  if (!value || !TROPHY_BY_ID[value.id] || typeof value.eventId !== "string" || !value.eventId) return null;
  const count = trophyRewardCount(value.id, value.count);
  const delta = trophyRewardCount(value.id, value.delta);
  if (!count || !delta) return null;
  return { ...value, count, delta: Math.min(count, delta) };
}

export function getTrophyCollection(achievements, liveCounts = {}, devCounts = {}) {
  const earnedCounts = Object.fromEntries(TROPHY_REWARDS.map(({ id }) => [id,
    trophyRewardCount(id, Math.max(trophyCount(achievements?.counts?.[id]), trophyCount(liveCounts[id]))),
  ]));
  const counts = Object.fromEntries(TROPHY_REWARDS.map(({ id }) => [id, trophyRewardCount(id, earnedCounts[id] + trophyCount(devCounts[id]))]));
  const totalCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const points = getTrophyCollectionPoints(earnedCounts);
  return { counts, totalCount, points };
}

export function collectRoundTrophyAwards(results, privateAwards, roundId) {
  if (roundId == null) return [];
  const awards = new Map();
  for (const entry of Array.isArray(results) ? results : []) {
    for (const raw of Array.isArray(entry?.achievementAwards) ? entry.achievementAwards : []) {
      const award = normalizeTrophyAward(raw);
      if (award && String(award.roundId) === String(roundId)) {
        awards.set(award.eventId, { ...award, nick: entry.nick || award.nick || "Joueur" });
      }
    }
  }
  for (const award of privateAwards) {
    if (String(award.roundId) === String(roundId) && !awards.has(award.eventId)) awards.set(award.eventId, award);
  }
  return [...awards.values()];
}
