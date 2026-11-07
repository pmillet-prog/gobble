import React from "react";
import { usePerspectiveWheel } from "./usePerspectiveWheel.js";
import { useCameraTimeline } from "./useCameraTimeline.js";
import { useWheelSoundtrack } from "./useWheelSoundtrack.js";
import { DEFAULT_REFLECTIONS } from "./sphericalReflections.js";
import { useExchangeWorkshop, ExchangeWorkshopChoice } from "./ExchangeWorkshop.jsx";
import InfortuneWheelPlay from "../../src/components/infortune/InfortuneWheelPlay.jsx";
import { GESTURE_MODES } from "../../src/features/infortune/wheelSkillShot.js";

const commitCamera = () => {};
export default function WheelPlayPreview({ casting, onStartTournament }) {
  const [size, setSize] = React.useState({ width: 720, height: 554 });
  const [gestureMode, setGestureMode] = React.useState("power");
  const exchange = useExchangeWorkshop(casting.contestants);
  const wheel = usePerspectiveWheel(size, DEFAULT_REFLECTIONS, { contestants: casting.contestants, exchangeEnabled: exchange.enabled, gestureMode,
    banks: exchange.economy, onResult: exchange.result, selectedContestant: exchange.selectedId, onChoose: exchange.choosing ? exchange.select : null });
  const sound = useWheelSoundtrack(wheel.muted, wheel.audioEvents);
  const timeline = useCameraTimeline({ applyCamera: wheel.setCamera, commitCamera, stageReady: wheel.stageStatus.phase === "ready" && sound.ready,
    spinProgress: wheel.spinProgress, setInputLocked: wheel.setInputLocked, syncIntroAudio: sound.sync,
    onResultPresented: () => wheel.resultExit.start() });
  React.useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(wheel.scene.current); return () => observer.disconnect();
  }, [wheel.scene]);
  const busy = !["ready", "finished"].includes(wheel.view.phase) || timeline.transport.playing;
  function changeGestureMode(value) {
    if (wheel.view.phase === "finished") { exchange.reset(); wheel.reset(); }
    setGestureMode(value);
  }
  return <InfortuneWheelPlay wheel={wheel} sound={sound} subtitle="Essai de lancer" bank={wheel.launchBank} exchanging={exchange.choosing}
    launchBank={wheel.launchBank}
    status={gestureMode !== "power" && wheel.view.phase === "ready" && !wheel.inputLocked
      ? `${GESTURE_MODES[gestureMode].label} : attrape la roue pour essayer ce geste.` : undefined}
    nextLabel="Relancer" onNext={() => { exchange.reset(); wheel.reset(); timeline.beginRound(); }} nextDisabled={busy || exchange.choosing}
    onClose={() => { window.location.href = "/"; }}
    launchSettings={<><label>Mini-jeu au geste<select value={gestureMode} onChange={event => changeGestureMode(event.target.value)}
      disabled={busy || exchange.choosing || Boolean(wheel.renderError) || wheel.stageStatus.phase !== "ready"}>
      {Object.entries(GESTURE_MODES).map(([id, mode]) => <option key={id} value={id}>{mode.label}</option>)}
    </select></label><p>{GESTURE_MODES[gestureMode].instructions}</p>
      <p>Ces variantes se jouent directement sur la roue.{!wheel.gestureOnly && " Le bouton conserve la jauge de puissance."}</p></>}
    settings={<>
      {onStartTournament && <button type="button" disabled={busy} onClick={onStartTournament}>Simuler les quatre lancers et la finale</button>}
      <p><a href="?edition=1">Ouvrir les outils de réalisation</a></p>
      <p><a href="/dev/infortune-finale/index.html">Essayer la finale seule</a></p>
    </>}>
    <ExchangeWorkshopChoice preview={exchange} contestants={casting.contestants} wheel={wheel} />
  </InfortuneWheelPlay>;
}
