import React from "react";

import LegacyApp from "../LegacyApp.jsx";
import { AMBIENT_MUSIC_TRACKS_DEFAULT } from "../audio/audioAssets.js";
import AppBootOverlay from "../components/boot/AppBootOverlay.jsx";
import { createApplicationKernel } from "./core/createApplicationKernel.js";
import {
  ApplicationRuntimeProvider,
  useApplicationKernel,
  useApplicationSelector,
} from "./react/ApplicationRuntimeProvider.jsx";

function ApplicationRuntime() {
  const kernel = useApplicationKernel();
  const bootReady = useApplicationSelector((state) => state.boot.ready);
  const handleAmbientTracksResolved = React.useCallback(
    (tracks) => kernel.commands.boot.resolveAmbientTracks(tracks),
    [kernel]
  );
  const handleOverlayVisibleChange = React.useCallback(
    (visible) => kernel.commands.boot.setOverlayVisible(visible),
    [kernel]
  );
  const handleReady = React.useCallback(
    () => kernel.commands.boot.setReady(),
    [kernel]
  );

  return (
    <>
      {bootReady ? <LegacyApp /> : null}
      <AppBootOverlay
        onAmbientTracksResolved={handleAmbientTracksResolved}
        onOverlayVisibleChange={handleOverlayVisibleChange}
        onReady={handleReady}
      />
    </>
  );
}

export default function AppShell() {
  const kernelRef = React.useRef(null);
  if (!kernelRef.current) {
    kernelRef.current = createApplicationKernel({
      ambientTracks: AMBIENT_MUSIC_TRACKS_DEFAULT,
    });
  }

  return (
    <ApplicationRuntimeProvider kernel={kernelRef.current}>
      <ApplicationRuntime />
    </ApplicationRuntimeProvider>
  );
}
