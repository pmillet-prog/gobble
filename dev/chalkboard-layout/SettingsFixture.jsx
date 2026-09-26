import React from "react";
import { createApplicationKernel } from "../../src/app/core/createApplicationKernel.js";
import { ApplicationRuntimeProvider } from "../../src/app/react/ApplicationRuntimeProvider.jsx";
import { useFeatureFields, useFeatureRuntime } from "../../src/app/react/useFeatureRuntime.js";
import { createLayoutFeature } from "../../src/features/layout/createLayoutFeature.js";
import { createPreferencesFeature } from "../../src/features/preferences/createPreferencesFeature.js";
import ScreenOrientationSatellite from "../../src/features/layout/ScreenOrientationSatellite.jsx";
import VisualSettingsPanel from "../../src/components/VisualSettingsPanel.jsx";
import "../../src/index.css";

const kernel = createApplicationKernel();
kernel.features.define("layout", context => createLayoutFeature(context));
kernel.features.define("preferences", context => createPreferencesFeature(context));
window.layoutFixture = kernel;
function Panel() {
  const { isMobileLayout } = useFeatureFields(useFeatureRuntime("layout"), ["isMobileLayout"]);
  return <main data-layout-mode={isMobileLayout ? "mobile" : "desktop"} style={{ position: "fixed", inset: 0 }}>
    <ScreenOrientationSatellite />
    <VisualSettingsPanel isOpen />
  </main>;
}
export default function SettingsFixture() {
  return <ApplicationRuntimeProvider kernel={kernel}><Panel /></ApplicationRuntimeProvider>;
}
