import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionAuditRepository } from './connectionAuditRepository.js';
import { createConnectionIpResolver, normalizeConnectionIp } from './connectionClientIp.js';
import { createConnectionAudit } from './connectionAudit.js';
import { registerAccountAdminRoutes } from '../admin/registerAccountAdminRoutes.js';

const request = (peer, forwarded) => ({ socket: { remoteAddress: peer }, headers: { 'x-forwarded-for': forwarded } });
const event = { userId: 17, nick: 'Tokyo', installId: 'browser-shared', ip: '192.0.2.8', ipSource: 'forwarded', kind: 'session' };

test('network provenance ignores forged headers on direct peers and stops at the first untrusted proxy hop', () => {
  const resolve = createConnectionIpResolver('127.0.0.1,::1,10.20.0.0/16');
  assert.deepEqual(resolve(request('198.51.100.9', '192.0.2.8')), { ip: '198.51.100.9', ipSource: 'peer' });
  assert.deepEqual(resolve(request('::ffff:127.0.0.1', '192.0.2.8, 10.20.1.2')), { ip: '192.0.2.8', ipSource: 'forwarded' });
  assert.deepEqual(resolve(request('127.0.0.1', '203.0.113.99, 198.51.100.9')), { ip: '198.51.100.9', ipSource: 'forwarded' });
  assert.deepEqual(resolve(request('127.0.0.1', '192.0.2.8, invalid')), { ip: '127.0.0.1', ipSource: 'peer' });
  assert.deepEqual(createConnectionIpResolver('')(request('127.0.0.1', '192.0.2.8')), { ip: '127.0.0.1', ipSource: 'peer' });
  assert.equal(normalizeConnectionIp('2001:0db8:0000::1'), '2001:db8::1');
  assert.equal(normalizeConnectionIp('fe80::1%eth0'), '');
  assert.equal(normalizeConnectionIp('not an address'), '');
  assert.throws(() => createConnectionIpResolver('everyone'));
});

test('shared device IDs never merge accounts; retries are suppressed while logins and changed networks remain distinct', async () => {
  let time = Date.UTC(2026, 10, 16);
  const repo = createConnectionAuditRepository({ filename: ':memory:', now: () => time });
  try {
    await Promise.all([repo.record(event), repo.record(event)]);
    assert.equal((await repo.list(17)).entries.length, 1);
    await repo.record({ ...event, userId: 382, nick: 'Elsa' });
    await repo.record({ ...event, userId: 22, nick: 'Beerman', ip: '198.51.100.2' });
    await repo.record({ ...event, ip: '192.0.2.9' });
    await repo.record({ ...event, installId: 'another-device' });
    await repo.record({ ...event, kind: 'login' });
    await repo.record({ ...event, kind: 'login' });
    assert.equal((await repo.list(17)).entries.length, 5);
    assert.equal((await repo.list(382)).entries[0].nick, 'Elsa');
    assert.equal((await repo.list(22)).entries[0].ip, '198.51.100.2');
    time += 60001;
    await repo.record(event);
    assert.equal((await repo.list(17)).entries.length, 6);
    assert.deepEqual(Object.keys((await repo.list(17)).entries[0]).sort(),
      ['id', 'installId', 'ip', 'ipSource', 'kind', 'nick', 'observedAt', 'userId'].sort());
    await assert.rejects(repo.record({ ...event, userId: 0 }), /invalid_connection_event/);
    await assert.rejects(repo.record({ ...event, kind: '__proto__' }), /invalid_connection_event/);
  } finally { await repo.close(); }
});

test('pagination is bounded and stable; expiry hides and physically purges events after 180 days', async () => {
  let time = Date.UTC(2026, 10, 16);
  const initialTime = time;
  const repo = createConnectionAuditRepository({ filename: ':memory:', now: () => time });
  try {
    for (let i = 0; i < 54; i++) { await repo.record({ ...event, kind: 'login' }); time++; }
    const first = await repo.list(17), second = await repo.list(17, first.nextBefore);
    assert.equal(first.entries.length, 50);
    assert.equal(second.entries.length, 4);
    assert.equal(second.nextBefore, null);
    assert.equal(new Set([...first.entries, ...second.entries].map(row => row.id)).size, 54);
    time += 180 * 86400000;
    assert.equal((await repo.list(17)).entries.length, 0);
    await repo.purge();
    time = initialTime;
    assert.equal((await repo.list(17)).entries.length, 0, 'purge deletes rows instead of only filtering them');
    await assert.rejects(repo.list(-1), /invalid_account/);
    await assert.rejects(repo.list(17, '1 OR 1=1'), /invalid_account/);
  } finally { await repo.close(); }
});

test('service uses the authenticated identity, keeps secrets out, tolerates disk failures and closes its maintenance timer', async () => {
  const events = [], warnings = [];
  let purges = 0, closes = 0;
  const audit = createConnectionAudit({ intervalMs: 10, resolveIp: createConnectionIpResolver(''), warn: (...args) => warnings.push(args),
    repository: { record: async value => { events.push(value); if (events.length === 2) throw new Error('private error contents'); },
      purge: async () => { purges++; }, close: async () => { closes++; }, list: async () => ({ entries: [] }) },
  });
  audit.start();
  const req = { ...request('192.0.2.8'), body: { userId: 382, nick: 'forged', password: 'secret' }, headers: { cookie: 'secret-token' } };
  await audit.record(req, { id: 17, usernameDisplay: 'Tokyo' }, 'browser-id', 'login');
  await audit.record(req, { id: 17, usernameDisplay: 'Tokyo' }, 'browser-id', 'login');
  assert.equal(events[0].userId, 17);
  assert.equal(events[0].nick, 'Tokyo');
  assert.ok(!JSON.stringify(events).includes('secret'));
  assert.ok(!JSON.stringify(warnings).includes('private error contents'));
  await new Promise(resolve => setTimeout(resolve, 35));
  await audit.close();
  const purged = purges;
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.ok(purged >= 2, 'maintenance also runs without a new connection');
  assert.equal(purges, purged);
  assert.equal(closes, 1);
  await audit.record(req, { id: 17 }, 'browser-id', 'login');
  assert.equal(events.length, 2);
});

test('connection history rejects unauthenticated, non-admin, password-reset and cross-origin readers before querying IPs', async () => {
  const routes = new Map();
  let actor = null, reads = 0;
  registerAccountAdminRoutes({ get: (url, handler) => routes.set(url, handler), post() {} }, {
    getAuth: async () => ({ user: actor }), isAdmin: user => user.id === 99,
    connectionAudit: { list: async (id, cursor) => { reads++; assert.equal(id, 17); assert.equal(cursor, null); return { entries: [] }; } },
  });
  const req = { params: { userId: '17' }, query: {}, headers: {}, get: () => 'gobble.test' };
  const res = { code: 200, headers: {}, set(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(value) { this.body = value; } };
  const read = () => routes.get('/api/admin/accounts/:userId/connections')(req, res);
  await read(); assert.equal(res.code, 401);
  actor = { id: 22 }; await read(); assert.equal(res.code, 403);
  actor = { id: 99, mustResetPassword: true }; await read(); assert.equal(res.code, 403);
  actor = { id: 99 }; req.headers.origin = 'https://other.test'; await read(); assert.equal(res.code, 403);
  delete req.headers.origin; req.headers['sec-fetch-site'] = 'cross-site'; await read(); assert.equal(res.code, 403);
  assert.equal(reads, 0);
  req.headers = { origin: 'https://gobble.test' }; res.code = 200;
  await read(); assert.equal(res.code, 200); assert.equal(reads, 1);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});
