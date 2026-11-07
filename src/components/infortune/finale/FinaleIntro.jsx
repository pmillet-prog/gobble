import React from 'react';
import hostUrl from '../../../../dev/infortune-perspective/assets/christian-morin-v2.png';
import { INFORTUNE_FINALE_INTRO_MS, INFORTUNE_FINALE_VICTORY_POINTS } from '../../../../shared/infortuneTournamentFinale.js';
import './finaleIntro.css';

export function preloadFinaleIntro() {
  const portrait = new Image();
  portrait.src = hostUrl;
}

// The live feature owns the deadline. A late arrival joins the current cue;
// rerenders and reconnects never restart the four-second presentation.
export default function FinaleIntro({ elapsedMs = 0, durationMs = INFORTUNE_FINALE_INTRO_MS }) {
  const [offset] = React.useState(() => Math.max(0, elapsedMs));
  return <section className="wheel-finale-intro" aria-label="La finale avec Christian Mauresque"
    style={{ '--intro-offset': `${-offset}ms`, '--intro-duration': `${durationMs}ms` }}>
    <div className="wheel-finale-intro__lights" aria-hidden="true"><i /><i /></div>
    <div className="wheel-finale-intro__orbit" aria-hidden="true" />
    <div className="wheel-finale-intro__stage">
      <figure className="wheel-finale-intro__host">
        <img src={hostUrl} alt="" width="1280" height="1280" decoding="async" />
        <figcaption><span>Avec</span> Christian Mauresque</figcaption>
      </figure>
      <div className="wheel-finale-intro__copy">
        <p className="wheel-finale-intro__eyebrow">La roue de l’infortune</p>
        <h1><span>La</span> finale</h1>
        <p className="wheel-finale-intro__line">Ta cagnotte entre en jeu.</p>
        <div className="wheel-finale-intro__stakes"><strong>+{INFORTUNE_FINALE_VICTORY_POINTS} <span>points</span></strong><span>2 minutes<br />Une seule réponse</span></div>
      </div>
    </div>
    <div className="wheel-finale-intro__progress" aria-hidden="true"><span /></div>
  </section>;
}

// Local trials use the same presentation before mounting the board and its
// theme reveal. The live satellite uses the server clock instead of this timer.
export function FinaleIntroSequence({ children }) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const timer = setTimeout(() => setReady(true), INFORTUNE_FINALE_INTRO_MS);
    return () => clearTimeout(timer);
  }, []);
  return ready ? children : <FinaleIntro />;
}
