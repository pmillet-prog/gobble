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
