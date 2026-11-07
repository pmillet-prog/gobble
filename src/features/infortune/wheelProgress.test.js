import test from 'node:test';
import assert from 'node:assert/strict';
import { wheelProgress } from './wheelProgress.js';

test('the room dashboard includes other trios and uses individual server deadlines without exposing balances', () => {
  const groups = Array.from({ length: 6 }, (_, group) => ({ id: `g${group}`, members: Array.from({ length: 3 }, (_, position) => ({
    id: `user:${group * 3 + position + 1}`, userId: group * 3 + position + 1, nick: `Joueur ${group * 3 + position + 1}`, isBot: false,
  })) }));
  const members = Object.fromEntries(groups.flatMap(group => group.members.map(player => [player.id, { spin: 'pending', launched: false }])));
  members['user:1'] = { spin: 'pending', launched: true };
  members['user:4'] = { spin: 'done', presented: false, needsExchange: true };
  members['user:7'] = { spin: 'done', presented: true, needsExchange: true, choiceUntil: 20_000, bank: 999999 };
  members['user:16'] = { spin: 'done', presented: true, needsExchange: true, choiceUntil: 23_000 };
  members['user:17'] = { spin: 'done', presented: true, needsExchange: true, choiceMade: true, target: null };
  const state = wheelProgress({ exchangeEnabled: true, members }, groups, 15_000);
  assert.equal(state.rows.length, 18);
  assert.equal(state.pending, 13); assert.equal(state.spinning, 1); assert.equal(state.returning, 1); assert.equal(state.choosing, 2);
  assert.equal(state.rows.find(row => row.id === 'user:7').seconds, 5);
  assert.equal(state.rows.find(row => row.id === 'user:16').seconds, 8);
  assert.equal(state.rows.find(row => row.id === 'user:17').status, 'declined');
  assert.ok(!JSON.stringify(state).includes('999999'));
  const first = wheelProgress({ exchangeEnabled: false, members }, groups, 15_000);
  assert.ok(first.rows.every(row => !row.exchange)); assert.equal(first.choosing, 0);
});
