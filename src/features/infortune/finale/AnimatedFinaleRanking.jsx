import React from 'react';
import AvatarThumbnail from '../../avatar/AvatarThumbnail.jsx';
import PlayerProfileLink from '../../../components/profile/PlayerProfileLink.jsx';
import InfortuneWheelEmblem from '../../../components/infortune/InfortuneWheelEmblem.jsx';
import { createStandingsPresentation, standingKey, STANDINGS_TIMING } from './createStandingsPresentation.js';
import './animatedFinaleRanking.css';

function Score({ points, award, phase }) {
  const node = React.useRef(null);
  React.useLayoutEffect(() => {
    let frame;
    const display = value => { if (node.current) node.current.textContent = value.toLocaleString('fr-FR'); };
    if (award && phase === 'count') {
      const start = performance.now();
      const tick = time => {
        const progress = Math.min(1, (time - start) / STANDINGS_TIMING.count);
        display(Math.round(award.from + (award.to - award.from) * (1 - (1 - progress) ** 3)));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    } else display(award && phase === 'cue' ? award.from : points);
    return () => cancelAnimationFrame(frame);
  }, [points, award, phase]);
  return <span className="finale-ranking__score"><b ref={node}>{points}</b><small>points</small></span>;
}

export default function AnimatedFinaleRanking({ ranking, selfNick, closed, onSettledChange }) {
  const [presentation] = React.useState(() => createStandingsPresentation(ranking));
  const state = React.useSyncExternalStore(presentation.store.subscribe, presentation.store.getState, presentation.store.getState);
  React.useLayoutEffect(() => { presentation.update(ranking); }, [presentation, ranking]);
  React.useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const refresh = () => presentation.setInstant(document.hidden || motion.matches);
    refresh(); document.addEventListener('visibilitychange', refresh); motion.addEventListener('change', refresh);
    return () => { presentation.dispose(); document.removeEventListener('visibilitychange', refresh); motion.removeEventListener('change', refresh); };
  }, [presentation]);
  React.useEffect(() => { onSettledChange(state.phase === 'idle'); }, [state.phase, onSettledChange]);
  const wins = state.rows.filter(row => state.awards[standingKey(row)]);
  return <>
    <div className="finale-ranking__legend"><span>Joueur</span><span>Total du tournoi</span></div>
    <div className="finale-ranking__scroll" tabIndex={0} aria-label="Classement du tournoi, faire défiler pour voir tous les joueurs">
      <ol className="finale-ranking" data-stage={state.phase} data-instant={state.instant} style={{ height: state.rows.length * 66 }}>
        {state.rows.map((entry, index) => {
          const key = standingKey(entry), award = state.awards[key];
          const status = award ? 'Bonne réponse !' : entry.wheelStatus === 'won' ? 'Finale réussie · bonus inclus' : !closed && entry.wheelStatus === 'playing' ? 'Cherche encore…' : entry.isBot ? 'Tournoi terminé' : 'Finale terminée';
          return <li key={key} data-ranking-row={key} data-self={entry.nick === selfNick} data-award={!!award} data-rank={index + 1}
            aria-posinset={index + 1} aria-setsize={state.rows.length} style={{ transform: `translateY(${index * 66}px)` }}>
            <span className="finale-ranking__place">{index < 3 ? <span aria-hidden="true">{['🥇', '🥈', '🥉'][index]}</span> : index + 1}<span className="sr-only">{index < 3 ? `${index + 1}e` : ''}</span></span>
            <AvatarThumbnail userId={entry.userId} size={38} showPlaceholder />
            <span className="finale-ranking__player"><span className="finale-ranking__name"><PlayerProfileLink entry={entry} className="finale-ranking__nickname" />{entry.nick === selfNick && <em>toi</em>}
              {(entry.wheelStatus === 'won' || award) && <span className="finale-ranking__wheel-badge" role="img" aria-label="Finale de la roue réussie" title="Finale de la roue réussie"><InfortuneWheelEmblem size={22} /></span>}
            </span><small data-playing={!closed && entry.wheelStatus === 'playing' && !award}>{status}</small></span>
            <div className="finale-ranking__total">
              {award && <span key={state.sequence} className="finale-ranking__bonus" aria-label={`${award.gain} points gagnés`}>+{award.gain}</span>}
              <Score points={entry.points} award={award} phase={state.phase} />
            </div>
          </li>;
        })}
      </ol>
    </div>
    <p className="finale-ranking__live" role="status" aria-live="polite">{wins.length ? `${wins.map(row => row.nick).join(', ')} : ${state.phase === 'cue' ? 'bonne réponse !' : state.phase === 'count' ? 'ajout du bonus au total…' : 'bonus inclus dans le total.'}` : closed ? 'Scores définitifs · bonus de finale inclus' : 'Une bonne réponse ajoute 10 points au total.'}</p>
  </>;
}
