import React, { Suspense } from "react";

import {
  useFeatureFields,
  useFeatureRuntime,
} from "../../app/react/useFeatureRuntime.js";

const StatsOverlayRuntime = React.lazy(() => import("./StatsOverlayRuntime.jsx"));

function StatsOverlaySatellite() {
  const statsFeature = useFeatureRuntime("stats");
  const { open } = useFeatureFields(statsFeature, ["open"]);

  if (!open) return null;

  return (
    <Suspense fallback={null}>
      <StatsOverlayRuntime />
    </Suspense>
  );
}

export default React.memo(StatsOverlaySatellite);
