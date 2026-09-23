import React from "react";
import { createScreenOrientationController, isOrientationMobileDevice, resolveScreenOrientationMode } from "./screenOrientation.js";

export default function useScreenOrientation({ isMobileLayout, allowLandscape }) {
  const controller = React.useMemo(() => createScreenOrientationController({
    orientation: globalThis.screen?.orientation, document: globalThis.document, window: globalThis.window,
  }), []);
  React.useLayoutEffect(() => {
    controller.setMode(resolveScreenOrientationMode({ isMobileLayout, allowLandscape, isMobileDevice: isOrientationMobileDevice() }));
  }, [controller, isMobileLayout, allowLandscape]);
  React.useLayoutEffect(() => { controller.start(); return () => controller.stop(); }, [controller]);
}
