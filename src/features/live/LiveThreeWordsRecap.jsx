import React from "react";
import DailySpecialRecapDialog from "../../components/daily/DailySpecialRecapDialog.jsx";
import { getLiveThreeWordsRecap } from "./liveThreeWordsRecap.js";
import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";

export default function LiveThreeWordsRecap({ roundId, results, userId, nickname }) {
  const liveUi = useFeatureRuntime("liveUi");
  const [closedRound, setClosedRound] = React.useState(null);
  const recap = React.useMemo(() => getLiveThreeWordsRecap(results, { userId, nickname }), [results, userId, nickname]);
  const visible = !!roundId && closedRound !== roundId && !!recap;
  React.useLayoutEffect(() => {
    liveUi.set("threeWordsRecapOpen", visible);
    return () => liveUi.set("threeWordsRecapOpen", false);
  }, [liveUi, visible]);
  if (!visible) return null;
  return <DailySpecialRecapDialog key={roundId} {...recap} animate
    contextLabel="Manche live · 3 mots" footerNote={null}
    onClose={() => setClosedRound(roundId)} />;
}
