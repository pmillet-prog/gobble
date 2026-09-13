export const HOME_TUTORIAL_ROUND_LIMIT = 50;

export function getProfileRoundCount(profile) {
  const counts = [profile?.lifetime?.roundsPlayed, profile?.weekly?.allTime?.roundsPlayed]
    .filter(value => value !== null && value !== undefined && value !== "")
    .map(Number)
    .filter(value => Number.isFinite(value) && value >= 0);
  // The older weekly archive can cover more history than the lifetime table.
  return counts.length ? Math.max(...counts) : null;
}

export function isHomeTutorialEligible(roundCount) {
  return Number.isFinite(roundCount) && roundCount >= 0 && roundCount < HOME_TUTORIAL_ROUND_LIMIT;
}
