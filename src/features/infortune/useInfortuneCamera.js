import React from "react";
import savedInProject from "../../../dev/infortune-perspective/cameraTimeline.saved.json";
import { createCameraTimelinePlayer } from "../../../dev/infortune-perspective/createCameraTimelinePlayer.js";
import { createCameraSpinDirector } from "../../../dev/infortune-perspective/createCameraSpinDirector.js";
import { createCameraTimeline, normalizeCameraTimeline } from "../../../dev/infortune-perspective/cameraTimeline.js";
import { CAMERA_SEQUENCE_ENDPOINT, projectSpeed } from "../../../dev/infortune-perspective/cameraTimelinePersistence.js";
import { createCameraAvailabilityGate } from "../../../dev/infortune-perspective/cameraAvailabilityGate.js";
import { infortuneStageReady, startInfortuneIntro } from "./startInfortuneIntro.js";
import { createPresentationFrames } from "../../utils/createPresentationFrames.js";

// The game plays the shared direction only. Workshop drafts and editor state
// never affect a player's camera, nor are editor controls mounted here.
export function useInfortuneCamera(wheel, sound, feature, { pauseWhenHidden = false, enabled = true } = {}) {
  const [project, setProject] = React.useState(savedInProject);
  const [loaded, setLoaded] = React.useState(!import.meta.env.DEV);
  const player = React.useRef(null), started = React.useRef(false), current = React.useRef(null);
  const availability = React.useRef(null);
  if (!availability.current) availability.current = createCameraAvailabilityGate();
  current.current = { wheel, sound, feature, project,
    timeline: normalizeCameraTimeline({ ...createCameraTimeline(), ...project }) };
  const ready = enabled && infortuneStageReady({ flat: wheel.flat, cameraLoaded: loaded,
    stageReady: wheel.stageStatus.phase === "ready", soundReady: sound.ready, renderError: wheel.renderError });
  current.current.ready = ready;
  React.useEffect(() => {
    if (!import.meta.env.DEV) return;
    let disposed = false;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 4000);
    void fetch(CAMERA_SEQUENCE_ENDPOINT, { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(body => { if (!disposed && body?.project) setProject(body.project); })
      .catch(() => {}) // The bundled shared direction remains available offline.
      .finally(() => { clearTimeout(timeout); if (!disposed) setLoaded(true); });
    return () => { disposed = true; controller.abort(); clearTimeout(timeout); };
  }, []);
  React.useEffect(() => {
    let director;
    const frames = pauseWhenHidden ? null : createPresentationFrames();
    const instance = createCameraTimelinePlayer({
      ...(frames ? { now: frames.now, requestFrame: frames.requestFrame, cancelFrame: frames.cancelFrame } : {}),
      readTimeline: () => current.current.timeline,
      onFrame(camera, state) {
        const { wheel, sound } = current.current;
        wheel.setInputLocked(state.sequence === "intro" && state.time < 5);
        wheel.setCamera(camera, state); sound.sync(state);
        current.current.feature.onCameraFrame?.(state);
      },
      onChange(state) {
        director?.onTransportChange();
        if (state.sequence === "results" && !state.playing && state.time >= 3) {
          const { wheel, feature } = current.current;
          if (feature.landResult) wheel.resultExit.start({ onLand: feature.landResult, onComplete: () => feature.complete(wheel.view.result) });
          else feature.complete(wheel.view.result);
        }
      },
    });
    player.current = instance;
    director = createCameraSpinDirector({ player: instance, enabled: () => true,
      readSpeedThreshold: () => projectSpeed(current.current.project) });
    const update = progress => director.update(progress);
    wheel.spinProgress.current = update;
    const visibility = () => {
      const available = current.current.ready && (!pauseWhenHidden || !document.hidden);
      availability.current.update(instance, available);
      if (available && !started.current) {
        started.current = true; startInfortuneIntro(instance, current.current.wheel.flat);
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      if (wheel.spinProgress.current === update) wheel.spinProgress.current = null;
      instance.dispose(); frames?.dispose(); availability.current.reset(); player.current = null; started.current = false;
    };
  }, [wheel.spinProgress, pauseWhenHidden]);
  React.useEffect(() => {
    const available = ready && (!pauseWhenHidden || !document.hidden);
    availability.current.update(player.current, available);
    if (available && !started.current) { started.current = true; startInfortuneIntro(player.current, current.current.wheel.flat); }
  }, [ready, pauseWhenHidden]);
  const beginRound = React.useCallback(() => {
    if (!current.current.ready || !player.current) return false;
    started.current = true;
    current.current.wheel.setInputLocked(true);
    startInfortuneIntro(player.current, current.current.wheel.flat);
    return true;
  }, []);
  return { beginRound };
}
