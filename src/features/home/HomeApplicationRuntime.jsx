import React from "react";

import { createHomeApplicationRuntime } from "./createHomeApplicationRuntime.js";

export default function HomeApplicationRuntime({
  chatTab,
  connection,
  fetchBroadcastNotice,
  fetchDailyStatus,
  fetchLobbyPlayers,
  installId,
  isAccountAuthenticated,
  isChatClosing,
  isChatOpenMobile,
  isHomeChatOpen,
  isHomeChatOpenRef,
  isMobileLayout,
  refreshScheduler,
  roomId,
  setHomeChatBotUnreadCount,
  setHomeChatUnreadCount,
  setIsHomeChatOpen,
  setRoomsStats,
  subscribeLobbyChat,
}) {
  const runtime = React.useMemo(
    () =>
      createHomeApplicationRuntime({
        connection,
        refreshScheduler,
      }),
    [connection, refreshScheduler]
  );

  React.useLayoutEffect(() => {
    runtime.configure({
      chatTab,
      fetchBroadcastNotice,
      fetchDailyStatus,
      fetchLobbyPlayers,
      installId,
      isAccountAuthenticated,
      isChatClosing,
      isChatOpenMobile,
      isHomeChatOpen,
      isHomeChatOpenRef,
      isMobileLayout,
      roomId,
      setHomeChatBotUnreadCount,
      setHomeChatUnreadCount,
      setIsHomeChatOpen,
      setRoomsStats,
      subscribeLobbyChat,
    });
  }, [
    chatTab,
    fetchBroadcastNotice,
    fetchDailyStatus,
    fetchLobbyPlayers,
    installId,
    isAccountAuthenticated,
    isChatClosing,
    isChatOpenMobile,
    isHomeChatOpen,
    isHomeChatOpenRef,
    isMobileLayout,
    roomId,
    runtime,
    setHomeChatBotUnreadCount,
    setHomeChatUnreadCount,
    setIsHomeChatOpen,
    setRoomsStats,
    subscribeLobbyChat,
  ]);

  React.useEffect(() => runtime.start(), [runtime]);

  return null;
}
