import React from "react";

import GobbleApplication from "../GobbleApplication.jsx";
import { AMBIENT_MUSIC_TRACKS_DEFAULT } from "../audio/audioAssets.js";
import AppBootOverlay from "../components/boot/AppBootOverlay.jsx";
import socketClient from "../socket.js";
import { readBrowserSessionSnapshot } from "./adapters/browserSessionSnapshot.js";
import { createRealtimeGateway } from "./adapters/createRealtimeGateway.js";
import { createApplicationKernel } from "./core/createApplicationKernel.js";
import { registerClientFeatures } from "./registerClientFeatures.js";
import { TraceRuntimeProvider } from "../features/trace/TraceRuntime.jsx";
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
      {bootReady ? <GobbleApplication /> : null}
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
    const realtime = createRealtimeGateway(socketClient);
    kernelRef.current = registerClientFeatures(
      createApplicationKernel({
        ambientTracks: AMBIENT_MUSIC_TRACKS_DEFAULT,
        ports: { realtime },
        session: readBrowserSessionSnapshot(),
      })
    );
  }

  return (
    <ApplicationRuntimeProvider kernel={kernelRef.current}>
      <TraceRuntimeProvider>
        <ApplicationRuntime />
      </TraceRuntimeProvider>
    </ApplicationRuntimeProvider>
  );
}
