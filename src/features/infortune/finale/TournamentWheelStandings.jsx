import React from 'react';
import AnimatedFinaleRanking from './AnimatedFinaleRanking.jsx';
import { useFeatureRuntime } from '../../../app/react/useFeatureRuntime.js';

const clock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const subscribeNone = () => () => {};
export default function TournamentWheelStandings({ finale, controller, seconds, selfNick }) {
  const overlays = useFeatureRuntime('overlays');
  const [settled, setSettled] = React.useState(true);
  const outcome = React.useSyncExternalStore(controller?.store.subscribe || subscribeNone,
    () => controller?.store.getState().outcome || null, () => null);
  const answer = outcome?.answer || (finale.closed ? finale.answer : null);
  const clue = outcome?.clue || (finale.closed ? finale.clue : null);
  const self = finale.ranking.find(entry => entry.nick === selfNick);
  const fixed = finale.closed && settled;
  return <div className="wheel-final-standings" data-closed={fixed}>
    <header className="wheel-final-standings__hero">
      <div className="wheel-final-standings__heading"><span className="wheel-final-standings__trophy" aria-hidden="true">🏆</span><div>
        <p className="wheel-final-standings__eyebrow">Mini-tournoi · le grand classement</p>
        <h1>{fixed ? 'Les jeux sont faits !' : 'Tout peut encore changer'}</h1>
      </div></div>
      <div className="wheel-final-standings__deadline" data-urgent={!finale.closed && seconds <= 15}>
        <div><strong>{fixed ? 'Classement définitif' : finale.closed ? 'Derniers points en cours…' : seconds ? 'Classement figé dans' : 'Validation des derniers résultats…'}</strong>
          <span>{fixed ? 'Place au podium !' : `${finale.remaining} joueur${finale.remaining > 1 ? 's' : ''} encore en finale`}</span></div>
        <b role="timer" aria-label={`${seconds} secondes avant la fin de la finale`}>{finale.closed ? '✓' : clock(seconds)}</b>
      </div>
      <div className="wheel-final-standings__timebar" aria-hidden="true"><i style={{ transform: `scaleX(${finale.closed ? 0 : Math.min(1, seconds * 1000 / (finale.deadlineAt - finale.startsAt))})` }} /></div>
      {self && <p className="wheel-final-standings__self">{outcome?.correct ? 'Finale réussie · tes 10 points sont inclus dans ton total' : outcome ? 'Ta finale est terminée' : 'Tu suis la finale en direct'}
        {outcome?.correct && outcome.gobblars > 0 ? ` · +${outcome.gobblars} gobblars` : ''}</p>}
      {answer && <p className="wheel-final-standings__answer">Le mot à trouver : <button type="button"
        aria-label={`Voir la définition de ${answer}`} onClick={() => overlays.openDefinition(answer, {
          questionContext: clue ? { label: 'Question de la finale', text: clue } : null,
        })}>{answer}</button>
        <small> · définition</small></p>}
    </header>
    <div className="wheel-final-standings__list" aria-label="Classement du tournoi">
      <AnimatedFinaleRanking key={finale.tournamentId} ranking={finale.ranking} selfNick={selfNick} closed={finale.closed} onSettledChange={setSettled} />
    </div>
  </div>;
}
