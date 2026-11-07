import test from 'node:test';
import assert from 'node:assert/strict';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { FINALE_PAYMENT_SCHEMA, applyFinaleLetterPayment } from './finaleLetterPayment.js';

test('wallet receipt commits once, cancellation refunds once, and a cancelled job cannot debit later', async t => {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database }); t.after(() => db.close());
  await db.exec(`${FINALE_PAYMENT_SCHEMA}
    CREATE TABLE profiles (installId TEXT PRIMARY KEY, balance INTEGER); INSERT INTO profiles VALUES ('alice',350),('bob',1000);
    CREATE TABLE ledger (installId TEXT, delta INTEGER, reason TEXT);`);
  let time = 1000;
  const deps = { db, now: () => time, readProfile: id => db.get('SELECT * FROM profiles WHERE installId = ?', id),
    updateProfile: (id, value) => db.run('UPDATE profiles SET balance = ? WHERE installId = ?', value.balance, id),
    ledger: (id, delta, reason) => db.run('INSERT INTO ledger VALUES (?,?,?)', id, delta, reason) };
  const pay = async value => {
    await db.exec('BEGIN IMMEDIATE');
    try { const result = await applyFinaleLetterPayment(deps, { installId: 'alice', purchaseKey: 'room:t1:E:r1', cost: 50, deadlineAt: 10000, ...value }); await db.exec('COMMIT'); return result; }
    catch (error) { await db.exec('ROLLBACK'); throw error; }
  };
  assert.equal((await pay()).balance,300);
  assert.equal((await pay()).duplicate,true);
  assert.equal((await db.get('SELECT count(*) AS n FROM ledger')).n,1);
  assert.equal((await pay({ cost: 100 })).error,'price_changed');
  assert.equal((await pay({ cancel: true })).balance,350);
  assert.equal((await pay({ cancel: true })).balance,350);
  assert.equal((await pay()).error,'expired');
  await pay({ purchaseKey: 'cancel-before-payment', cancel: true });
  assert.equal((await pay({ purchaseKey: 'cancel-before-payment' })).error,'expired');
  assert.equal((await pay({ purchaseKey: 'too-expensive', cost: 400 })).error,'insufficient_funds');
  time=10000;
  assert.equal((await pay({ purchaseKey: 'too-late' })).error,'expired');
  assert.equal((await deps.readProfile('alice')).balance,350);
  assert.equal((await deps.readProfile('bob')).balance,1000);
  assert.equal((await db.get('SELECT count(*) AS n FROM ledger')).n,2);
  time=1000;
  assert.equal((await pay({ purchaseKey: 'new-five-price', cost: 5 })).balance,345);
  assert.equal((await pay({ purchaseKey: 'new-five-price', cost: 5 })).duplicate,true);
});
