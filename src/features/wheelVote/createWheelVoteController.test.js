import test from 'node:test';
import assert from 'node:assert/strict';
import { createWheelVoteController } from './createWheelVoteController.js';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
test('the gate requires a response once, supports editing and only closes after a successful save', async () => {
  let vote = null, fail = false;
  const controller = createWheelVoteController({ api: async (_url, options) => {
    if (fail) throw new Error('offline');
    if (options.vote) vote = options.vote;
    return { eligible: true, vote };
  } });
  try {
    controller.setAccount(1); await flush();
    assert.equal(controller.store.getState().open, true);
    controller.close(); assert.equal(controller.store.getState().open, true);
    fail = true;
    await controller.submit({ status: 'voted', choices: [2] });
    assert.equal(controller.store.getState().open, true);
    assert.equal(controller.store.getState().vote, null);
    fail = false;
    await controller.submit({ status: 'skipped', choices: [] });
    assert.equal(controller.store.getState().open, false);
    controller.edit(); assert.equal(controller.store.getState().open, true);
    controller.close(); assert.equal(controller.store.getState().vote.status, 'skipped');
    controller.edit(); await controller.submit({ status: 'voted', choices: [1, 8], suggestion: 'Autrement' });
    controller.setAccount(null); controller.setAccount(1); await flush();
    assert.equal(controller.store.getState().open, false);
    assert.deepEqual(controller.store.getState().vote.choices, [1, 8]);
  } finally { controller.dispose(); }
});

test('ineligible accounts see no ballot and late replies cannot cross accounts or logout', async () => {
  const pending = [];
  const controller = createWheelVoteController({ api: (_url, options) => new Promise(resolve => pending.push({ resolve, ...options })) });
  try {
    controller.setAccount(1); controller.setAccount(2);
    assert.equal(pending[0].signal.aborted, true);
    pending[1].resolve({ eligible: false, vote: null }); await flush();
    pending[0].resolve({ eligible: true, vote: null }); await flush();
    assert.equal(controller.store.getState().eligible, false);
    assert.equal(controller.store.getState().open, false);
    controller.edit(); assert.equal(controller.store.getState().open, false);
    controller.setAccount(3); controller.setAccount(null);
    pending[2].resolve({ eligible: true, vote: null }); await flush();
    assert.equal(controller.store.getState().userId, null);
    assert.equal(controller.store.getState().open, false);
  } finally { controller.dispose(); }
});
