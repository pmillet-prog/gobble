import { useLayoutEffect, useMemo } from "react";
import { createScreenWakeLock } from "./createScreenWakeLock.js";
import { createMobileNavigation } from "./createMobileNavigation.js";
import { getMobileBackTargets, isMobileRoundActive } from "./mobileExperiencePolicy.js";

export default function useMobileExperience(config) {
  const runtime = useMemo(() => ({
    wake: createScreenWakeLock(),
    navigation: createMobileNavigation(),
  }), []);
  useLayoutEffect(() => {
    const playing = isMobileRoundActive(config);
    const overlays = config.features.overlays;
    const confirming = overlays.store.getState().mobileExitConfirmOpen;
    let onBack = null;
    if (config.view === "daily_results") onBack = config.actions.dailyHome;
    else if (config.view === "daily") onBack = () => {
      if (config.features.daily.store.getState().section !== "overview") config.features.daily.set("section", "overview");
      else config.actions.goHome();
    };
    else if (config.view === "vault") onBack = config.actions.closeVault;
    else if (config.view === "duel" || config.view === "chalkboard") onBack = config.actions.goHome;
    else if (config.view === "live" || config.view === "training" || config.view === "daily_play") onBack = config.actions.leaveRound;
    runtime.wake.setEnabled(playing);
    runtime.navigation.configure({
      enabled: config.enabled,
      protectExit: playing,
      confirming,
      targets: getMobileBackTargets(config.features, config.actions),
      onBack,
      requestExit: () => overlays.set("mobileExitConfirmOpen", true),
      cancelExit: () => overlays.set("mobileExitConfirmOpen", false),
    });
    if (!playing && confirming) overlays.set("mobileExitConfirmOpen", false);
  });
  useLayoutEffect(() => {
    runtime.wake.start();
    runtime.navigation.start();
    return () => { runtime.wake.stop(); runtime.navigation.stop(); };
  }, [runtime]);
}
