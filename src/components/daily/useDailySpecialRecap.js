import React from "react";
import { DAILY_SPECIAL_MODE } from "./dailyModes.js";
import { getDailySpecialWordReview } from "./dailySpecialRecapModel.js";

export default function useDailySpecialRecap({ appView, dailyResult, dailyStatus }) {
  const [opened, setOpened] = React.useState(null);
  const shownRef = React.useRef("");
  const result = dailyStatus?.mySpecialResult ||
    (dailyResult?.mode === DAILY_SPECIAL_MODE && (!dailyStatus?.dateId || dailyResult.dateId === dailyStatus.dateId)
      ? dailyResult : null);
  const review = React.useMemo(() => getDailySpecialWordReview(result), [result]);

  React.useEffect(() => {
    if (appView !== "daily_results" || dailyResult?.mode !== DAILY_SPECIAL_MODE || !review) return;
    const key = dailyResult.dateId;
    if (!key || shownRef.current === key) return;
    shownRef.current = key;
    setOpened({ result, review, animate: true });
  }, [appView, dailyResult, result, review]);

  return {
    opened,
    canOpen: !!review,
    open: () => review && setOpened({ result, review, animate: false }),
    close: () => setOpened(null),
  };
}
