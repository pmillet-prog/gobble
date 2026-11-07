import React from 'react';
import InfortuneGameSurface from './InfortuneGameSurface.jsx';
import LeaderLimousine from './LeaderLimousine.jsx';
import { getLeaderPortraits, releaseLeaderPortraits } from '../../features/infortune/prepareLeaderPortraits.js';
import './infortuneLeaderWalk.css';
import { LEADER_LAYERS, LEADER_LIMOUSINE } from '../../features/infortune/leaderSceneAssets.js';

export function usePreloadLeaderScene(cue, preparing = false) {
  React.useEffect(() => {
    if (!preparing && !cue) return;
    for (const url of [...Object.values(LEADER_LAYERS), LEADER_LIMOUSINE]) { const image = new Image(); image.src = url; }
  }, [preparing, Boolean(cue)]);
  React.useEffect(() => {
    if (!cue) return;
    getLeaderPortraits(cue);
    return () => releaseLeaderPortraits(cue.id);
  }, [cue?.id]);
}

// This view receives identities and a shared clock, never the leaders' amounts.
export default function InfortuneLeaderWalk({ cue, bank, onClose }) {
  const [elapsed] = React.useState(() => Math.max(0, Date.now() - cue.startsAt));
  const duration = cue.endsAt - cue.startsAt, count = cue.leaders.length;
  const portraits = React.useMemo(() => getLeaderPortraits(cue), [cue.id]);
  const frames = React.useSyncExternalStore(portraits.subscribe, portraits.getSnapshot, portraits.getSnapshot);
  const names = cue.leaders.map(player => player.nick).join(', ');
  return <InfortuneGameSurface subtitle={`Après le lancer ${cue.roundNumber} / 4`} bank={bank} onClose={onClose}>
    <section className="wheel-leaders"
      aria-label={count ? `Plus grosse cagnotte : ${names}. Montants gardés secrets.` : 'Fin des lancers de roue'}
      style={{ '--walk-delay': `${-elapsed}ms`, '--walk-duration': `${duration}ms` }}>
      <div className="wheel-leaders__scenery" aria-hidden="true">{Object.entries(LEADER_LAYERS).map(([layer, url]) =>
        <div key={layer} className={`wheel-leaders__layer wheel-leaders__layer--${layer}`} style={{ '--layer-image': `url("${url}")` }} />)}</div>
      <header className="wheel-leaders__title">
        <span>LA PROMENADE DES CAGNOTTES</span>
        <h2>{count ? 'Les poches bien remplies\u00a0!' : 'La course continue\u00a0!'}</h2>
        <p>{count > 1 ? `${count} joueurs en tête, ex æquo` : count ? 'La plus grosse cagnotte du salon' : 'Tout reste à jouer'}</p>
      </header>
      <LeaderLimousine leaders={cue.leaders} frames={frames} elapsed={elapsed} duration={duration} />
      <footer className="wheel-leaders__footer"><strong>Un indice… pas un montant !</strong>
        <p>Garde ces visages en tête pour les échanges…</p>
        <div className="wheel-leaders__progress" aria-hidden="true"><i /></div>
      </footer>
    </section>
  </InfortuneGameSurface>;
}
