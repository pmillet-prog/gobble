import React from 'react';
import InfortuneCountdown from './InfortuneCountdown.jsx';
import AvatarThumbnail from '../../features/avatar/AvatarThumbnail.jsx';
import { wheelProgress } from '../../features/infortune/wheelProgress.js';

export default function InfortuneWheelProgress({ economy, groups, serverOffset = 0, spinUntil, stage, selfId }) {
  const [, tick] = React.useReducer(value => value + 1, 0);
  React.useEffect(() => {
    if (!economy?.exchangeEnabled) return;
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [economy?.exchangeEnabled]);
  if (!economy) return null;
  const progress = wheelProgress(economy, groups, Date.now() + serverOffset);
  const rows = progress.rows.filter(row => row.status !== 'ready');
  const labels = { pending: 'À lancer', spinning: 'Roue en cours', returning: 'Retour au plateau',
    choosing: 'Choisit un échange', chosen: 'Échange confirmé', declined: 'Ne souhaite pas échanger' };
  return <section className="infortune-play__progress" aria-label="Suivi des lancers">
    <div className="infortune-play__progress-summary">
      <strong>Dans le salon</strong>
      <span><b>{progress.pending}</b> à lancer</span>
      <span><b>{progress.spinning + progress.returning}</b> en cours</span>
      {economy.exchangeEnabled && <span><b>{progress.choosing}</b> choix d’échange</span>}
      {economy.pendingResults !== 0 && <InfortuneCountdown until={spinUntil} label="Lancers :" />}
    </div>
    {rows.length > 0 && <div className="infortune-play__progress-list" tabIndex={0} aria-label="Suivi de tous les joueurs">
      {rows.map(row => <div key={row.id} className="infortune-play__progress-player" data-status={row.status} data-player-id={row.id}>
        <AvatarThumbnail userId={row.userId} size={28} showPlaceholder />
        <div><strong title={`${row.nick} · plateau ${row.group}`}>{row.nick}{row.id === selfId ? ' (toi)' : ''}</strong>
          <span>{row.exchange && row.status === 'returning' ? 'Échange · retour au plateau' : labels[row.status]}</span></div>
        {row.status === 'choosing' && row.seconds !== null && <b className="infortune-play__choice-clock" role="timer" aria-label={`${row.nick} : ${row.seconds} secondes pour choisir`}>{row.seconds} s</b>}
      </div>)}
    </div>}
    <p className="infortune-play__explanation">{progress.pending || progress.spinning || progress.returning
      ? economy.exchangeEnabled ? 'Tu peux choisir dès ton retour. Les 10 secondes de choix démarrent quand ton plateau est prêt.' : 'Les cagnottes se mettent à jour. La suite commence dès que tous les lancers sont terminés.'
      : progress.choosing ? 'Les derniers choix sont en cours. Chaque plateau révèle ensuite ses cagnottes.'
      : stage === 'settled' ? 'Les choix sont terminés. Les échanges sont en cours.' : 'Tout le monde a terminé. La suite arrive…'}</p>
  </section>;
}
