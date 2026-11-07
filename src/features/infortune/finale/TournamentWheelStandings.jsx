import React from 'react';
import TournamentRankingCard from '../../../components/ranking/TournamentRankingCard.jsx';
import { useFeatureRuntime, useFeatureSelector } from '../../../app/react/useFeatureRuntime.js';

const clock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const subscribeNone = () => () => {};
export default function TournamentWheelStandings({ finale, controller, seconds, selfNick }) {
  const preferences = useFeatureRuntime('preferences');
  const overlays = useFeatureRuntime('overlays');
  const darkMode = useFeatureSelector(preferences, state => !!state.themeApplied?.darkMode);
  const outcome = React.useSyncExternalStore(controller?.store.subscribe || subscribeNone,
    () => controller?.store.getState().outcome || null, () => null);
  const answer = outcome?.answer || (finale.closed ? finale.answer : null);
  const clue = outcome?.clue || (finale.closed ? finale.clue : null);
  const self = finale.ranking.find(entry => entry.nick === selfNick);
  const ranking = React.useMemo(() => finale.ranking
    .map(entry => ({ ...entry, score: entry.points, rightLabel: `${entry.points} pts${entry.wheelPoints ? ` · +${entry.wheelPoints}` : !finale.closed && entry.wheelStatus === 'playing' ? ' · En finale…' : ''}` })),
  [finale.ranking, finale.closed]);
  return <div className="wheel-final-standings" data-closed={finale.closed}>
    <header><h1>{finale.closed && <span className="wheel-final-standings__trophy" aria-hidden="true">🏆 </span>}{finale.closed ? 'Classement final' : 'Classement provisoire'}</h1>
      <p>{finale.closed ? 'Le tournoi est terminé. Place au podium !' : `${finale.remaining} joueur${finale.remaining > 1 ? 's' : ''} encore en finale · ${clock(seconds)}`}</p>
      {self && <p className="wheel-final-standings__self">{outcome?.correct ? `Bonne réponse ! +${outcome.points} points · ` : outcome ? 'Ta finale est terminée · ' : ''}
        <strong>{self.pos}{self.pos === 1 ? 'er' : 'e'} · {self.points} points</strong>
        {outcome?.correct && outcome.gobblars > 0 ? ` · +${outcome.gobblars} gobblars` : ''}</p>}
      {answer && <p className="wheel-final-standings__answer">Le mot à trouver : <button type="button"
        aria-label={`Voir la définition de ${answer}`} onClick={() => overlays.openDefinition(answer, {
          questionContext: clue ? { label: 'Question de la finale', text: clue } : null,
        })}>{answer}</button>
        <small> · définition</small></p>}
    </header>
    <div className="wheel-final-standings__list" aria-label="Classement du tournoi">
      <TournamentRankingCard fullRanking={ranking} selfNick={selfNick} darkMode={darkMode} constrainHeight scrollable
        animateReorderTick={finale.revision} showAvatars />
    </div>
  </div>;
}
