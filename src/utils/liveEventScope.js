export function isLiveGameplayView(appView, isLoggedIn) {
  return !!isLoggedIn && appView === "live";
}

export function shouldProcessLiveRoomEvent({
  appView,
  isLoggedIn,
  activeRoomId = null,
  incomingRoomId = null,
} = {}) {
  if (!isLiveGameplayView(appView, isLoggedIn)) return false;

  const active = String(activeRoomId || "").trim();
  const incoming = String(incomingRoomId || "").trim();
  return !active || !incoming || active === incoming;
}

export function shouldProcessAttachedLiveRoomEvent({
  activeRoomId = null,
  appView,
  gameplaySession = null,
  incomingRoomId = null,
  incomingRoundId = null,
  isLoggedIn,
  liveSessionReadyRef = null,
} = {}) {
  if (
    !shouldProcessLiveRoomEvent({
      activeRoomId,
      appView,
      incomingRoomId,
      isLoggedIn,
    })
  ) {
    return false;
  }
  if (liveSessionReadyRef && liveSessionReadyRef.current !== true) return false;
  if (
    gameplaySession?.acceptsEvent &&
    !gameplaySession.acceptsEvent({
      origin: "live",
      roomId: incomingRoomId,
      roundId: incomingRoundId,
    })
  ) {
    return false;
  }
  return true;
}
