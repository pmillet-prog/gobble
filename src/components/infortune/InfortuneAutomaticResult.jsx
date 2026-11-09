import React from 'react';
import InfortuneGameSurface from './InfortuneGameSurface.jsx';
import InfortuneWheelProgress from './InfortuneWheelProgress.jsx';
import InfortuneCountdown from './InfortuneCountdown.jsx';
import AvatarThumbnail from '../../features/avatar/AvatarThumbnail.jsx';
import { PRESENTER_IDENTITIES } from '../../../shared/presenterIdentities.js';
import InfortuneExchangeAnimation from './InfortuneExchangeAnimation.jsx';

export default function InfortuneAutomaticResult({ state, feature }) {
  const self = state.economy?.members[state.plateau?.self.id], result = self?.result || state.result;
  return <InfortuneGameSurface title={`Lancer ${state.economy?.roundNumber || 4}/4`} bank={self?.bank}>
    <div className="infortune-automatic-result">
      <h2>Ta roue a été lancée automatiquement</h2>
      <strong>{result?.sector?.label}</strong>
      <p>Ta cagnotte est à jour : {self?.bank?.toLocaleString('fr-FR')} €</p>
      {self?.choiceExpired && <p role="status">Le délai d’échange est écoulé : aucun échange n’a été demandé de ta part.</p>}
      {state.stage === 'exchange' && <section aria-label="Choisir un échange">
        <p>Avec qui souhaites-tu échanger ?</p>
        {state.choiceUntil ? <InfortuneCountdown until={state.choiceUntil} label="Pour choisir :" /> : <p>Tu peux déjà choisir. Le chrono démarrera quand ton plateau sera prêt.</p>}
        <div className="infortune-automatic-result__choices">{state.plateau.opponents.map(player => <button type="button" key={player.id} onClick={() => feature.chooseExchange(player.id)}>
          {player.isBot ? <img src={PRESENTER_IDENTITIES[player.presenterKey]?.buttonUrl} alt="" /> : <AvatarThumbnail userId={player.userId} size={52} showPlaceholder />}{player.nick}
        </button>)}</div>
        <button type="button" onClick={() => feature.chooseExchange(null)}>Garder ma cagnotte · ne pas échanger</button>
      </section>}
    </div>
    <InfortuneWheelProgress economy={state.economy} groups={state.groups} serverOffset={state.serverOffset} spinUntil={state.spinUntil} stage={state.stage} selfId={state.plateau?.self.id} />
    {state.exchangeReplay && <InfortuneExchangeAnimation exchange={state.exchangeReplay.activeExchange} index={state.exchangeReplay.index}
      total={state.exchangeReplay.exchanges.length} players={state.plateau.members} banks={state.exchangeReplay.banks} selfId={state.plateau.self.id} />}
  </InfortuneGameSurface>;
}
