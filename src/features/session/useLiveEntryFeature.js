import React from "react";

import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";

export function useLiveEntryFeature(config) {
  const feature = useFeatureRuntime("liveEntry");

  React.useEffect(() => {
    feature.configure(config);
  });

  return feature;
}
