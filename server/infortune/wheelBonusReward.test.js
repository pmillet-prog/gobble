import test from 'node:test';
import assert from 'node:assert/strict';
import { createWheelBonusReward } from './wheelBonusReward.js';
import { createInfortuneLedger, createInfortuneRoundEconomy } from './roundEconomy.js';
import { infortuneRoundPolicy } from '../../shared/infortuneIntermission.js';
import { WHEEL_SECTORS } from '../../shared/infortuneWheel.js';

const players = [1, 2, 3].map(id => ({ id: `user:${id}`, userId: id, installId: `account-${id}`, nick: `Player${id}` }));
function fixture() {
  const writes = [], awards = [];
  const reward = createWheelBonusReward({ players, roomId: 'room', roundId: 'r1', tournamentId: 't1',
    persistence: { addGobblars: async value => { writes.push(value); return { ok: true, balance: 600 }; } },
    onAward: (player, value) => awards.push({ player, ...value }) });
  const ledger = createInfortuneLedger();
  const game = createInfortuneRoundEconomy({ ledger, groups: [{ id: 'g', members: players }],
    policy: { ...infortuneRoundPolicy({ enabled: true, round: 1, totalRounds: 5 }), openedAt: 1000 },
    now: () => 1000, random: () => 6.1 / 24, onReward: reward,
    timers: { setTimeout() { return 1; }, clearTimeout() {} } });
  return { game, ledger, writes, awards };
}
const spin = (game, id, kind) => game.submit(id, { type: 'spin', index: WHEEL_SECTORS.findIndex(sector => sector.kind === kind) });

test('Bonus adds 100 gobblars and 1000 euros once, for a manual or automatic spin', async () => {
  const h = fixture();
  spin(h.game, 'user:1', 'bonus'); spin(h.game, 'user:1', 'bonus');
  h.game.submit('user:2', { type: 'spin', skip: true });
  h.game.close(); h.game.close();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.writes.length, 3);
  assert.ok(h.writes.every(write => write.amount === 100 && write.reason === 'infortune_bonus'));
  assert.equal(h.awards.length, 3);
  assert.deepEqual([...h.ledger.banks.values()], [1000, 1000, 1000]);
  h.game.dispose();
});

test('launch quality is credited immediately once, separate from the landed sector and lost on bankruptcy', () => {
  const h = fixture();
  const launch = (quality, id = 'user:1') => h.game.submit(id, { type: 'launch', quality });
  assert.equal(launch('good').economy.members['user:1'].bank, 50);
  assert.equal(launch('perfect').economy.members['user:1'].bank, 50);
  const landed = spin(h.game, 'user:1', 'bonus');
  assert.equal(landed.economy.members['user:1'].bank, 1050);
  assert.equal(landed.economy.members['user:1'].result.before, 50);
  assert.equal(landed.economy.members['user:1'].launchBank, 50);
  launch('perfect', 'user:2'); assert.equal(h.ledger.banks.get('user:2'), 100);
  spin(h.game, 'user:2', 'bankrupt'); assert.equal(h.ledger.banks.get('user:2'), 0);
  assert.equal(launch('perfect', 'user:2').economy.members['user:2'].bank, 0);
  h.game.dispose();
});
