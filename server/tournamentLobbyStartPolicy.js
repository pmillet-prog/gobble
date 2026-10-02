export function getTournamentLobbyStartStatus({
  activeHumanCount = 0,
  readyCount = 0,
  isLobbyOpen = false,
  maintenanceMode = false,
} = {}) {
  const humans = Math.max(0, Number(activeHumanCount) || 0);
  const readyThreshold = Math.max(1, Math.ceil(humans * 0.5));
  const readyThresholdMet = Math.max(0, Number(readyCount) || 0) >= readyThreshold;
  return {
    readyThreshold,
    readyThresholdMet,
    canStart: !!isLobbyOpen && !maintenanceMode && humans > 0 && readyThresholdMet,
  };
}
