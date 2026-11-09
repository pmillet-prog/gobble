import test from 'node:test';
import assert from 'node:assert/strict';
import { canPromptClientUpdate } from './clientUpdatePolicy.js';

const home = { navigation: { view: 'home' }, boot: { ready: true, overlayVisible: false },
  session: { isLoggedIn: false }, game: { phase: 'lobby' } };
const lobby = { ...home, navigation: { view: 'live' }, session: { isLoggedIn: true } };
test('update requires an idle home or lobby, never a round, its results, training or another activity', () => {
  assert.equal(canPromptClientUpdate(home), true); assert.equal(canPromptClientUpdate(lobby), true);
  for (const phase of ['intro', 'preparing', 'playing', 'results', 'intermission']) {
    assert.equal(canPromptClientUpdate({ ...lobby, game: { phase } }), false);
    assert.equal(canPromptClientUpdate(lobby, name => name === 'gameplaySession' ? { phase } : null), false);
  }
  for (const view of ['daily', 'daily_play', 'training', 'gotus', 'vault', 'chalkboard'])
    assert.equal(canPromptClientUpdate({ ...home, navigation: { view } }), false);
  assert.equal(canPromptClientUpdate(home, undefined, true), false);
  assert.equal(canPromptClientUpdate({ ...home, session: { resumePending: true } }), false);
  assert.equal(canPromptClientUpdate({ ...home, boot: { ready: false } }), false);
  for (const phase of ['countdown', 'intro', 'closed'])
    assert.equal(canPromptClientUpdate({ ...lobby, realtime: { tournamentLobby: { isOpen: true, phase } } }), false);
  const ready = { ...lobby, realtime: { tournamentLobby: { isOpen: true, phase: 'ready' } } };
  assert.equal(canPromptClientUpdate(ready, name => name === 'gameplaySession' ? { phase: 'results' } : null), true);
  assert.equal(canPromptClientUpdate(ready, name => name === 'gameplaySession' ? { phase: 'playing' } : null), false);
});
test('wheel, finale countdown, final standings and open menus defer the update', () => {
  for (const phase of ['waiting', 'intro', 'loading', 'playing', 'result', 'ranking'])
    assert.equal(canPromptClientUpdate(lobby, name => name === 'infortuneFinale' ? { phase } : null), false);
  for (const stage of ['scheduled', 'optional', 'wheel', 'exchange', 'waiting', 'leaders'])
    assert.equal(canPromptClientUpdate(home, name => name === 'infortune' ? { stage } : null), false);
  assert.equal(canPromptClientUpdate(home, name => name === 'overlays' ? { settingsOpen: true } : null), false);
  assert.equal(canPromptClientUpdate(lobby, name => name === 'infortuneFinale' ? { phase: 'idle' } : null), true);
});
