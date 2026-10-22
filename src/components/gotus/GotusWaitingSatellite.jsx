import React from "react";
import { createPortal } from "react-dom";
import "./gotusWaiting.css";

const GotusPlayground = React.lazy(() => import("./GotusPlayground.jsx"));

export default function GotusWaitingSatellite({ waiting, darkMode, compact }) {
  const { state, controller } = waiting;
  if (!state.session && !state.dialog) return null;
  const reminder = state.dialog?.kind === "reminder";
  return createPortal(<div className={`gotus-waiting${darkMode ? " gotus-waiting--dark" : ""}`}>
    {state.session ? <div className={`gotus-waiting__game${compact ? " gotus-waiting__game--compact" : ""}`} role="dialog" aria-modal="true" aria-label="Entraînement Gotus">
      <React.Suspense fallback={<p>Ouverture de Gotus…</p>}><GotusPlayground mode="training" active roundId={state.session.sessionId}
        darkMode={darkMode} compact={compact} onClose={controller.close} onJoinLive={controller.joinLive} /></React.Suspense>
    </div> : null}
    {state.dialog ? <div className="gotus-waiting__shade"><section className="gotus-waiting__dialog" role="dialog" aria-modal="true"
      aria-labelledby="gotus-waiting-title">
      <img src="/gotus/gotus-logo.webp" alt="Gotus" />
      <h2 id="gotus-waiting-title">{reminder ? "Le prochain mini-tournoi va commencer !" : "Une petite partie pour patienter ?"}</h2>
      <p>{reminder ? "Le live prépare un nouveau départ. Vous pouvez rejoindre les joueurs ou continuer votre Gotus." : state.dialog.message}</p>
      {reminder ? <label><input type="checkbox" checked={state.remindersMuted} onChange={event => controller.muteReminders(event.target.checked)} /> Ne plus rappeler pendant cette session</label> : <p className="gotus-waiting__note">Entraînement libre, sans gobblars ni progression du trophée.</p>}
      <div className="gotus-waiting__actions">
        <button type="button" disabled={state.busy} onClick={reminder ? controller.joinLive : controller.startTraining}>{reminder ? "Rejoindre le live" : "Jouer à Gotus"}</button>
        <button type="button" disabled={state.busy} onClick={reminder ? controller.dismissDialog : controller.enterAnyway}>{reminder ? "Continuer Gotus" : "Entrer dans le tournoi quand même"}</button>
        {!reminder ? <button type="button" onClick={controller.dismissDialog}>Retour</button> : null}
      </div>
    </section></div> : null}
  </div>, document.body);
}
