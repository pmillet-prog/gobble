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
  let homeChatStateKey = null;
  let homeChatSubscriptionKey = null;
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

  function syncHomeChat() {
    const open = !!config.isHomeChatOpen;
    const mobileOpen = !!config.isChatOpenMobile;
    const mobileMessagesVisible =
      !!config.isMobileLayout && mobileOpen && !config.isChatClosing;
    const tab = config.chatTab === "system" ? "system" : "messages";
    if (config.isHomeChatOpenRef) {
      config.isHomeChatOpenRef.current = open;
    }

    const nextStateKey = `${open ? "open" : "closed"}:${
      mobileMessagesVisible ? "mobile-open" : "mobile-closed"
    }:${tab}`;
    if (homeChatStateKey !== nextStateKey) {
      homeChatStateKey = nextStateKey;
      if ((open || mobileMessagesVisible) && tab === "messages") {
        config.setHomeChatUnreadCount?.(0);
        config.setHomeChatBotUnreadCount?.(0);
      }
    }

    const nextSubscriptionKey = open || mobileOpen
      ? `${String(config.roomId || "")}:${open ? "home" : ""}:${
          mobileOpen ? "mobile" : ""
        }`
      : "closed";
    if (homeChatSubscriptionKey === nextSubscriptionKey) return;
    homeChatSubscriptionKey = nextSubscriptionKey;
    if (open || mobileOpen) {
      safeInvoke(() => config.subscribeLobbyChat?.({ force: true }));
    }
  }

  function configure(nextConfig = {}) {
    config = nextConfig;
    if (!active) return;
    syncLobbyRefresh();
    syncDailyStatus();
    syncHomeChat();
  }

  function start() {
    if (active) return stop;
    active = true;
    bindRoomsStats();
    startBroadcastRefresh();
    syncLobbyRefresh();
    syncDailyStatus();
    syncHomeChat();
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
    if (config.isHomeChatOpenRef) {
      config.isHomeChatOpenRef.current = false;
    }
    if (config.isHomeChatOpen) {
      config.setIsHomeChatOpen?.(false);
    }
    dailyRequestKey = null;
    homeChatStateKey = null;
    homeChatSubscriptionKey = null;
    lobbyRoomId = null;
  }

  return Object.freeze({ configure, start, stop });
}
