import React from 'react';
import './gobbleRewardAnimation.css';

export default function GobbleRewardAnimation({ reward, positions }) {
  if (!reward || reward.stage === 'pending') return null;
  const label = `${reward.gobbles} Gobble${reward.gobbles > 1 ? 's' : ''}`;
  return <div key={reward.id} className={`gobble-reward gobble-reward--${reward.stage}`} data-reward-stage={reward.stage}>
    <p className="sr-only" role="status">{label} : {reward.wallet > 0 ? `${reward.wallet} gobblars` : ''}{reward.wallet > 0 && reward.bank > 0 ? ' et ' : ''}{reward.bank > 0 ? `${reward.bank} euros de cagnotte` : ''}.</p>
    <div className="gobble-reward__announcement" aria-hidden="true"><small>Récompenses de la manche</small><strong>{label} !</strong></div>
    {['wallet', 'bank'].filter(kind => reward[kind] > 0).map(kind => {
      const target = positions[kind];
      return <div key={kind} aria-hidden="true" className={`gobble-reward__gain gobble-reward__gain--${kind}`}
        style={{ '--target-x': target ? `${target.x + target.width / 2}px` : kind === 'wallet' ? '25vw' : '75vw',
          '--target-y': target ? `${target.y + target.height / 2}px` : '30px' }}>
        <img src={`/ui/currency/${kind === 'wallet' ? 'gobblar-cartoon-v2' : 'euro-cartoon-v1'}.webp`} alt="" />
        <strong>+{reward[kind].toLocaleString('fr-FR')}</strong>
        <small>{kind === 'wallet' ? 'gobblars' : 'cagnotte'}</small>
      </div>;
    })}
  </div>;
}
