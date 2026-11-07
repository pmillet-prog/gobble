import React from "react";
import { usePerspectiveWheel } from "../../../../dev/infortune-perspective/usePerspectiveWheel.js";
import { WheelCanvas } from "../../../../dev/infortune-perspective/WheelCanvas.jsx";
import { DEFAULT_REFLECTIONS } from "../../../../dev/infortune-perspective/sphericalReflections.js";
import { createWheelDiagnosticRun } from "../training/createWheelDiagnosticRun.js";
import { useInfortuneCamera } from "../useInfortuneCamera.js";
import { PRESENTER_IDENTITIES } from "../../../../shared/presenterIdentities.js";
import InfortuneWheelLoading from "../../../components/infortune/InfortuneWheelLoading.jsx";

const CONTESTANTS = ["pivot", "lepers"].map(presenterKey => ({ id: `graphics-${presenterKey}`, presenterKey, isBot: true,
  nick: PRESENTER_IDENTITIES[presenterKey].nick }));
const SILENT = { ready: true, sync() {} };

export default function WheelGraphicsMeasureStage({ profile, onComplete, onReady }) {
  const complete = React.useRef(onComplete); complete.current = onComplete;
  const ready = React.useRef(onReady); ready.current = onReady;
  const ended = React.useRef(false);
  const [diagnostic] = React.useState(() => {
    const run = createWheelDiagnosticRun({ profile }); run.profile = profile;
    run.onError = reason => { if (!ended.current) { ended.current = true; complete.current(run.finish("error", reason)); } };
    return run;
  });
  const [size, setSize] = React.useState({ width: 720, height: 554 });
  const wheel = usePerspectiveWheel(size, DEFAULT_REFLECTIONS, { diagnostic, contestants: CONTESTANTS, muted: true });
  useInfortuneCamera(wheel, SILENT, { complete() {}, onCameraFrame: state => {
    if (state.sequence === "intro" && state.playing) diagnostic.intro();
  } }, { pauseWhenHidden: true });
  const current = React.useRef(wheel); current.current = wheel;
  React.useEffect(() => {
    if (wheel.stageStatus.phase === "ready") ready.current?.(profile);
  }, [wheel.stageStatus.phase, profile]);
  React.useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(wheel.scene.current);
    const visibility = () => diagnostic.visibility(document.hidden);
    visibility(); document.addEventListener("visibilitychange", visibility);
    // A real intro and a real spin, without waiting for input or audio. Only
    // visible frames count; the scene uses exactly the selected game profile.
    const timer = setInterval(() => {
      if (document.hidden || ended.current) return;
      const active = current.current, snapshot = diagnostic.snapshot();
      if (snapshot.phases?.spin?.durationMs >= 3000) {
        ended.current = true; complete.current(diagnostic.finish("complete")); return;
      }
      if (!active.inputLocked && ["ready", "aiming"].includes(active.view.phase)) active.autoLaunch();
    }, 300);
    return () => { observer.disconnect(); clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [diagnostic, wheel.scene]);
  return <div className="wheel-graphics-setup__stage" ref={wheel.scene}>
    <WheelCanvas wheel={wheel} label="Mesure automatique de la roue" />
    {wheel.stageStatus.phase !== "ready" && <div className="wheel-graphics-setup__loading"><InfortuneWheelLoading /></div>}
  </div>;
}
