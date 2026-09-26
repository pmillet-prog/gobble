import React from "react";
import { useApplicationSelector } from "../../app/react/ApplicationRuntimeProvider.jsx";
import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import useScreenOrientation from "./useScreenOrientation.js";

export default function ScreenOrientationSatellite() {
  const view = useApplicationSelector(state => state.navigation.view);
  const layout = useFeatureRuntime("layout");
  const preferences = useFeatureRuntime("preferences");
  const { isMobileLayout } = useFeatureFields(layout, ["isMobileLayout"]);
  const { mobileLandscapeDesktopEnabled } = useFeatureFields(preferences, ["mobileLandscapeDesktopEnabled"]);
  React.useLayoutEffect(() => {
    layout.configureMobileLandscapeDesktop(mobileLandscapeDesktopEnabled);
  }, [layout, mobileLandscapeDesktopEnabled]);
  useScreenOrientation({ isMobileLayout, allowLandscape: view === "chalkboard" || mobileLandscapeDesktopEnabled });
  return null;
}
