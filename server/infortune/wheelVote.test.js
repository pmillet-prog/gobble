import test from 'node:test';
import assert from 'node:assert/strict';
import { createWheelVoteRepository } from './wheelVoteRepository.js';
import { registerWheelVoteRoutes } from './registerWheelVoteRoutes.js';
import { normalizeWheelVote, countWheelVotes } from '../../shared/wheelVote.js';

function harness(repository) {
  const routes = new Map();
  registerWheelVoteRoutes({ get: (path, handler) => routes.set(`GET ${path}`, handler), post: (path, handler) => routes.set(`POST ${path}`, handler) }, {
    repository, readAccount: async request => request.account, isAllowed: account => account.id === 1,
    readRoundCount: async userId => userId === 3 ? 99 : 100,
  });
  return async (method, { id = 2, body, admin = false, headers = {} } = {}) => {
    const result = { status: 200, headers: {} };
    const response = { status(code) { result.status = code; return this; }, json(value) { result.body = value; }, setHeader(key, value) { result.headers[key] = value; } };
    await routes.get(`${method} /api/${admin ? 'dev/infortune/votes' : 'infortune/vote'}`)({
      account: id ? { id, usernameDisplay: `Joueur ${id}` } : null, body, headers: { 'content-type': 'application/json', ...headers },
    }, response);
    return result;
  };
}

test('only authenticated accounts with at least 100 rounds can vote; results require dev authorization', async () => {
  const repository = createWheelVoteRepository({ filename: ':memory:' });
  try {
    const request = harness(repository), body = { status: 'voted', choices: [1, 3] };
    assert.equal((await request('GET', { id: null })).status, 401);
    assert.equal((await request('POST', { id: null, body })).status, 401);
    assert.equal((await request('GET', { id: 3 })).body.eligible, false);
    assert.equal((await request('POST', { id: 3, body })).status, 403);
    assert.equal((await request('GET')).body.eligible, true);
    assert.equal((await request('POST', { body: { ...body, userId: 1, nick: 'forged' } })).status, 200);
    assert.equal((await repository.read(2)).nick, 'Joueur 2');
    assert.equal(await repository.read(1), null);
    assert.equal((await request('GET', { admin: true })).status, 403);
    assert.equal((await request('GET', { id: 1, admin: true })).status, 200);
    assert.equal((await request('POST', { body, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
    assert.equal((await request('POST', { body, headers: { 'content-type': 'text/plain' } })).status, 415);
  } finally { await repository.close(); }
});

test('multiple choices, skipping, suggestions and replacements keep exactly one response per account', async () => {
  let time = 100;
  const repository = createWheelVoteRepository({ filename: ':memory:', now: () => time });
  try {
    const request = harness(repository), vote = { status: 'voted', choices: [8, 2, 2], suggestion: '  Une roue le dimanche.  ' };
    await request('POST', { body: vote });
    await request('POST', { body: vote });
    await request('POST', { id: 1, body: { status: 'skipped', choices: [] } });
    let result = (await request('GET', { id: 1, admin: true })).body;
    assert.equal(result.entries.length, 2);
    assert.deepEqual(result.totals.map(option => option.count), [0, 1, 0, 0, 0, 0, 0, 1]);
    assert.equal(result.entries[1].suggestion, 'Une roue le dimanche.');
    assert.deepEqual(countWheelVotes([result.entries[1]]).map(option => option.count), [0, 1, 0, 0, 0, 0, 0, 1]);
    time = 200;
    await request('POST', { body: { status: 'voted', choices: [4] } });
    const updated = (await request('GET')).body.vote;
    assert.deepEqual(updated.choices, [4]); assert.equal(updated.suggestion, '');
    assert.equal(updated.createdAt, 100); assert.equal(updated.updatedAt, 200);
    await request('POST', { body: { status: 'skipped', choices: [] } });
    result = (await request('GET', { id: 1, admin: true })).body;
    assert.equal(result.entries.length, 2);
    assert.ok(result.totals.every(option => option.count === 0));
    assert.equal((await request('GET')).body.vote.status, 'skipped');
  } finally { await repository.close(); }
});

test('invalid ballots and empty or oversized suggestions cannot be saved', async () => {
  const repository = createWheelVoteRepository({ filename: ':memory:' });
  try {
    const request = harness(repository);
    for (const value of [null, {}, { status: 'voted', choices: [] }, { status: 'voted', choices: [9] },
      { status: 'voted', choices: ['1'] }, { status: 'skipped', choices: [1] },
      { status: 'voted', choices: [8] }, { status: 'voted', choices: [8], suggestion: '  ' },
      { status: 'voted', choices: [8], suggestion: 'x'.repeat(2001) }]) {
      assert.throws(() => normalizeWheelVote(value));
      assert.equal((await request('POST', { body: value })).status, 400);
    }
    assert.equal((await repository.list()).length, 0);
  } finally { await repository.close(); }
});
