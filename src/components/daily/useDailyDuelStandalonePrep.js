import React from "react";

function sortDuelContributors(a, b) {
  const pointsDiff = (Number(b?.points) || 0) - (Number(a?.points) || 0);
  if (pointsDiff !== 0) return pointsDiff;
  return String(a?.nick || "").localeCompare(String(b?.nick || ""));
}

export default function useDailyDuelStandalonePrep({ appView, duelStatus, isLoggedIn }) {
  const shouldPrepareDuelStandaloneView = !isLoggedIn && appView === "duel";
  const shouldPrepareDailyStandaloneView =
    !isLoggedIn && (appView === "daily" || appView === "daily_results");
  const shouldPrepareDailyOrDuelStandaloneView =
    shouldPrepareDailyStandaloneView || shouldPrepareDuelStandaloneView;

  const contributorsByTeam =
    duelStatus?.weekly?.contributorsByTeam && typeof duelStatus.weekly.contributorsByTeam === "object"
      ? duelStatus.weekly.contributorsByTeam
      : {};

  const duelContributorsRed = React.useMemo(
    () =>
      shouldPrepareDuelStandaloneView && Array.isArray(contributorsByTeam.red)
        ? [...contributorsByTeam.red].sort(sortDuelContributors)
        : [],
    [contributorsByTeam.red, shouldPrepareDuelStandaloneView]
  );

  const duelContributorsBlue = React.useMemo(
    () =>
      shouldPrepareDuelStandaloneView && Array.isArray(contributorsByTeam.blue)
        ? [...contributorsByTeam.blue].sort(sortDuelContributors)
        : [],
    [contributorsByTeam.blue, shouldPrepareDuelStandaloneView]
  );

  return {
    duelContributorsBlue,
    duelContributorsRed,
    shouldPrepareDailyOrDuelStandaloneView,
    shouldPrepareDailyStandaloneView,
    shouldPrepareDuelStandaloneView,
  };
}
