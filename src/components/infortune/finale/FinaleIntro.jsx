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
    <div className="wheel-finale-intro__rays" aria-hidden="true" />
    <div className="wheel-finale-intro__stage">
      <figure className="wheel-finale-intro__host">
        <img src={hostUrl} alt="" width="1280" height="1280" decoding="async" />
        <figcaption><span>Avec</span> Christian Mauresque</figcaption>
      </figure>
      <div className="wheel-finale-intro__copy">
        <p className="wheel-finale-intro__eyebrow">La roue de l’infortune</p>
        <p className="wheel-finale-intro__stamp">Dernier acte</p>
        <h1 aria-label="La finale"><span className="wheel-finale-intro__la">La</span><span className="wheel-finale-intro__letters" aria-hidden="true">{'FINALE'.split('').map((letter, i) => <b key={i} style={{ '--letter-index': i }}>{letter}</b>)}</span></h1>
        <p className="wheel-finale-intro__line">Dévoile la question.<br /><strong>Propose ta réponse en un mot.</strong></p>
        <div className="wheel-finale-intro__stakes"><strong>+{INFORTUNE_FINALE_VICTORY_POINTS} <span>points</span></strong><span>Ta cagnotte → gobblars<br />si tu trouves la réponse</span></div>
        <p className="wheel-finale-intro__countdown" role="timer">2 minutes pour jouer · départ dans {Math.max(1, Math.ceil((durationMs - elapsedMs) / 1000))}</p>
      </div>
    </div>
    <div className="wheel-finale-intro__progress" aria-hidden="true"><span /></div>
  </section>;
}

// Local trials use the same presentation before mounting the board and its
// theme reveal. The live satellite uses the server clock instead of this timer.
export function FinaleIntroSequence({ children }) {
  const [ready, setReady] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    const start = Date.now();
    const ticker = setInterval(() => setElapsed(Date.now() - start), 250);
    const timer = setTimeout(() => { clearInterval(ticker); setReady(true); }, INFORTUNE_FINALE_INTRO_MS);
    return () => { clearTimeout(timer); clearInterval(ticker); };
  }, []);
  return ready ? children : <FinaleIntro elapsedMs={elapsed} />;
}
