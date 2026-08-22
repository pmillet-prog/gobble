import React from "react";

import {
  useFeatureRuntime,
  useFeatureSelector,
} from "../../app/react/useFeatureRuntime.js";
import ScoreFlightLayer from "../../components/score/ScoreFlightLayer.jsx";

export default function ScoreFlightSatellite() {
  const liveUi = useFeatureRuntime("liveUi");
  const flights = useFeatureSelector(liveUi, (state) => state.scoreFlights);
  const handleComplete = React.useCallback(
    (flightId) => {
      liveUi.set("scoreFlights", (current) =>
        current.filter((flight) => flight.id !== flightId)
      );
    },
    [liveUi]
  );

  return <ScoreFlightLayer flights={flights} onComplete={handleComplete} />;
}
