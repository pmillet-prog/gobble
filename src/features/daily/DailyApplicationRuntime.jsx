import React from "react";

import { createDailyApplicationRuntime } from "./createDailyApplicationRuntime.js";

export default function DailyApplicationRuntime({
  enabled,
  fetchDailyBoard,
  fetchDailyHistory,
  fetchDailyStatus,
  fetchDuelStatus,
  installId,
}) {
  const runtime = React.useMemo(() => createDailyApplicationRuntime(), []);

  React.useLayoutEffect(() => {
    runtime.configure({
      enabled,
      fetchDailyBoard,
      fetchDailyHistory,
      fetchDailyStatus,
      fetchDuelStatus,
      installId,
    });
  }, [
    enabled,
    fetchDailyBoard,
    fetchDailyHistory,
    fetchDailyStatus,
    fetchDuelStatus,
    installId,
    runtime,
  ]);

  React.useEffect(() => runtime.start(), [runtime]);

  return null;
}
