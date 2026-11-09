import test from 'node:test';
import assert from 'node:assert/strict';
import { drawFinaleGiftLetters } from '../../shared/finaleGiftLetters.js';
import { createTournamentWheelFinale } from './tournamentFinale.js';
import { createLocalFinaleSession } from '../../dev/infortune-finale/createLocalFinaleSession.js';

test('three distinct present letters are offered equally, including a player with no bank', () => {
  const puzzle = { id: 'p', clue: 'Égarée, elle indique le nord.', answer: 'boussole' };
  const game = createTournamentWheelFinale({ roomId: 'r', tournamentId: 't', startsAt: 1000, now: () => 1000, random: () => 0,
    timers: { setTimeout() {}, clearTimeout() {} }, puzzle,
    ranking: [{ userId: 1, nick: 'A' }, { userId: 2, nick: 'B' }], ledger: { banks: new Map([['user:1', 5000], ['user:2', 0]]) } });
  const a = game.snapshot('user:1').snapshot, b = game.snapshot('user:2').snapshot;
  assert.deepEqual(a.freeLetters, ['E', 'G', 'A']); assert.deepEqual(b.freeLetters, a.freeLetters);
  assert.deepEqual(a.tiles, b.tiles); assert.equal(b.bank, 0); assert.equal(a.spent, 0); assert.equal(a.gobblarPurchases, 0);
  assert.ok(a.tiles.filter(t => ['E', 'É'].includes(t.character)).length >= 4);
  game.submit('user:1', { type: 'buy', letter: 'E' }); assert.equal(game.snapshot('user:1').snapshot.bank, 5000);
  assert.deepEqual(game.snapshot('user:1').snapshot.freeLetters, a.freeLetters);
  const trial = createLocalFinaleSession({ bank: 0, puzzle, random: () => 0 });
  assert.deepEqual(trial.snapshot().freeLetters, a.freeLetters);
  assert.deepEqual(drawFinaleGiftLetters('Éé A !', () => 0), ['E', 'A']);
  game.dispose();
});
