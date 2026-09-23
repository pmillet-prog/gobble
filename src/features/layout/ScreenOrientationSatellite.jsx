import { useApplicationSelector } from "../../app/react/ApplicationRuntimeProvider.jsx";
import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import useScreenOrientation from "./useScreenOrientation.js";

export default function ScreenOrientationSatellite() {
  const view = useApplicationSelector(state => state.navigation.view);
  const layout = useFeatureRuntime("layout");
  const { isMobileLayout } = useFeatureFields(layout, ["isMobileLayout"]);
  useScreenOrientation({ isMobileLayout, allowLandscape: view === "chalkboard" });
  return null;
}
