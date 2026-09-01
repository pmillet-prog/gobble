function safeInvoke(callback) {
  try {
    const result = callback?.();
    result?.catch?.(() => {});
  } catch (_) {}
}

export function createHomeApplicationRuntime({
  connection,
  refreshScheduler,
} = {}) {
  let active = false;
  let config = {};
  let dailyRequestKey = null;
  let disposeBroadcastRefresh = null;
  let disposeLobbyRefresh = null;
  let disposeRoomsStats = null;
  let lobbyRoomId = null;

  function bindRoomsStats() {
    if (disposeRoomsStats || typeof connection?.on !== "function") return;
    const onRoomsStats = (payload) => {
      config.setRoomsStats?.(Array.isArray(payload) ? payload : []);
    };
    connection.on("roomsStats", onRoomsStats);
    disposeRoomsStats = () => {
      connection.off?.("roomsStats", onRoomsStats);
      disposeRoomsStats = null;
    };
  }

  function startBroadcastRefresh() {
    if (disposeBroadcastRefresh || typeof refreshScheduler?.schedule !== "function") {
      return;
    }
    disposeBroadcastRefresh = refreshScheduler.schedule(
      "home:broadcast-notice",
      {
        intervalMs: 45000,
        run: () => safeInvoke(config.fetchBroadcastNotice),
      }
    );
  }

  function syncLobbyRefresh() {
    const nextRoomId = String(config.roomId || "");
    if (disposeLobbyRefresh && lobbyRoomId === nextRoomId) return;
    disposeLobbyRefresh?.();
    disposeLobbyRefresh = null;
    lobbyRoomId = nextRoomId;
    if (typeof refreshScheduler?.schedule !== "function") return;
    disposeLobbyRefresh = refreshScheduler.schedule("home:lobby-players", {
      connection,
      intervalMs: 6000,
      run: () => safeInvoke(config.fetchLobbyPlayers),
    });
  }

  function syncDailyStatus() {
    const nextRequestKey = config.isAccountAuthenticated
      ? String(config.installId || "authenticated")
      : "";
    if (dailyRequestKey === nextRequestKey) return;
    dailyRequestKey = nextRequestKey;
    if (nextRequestKey) safeInvoke(config.fetchDailyStatus);
  }

  function configure(nextConfig = {}) {
    config = nextConfig;
    if (!active) return;
    syncLobbyRefresh();
    syncDailyStatus();
  }

  function start() {
    if (active) return stop;
    active = true;
    bindRoomsStats();
    startBroadcastRefresh();
    syncLobbyRefresh();
    syncDailyStatus();
    return stop;
  }

  function stop() {
    if (!active) return;
    active = false;
    disposeLobbyRefresh?.();
    disposeLobbyRefresh = null;
    disposeBroadcastRefresh?.();
    disposeBroadcastRefresh = null;
    disposeRoomsStats?.();
    disposeRoomsStats = null;
    dailyRequestKey = null;
    lobbyRoomId = null;
  }

  return Object.freeze({ configure, start, stop });
}
