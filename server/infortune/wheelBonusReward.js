import { infortunePlayerKey } from '../../shared/infortunePlateaus.js';
import { INFORTUNE_BONUS_GOBBLARS } from '../../shared/infortuneWheel.js';

// Private account identities stay here, outside the public plateau snapshot.
export function createWheelBonusReward({ players, persistence, roomId, roundId, tournamentId,
  onAward, onError = error => console.warn('[infortune] bonus reward failed', error) }) {
  const accounts = new Map(players.filter(player => !player.isBot).map(player => [infortunePlayerKey(player), player]));
  const awarded = new Set();
  return (id, result) => {
    const player = accounts.get(id);
    if (!player?.installId || result?.sector?.kind !== 'bonus' || awarded.has(id)) return;
    awarded.add(id);
    return Promise.resolve().then(() => persistence.addGobblars({ installId: player.installId,
      amount: INFORTUNE_BONUS_GOBBLARS, reason: 'infortune_bonus',
      meta: { roomId, roundId, tournamentId, nick: player.nick } })).then(receipt => {
      if (!receipt || receipt.ok === false) throw new Error('bonus_payment_failed');
      onAward?.(player, { kind: 'infortune_bonus', roomId, roundId,
        amount: INFORTUNE_BONUS_GOBBLARS, balance: receipt.balance, ts: Date.now() });
    }).catch(onError);
  };
}
