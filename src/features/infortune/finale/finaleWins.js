import { standingKey } from './createStandingsPresentation.js';

// Only a new public win is an announcement. Snapshots on entry/resume and
// repeated acknowledgements must never replay old cymbals.
export function newFinaleWins(previous, next) {
  if (!previous || previous.tournamentId !== next.tournamentId || next.revision <= previous.revision) return [];
  const old = new Map(previous.ranking.map(row => [standingKey(row), row]));
  return next.ranking.filter(row => row.wheelStatus === 'won' && old.has(standingKey(row)) && old.get(standingKey(row)).wheelStatus !== 'won');
}
