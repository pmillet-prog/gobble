import React from "react";
import InfortuneGameSurface from "./InfortuneGameSurface.jsx";
import InfortuneWheelSettings from "./InfortuneWheelSettings.jsx";
import { WheelCanvas } from "../../../dev/infortune-perspective/WheelCanvas.jsx";
import { LaunchFeedback } from "../../../dev/infortune-perspective/LaunchFeedback.jsx";
import { SkillShotOverlay } from "../../../dev/infortune-perspective/SkillShotOverlay.jsx";
import { LaunchButton } from "./LaunchButton.jsx";
import InfortuneCountdown from "./InfortuneCountdown.jsx";
import InfortuneWheelLoading from "./InfortuneWheelLoading.jsx";
import WheelResultExit from './WheelResultExit.jsx';
import WheelLaunchReward, { useWheelLaunchReward } from './WheelLaunchReward.jsx';
import "./infortuneWheelPlay.css";

export default function InfortuneWheelPlay({ wheel, sound, subtitle, bank, launchBank, onLaunchLand, until, status, progress, exchanging,
  nextLabel, onNext, nextDisabled, onClose, closeLabel, launchSettings, settings, children }) {
  const [menu, setMenu] = React.useState(false);
  const ready = wheel.stageStatus.phase === "ready" && !wheel.renderError;
  const phase = wheel.view.phase, busy = !["ready", "finished"].includes(phase);
  const payout = wheel.resultExit.state;
  const launchReward = useWheelLaunchReward(wheel, onLaunchLand);
  const shownBank = React.useRef(bank);
  if (!['spinning', 'finished'].includes(phase) || ['landed', 'done'].includes(payout.phase)) shownBank.current = bank;
  else if (launchReward.landed && Number.isFinite(launchBank)) shownBank.current = launchBank;
  const showActions = Boolean(onNext || !exchanging && phase !== 'finished' && (until || !wheel.gestureOnly));
  return <InfortuneGameSurface subtitle={subtitle} bank={shownBank.current} onClose={onClose} closeLabel={closeLabel}
    actions={<>
      <button type="button" aria-label="Réglages de la roue" onClick={() => setMenu(true)}>⚙</button></>}>
    <div className="infortune-play" data-exchanging={Boolean(exchanging)}>
      <div className="infortune-play__stage">
        <div className="infortune-play__visual"><div ref={wheel.scene} className="infortune-play__scene" data-input-locked={wheel.inputLocked} data-exchanging={Boolean(exchanging)} {...wheel.wheelEvents}>
          <WheelCanvas wheel={wheel} label="Plateau de la roue. Glisse sur la roue pour lancer." />
          <LaunchFeedback view={wheel.view} gauges={wheel.gauges} /><SkillShotOverlay wheel={wheel} />
          {!ready && <div className="infortune-play__notice">{wheel.renderError ? <p role="alert">Le plateau n’a pas pu s’afficher.</p> : <InfortuneWheelLoading />}
            {!wheel.flat && <button type="button" onClick={() => wheel.performance.choose("flat")}>Continuer en 2D</button>}
            {wheel.renderError && onClose && <button type="button" onClick={onClose}>{closeLabel || "Quitter cet essai"}</button>}</div>}
          {ready && sound && !sound.ready && <div className="infortune-play__notice">{sound.status === "blocked"
            ? <button type="button" onClick={sound.unlock}>Entrer sur le plateau</button> : <InfortuneWheelLoading label="Le plateau se prépare…" />}</div>}
        </div></div>
        {children && <div className="infortune-play__overlay">{children}</div>}
      </div>
      <footer className="infortune-play__controls" data-actions={showActions}>
        <div className="infortune-play__status"><p role="status">{status || (phase === "finished" ? wheel.view.result?.label : phase === "spinning" ? "Le dernier taquet décidera…" : wheel.inputLocked ? "Le plateau se prépare…" : wheel.gestureOnly ? "Glisse sur le bord de la roue, puis relâche pour lancer." : "Glisse sur la roue ou lance au bouton.")}</p>
          {progress}</div>
        {showActions && <div className="infortune-play__buttons"><InfortuneCountdown until={until} label="Lancer auto" />
          {phase !== "finished" ? <LaunchButton className="infortune-play__primary" wheel={wheel}>{phase === "aiming" ? "Lancer !" : phase === "spinning" ? "La roue tourne…" : "Lancer la roue"}</LaunchButton>
            : onNext && <button type="button" className="infortune-play__primary" disabled={nextDisabled || payout.phase !== 'done'} onClick={onNext}>{nextLabel || "Continuer"}</button>}
        </div>}
      </footer>
    </div>
    {menu && <InfortuneWheelSettings wheel={wheel} busy={busy} launchSettings={launchSettings} settings={settings} onClose={() => setMenu(false)} />}
    <WheelResultExit state={payout} />
    <WheelLaunchReward flight={launchReward.flight} />
  </InfortuneGameSurface>;
}
