import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalFinaleSession } from './createLocalFinaleSession.js';

test('the trial converts its remaining bank into the virtual wallet once, using the normal rate', () => {
  const session = createLocalFinaleSession({ bank: 1200, puzzle: { id: 'p', clue: 'Elle indique le nord.', answer: 'boussole' } });
  session.buyLetter('E');
  const win = session.submitAnswer('boussole');
  assert.equal(win.snapshot.outcome.gobblars, 105);
  assert.equal(win.snapshot.gobblarsBalance, 5105);
  assert.equal(session.submitAnswer('boussole').ok, false);
  assert.equal(session.snapshot().gobblarsBalance, 5105);
});
