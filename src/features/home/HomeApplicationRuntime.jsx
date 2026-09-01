import React from "react";

import { createHomeApplicationRuntime } from "./createHomeApplicationRuntime.js";

export default function HomeApplicationRuntime({
  connection,
  fetchBroadcastNotice,
  fetchDailyStatus,
  fetchLobbyPlayers,
  installId,
  isAccountAuthenticated,
  refreshScheduler,
  roomId,
  setRoomsStats,
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
      fetchBroadcastNotice,
      fetchDailyStatus,
      fetchLobbyPlayers,
      installId,
      isAccountAuthenticated,
      roomId,
      setRoomsStats,
    });
  }, [
    fetchBroadcastNotice,
    fetchDailyStatus,
    fetchLobbyPlayers,
    installId,
    isAccountAuthenticated,
    roomId,
    runtime,
    setRoomsStats,
  ]);

  React.useEffect(() => runtime.start(), [runtime]);

  return null;
}
