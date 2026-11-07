import { infortunePlayerKey } from '../../shared/infortunePlateaus.js';

// A zero bank still records participation (including after a bankruptcy).
// Read only: checking from the home screen must never join or take over a room.
export function readTournamentParticipation(room, identity, now = Date.now()) {
  const key = infortunePlayerKey(identity);
  if (!room || !key) return { ok: false, error: 'invalid_room' };
  const player = [...room.players.values()].find(value => infortunePlayerKey(value) === key);
  const finale = room.infortuneFinale?.publicSnapshot();
  const participated = room.tournament?.infortune?.banks.has(key)
    || player && room.tournament?.totals?.has(player.nick)
    || player && room.currentRound && room.submissions?.get(room.currentRound.id)?.has(player.nick)
    || finale && now < finale.podiumAt && finale.ranking.some(entry => !entry.isBot && infortunePlayerKey(entry) === key);
  return { ok: true, roomId: room.id, tournamentId: room.tournament?.id ?? null, participated: !!participated };
}
