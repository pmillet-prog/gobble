import { useEffect } from "react";
import { useApplicationKernel } from "../../app/react/ApplicationRuntimeProvider.jsx";
import { createNativePullToRefresh } from "./createNativePullToRefresh.js";
import { getNativeReload } from "./nativeHost.js";
import { mobileBackRegistry } from "./mobileBackRegistry.js";
import { canNativePullToRefresh } from "./nativePullToRefreshPolicy.js";

export default function NativePullToRefreshSatellite() {
  const kernel = useApplicationKernel();
  useEffect(() => {
    const reload = getNativeReload();
    if (!reload) return;
    // Read current snapshots only during a gesture. No extra feature activation,
    // per-frame React updates, or subscriptions to high-frequency game state.
    const getFeatureState = name => kernel.features.isActive(name)
      ? kernel.features.prepare(name).store.getState() : null;
    const controller = createNativePullToRefresh({
      reload,
      canRefresh: () => canNativePullToRefresh(kernel.getState(), getFeatureState, !!mobileBackRegistry.top()),
    });
    controller.start();
    return () => controller.stop();
  }, [kernel]);
  return null;
}
