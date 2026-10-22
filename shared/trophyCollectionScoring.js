import { TROPHY_REWARDS } from "./trophyCatalog.js";

export const TROPHY_SCORING_TIER_RANK = Object.freeze({ bronze: 1, silver: 2, gold: 3 });

const countOf = value => Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;

// Tier point values are the total reached within a category, not bonuses to
// add together. Owned bronze/silver remain visible after gold is obtained.
export function getTrophyCollectionPoints(counts = {}, catalog = TROPHY_REWARDS) {
  if (!catalog.every(reward => Number.isFinite(reward.points) && reward.points >= 0)) return null;
  const categories = new Map();
  for (const reward of catalog) {
    const count = Math.min(reward.unique || reward.repeat === "once" ? 1 : Infinity, countOf(counts?.[reward.id]));
    if (!count) continue;
    const categoryId = reward.categoryId || reward.id;
    const rank = TROPHY_SCORING_TIER_RANK[reward.metal] || 0;
    const points = count * reward.points;
    const previous = categories.get(categoryId);
    if (!previous || rank > previous.rank) categories.set(categoryId, { rank, points });
    else if (rank === previous.rank) previous.points += points;
  }
  return [...categories.values()].reduce((sum, category) => sum + category.points, 0);
}
