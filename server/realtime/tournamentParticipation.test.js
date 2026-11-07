import test from 'node:test';
import assert from 'node:assert/strict';
import { readTournamentParticipation } from './tournamentParticipation.js';
import { registerSessionHandlers } from './registerSessionHandlers.js';

function room() { return { id: 'room', players: new Map(), tournament: { id: 't1', totals: new Map(), infortune: { banks: new Map([['user:1', 0]]) } } }; }
test('a returning account retains participation even at zero bank, after disconnect and on another device', () => {
  const live = room();
  assert.equal(readTournamentParticipation(live, { userId: 1, installId: 'new-device' }).participated, true);
  assert.equal(readTournamentParticipation(live, { userId: 2 }).participated, false);
  live.tournament = { id: 't2', totals: new Map() };
  assert.equal(readTournamentParticipation(live, { userId: 1 }).participated, false);
});
test('the active finale retains participation after scoring resets the tournament; an old finale does not', () => {
  const live = room(); live.tournament = { id: 'next' };
  live.infortuneFinale = { publicSnapshot: () => ({ podiumAt: 200, ranking: [{ userId: 1 }, { userId: 3, isBot: true }] }) };
  assert.equal(readTournamentParticipation(live, { userId: 1 }, 100).participated, true);
  assert.equal(readTournamentParticipation(live, { userId: 1 }, 201).participated, false);
  assert.equal(readTournamentParticipation(live, { userId: 3 }, 100).participated, false);
});

test('a player returning during their first round resumes even before the first points or wheel credit', () => {
  const live = room(); live.players.set('old-socket', { userId: 2, nick: 'Alice' });
  live.currentRound = { id: 42 }; live.submissions = new Map([[42, new Map([['Alice', { words: new Set(), score: 0 }]])]]);
  assert.equal(readTournamentParticipation(live, { userId: 2 }).participated, true);
  assert.equal(readTournamentParticipation(live, { userId: 3 }).participated, false);
});
test('the participation query uses the authenticated identity, never a supplied account, and does not join', () => {
  const handlers = {}, live = room(); let identity = { userId: 2 }, answer;
  registerSessionHandlers({ on: (event, fn) => { handlers[event] = fn; } }, {
    requireSocketPlayerIdentity: () => identity, getRoom: id => id === live.id ? live : null,
  });
  handlers['tournament:participation']({ roomId: 'room', userId: 1 }, value => { answer = value; });
  assert.equal(answer.participated, false);
  identity = { userId: 1 };
  handlers['tournament:participation']({ roomId: 'room' }, value => { answer = value; });
  assert.equal(answer.participated, true); assert.equal(live.players.size, 0);
});
