import React from "react";

import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";

export function useLiveResumeFeature(config) {
  const feature = useFeatureRuntime("liveResume");

  React.useEffect(() => {
    feature.configure(config);
  });

  return feature;
}
