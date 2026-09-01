import React from "react";

import DailyHubScreen from "../../components/daily/DailyHubScreen.jsx";
import DailyApplicationRuntime from "./DailyApplicationRuntime.jsx";

export default function DailyApplication({
  actions,
  background,
  daily,
  identity,
  overlays,
  preparation,
  renderers,
  runtime,
  view,
}) {
  const dailyHistoryScrollRef = React.useRef(null);
  const historyDaysCount = Array.isArray(daily?.dailyHistory?.days)
    ? daily.dailyHistory.days.length
    : 0;
  const crownTotalsCount = Array.isArray(daily?.dailyHistory?.crownTotals)
    ? daily.dailyHistory.crownTotals.length
    : 0;

  React.useEffect(() => {
    if (view?.appView !== "daily") return;
    actions?.setDailyHistoryIndex?.(0);
    actions?.setDailyRankingView?.("today");
    dailyHistoryScrollRef.current?.scrollTo?.({ left: 0, behavior: "auto" });
  }, [
    actions?.setDailyHistoryIndex,
    actions?.setDailyRankingView,
    crownTotalsCount,
    historyDaysCount,
    view?.appView,
  ]);

  return (
    <>
      <DailyApplicationRuntime {...runtime} />
      <DailyHubScreen
        actions={actions}
        background={background}
        daily={{ ...daily, dailyHistoryScrollRef }}
        identity={identity}
        overlays={overlays}
        preparation={preparation}
        renderers={renderers}
        view={view}
      />
    </>
  );
}
