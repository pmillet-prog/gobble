export function isCurrentDailyStartRequest({
  appViewRef,
  dailyLifecycleRef,
  startGeneration,
} = {}) {
  const currentView = String(appViewRef?.current || "");
  return (
    dailyLifecycleRef?.current?.startGeneration === startGeneration &&
    (currentView === "daily" || currentView === "daily_results")
  );
}

export function isCurrentDailyGameplaySession({
  appViewRef,
  gameplaySession,
  sessionId,
} = {}) {
  return (
    !!sessionId &&
    appViewRef?.current === "daily_play" &&
    gameplaySession?.store?.getState?.()?.origin === "daily" &&
    gameplaySession?.isCurrent?.(sessionId) === true
  );
}

