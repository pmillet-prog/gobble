import test from 'node:test';
import assert from 'node:assert/strict';
import { createTournamentWheelFinale } from './tournamentFinale.js';
import { createInfortuneFinaleSession } from '../../shared/createInfortuneFinaleSession.js';
import { finaleBankExhausted } from '../../shared/infortuneFinalePurchases.js';

const puzzle = { id: 'p', clue: 'Elle indique le nord.', answer: 'boussole' };
function harness({ bank = 0, balance = 500, waitForPayment } = {}) {
  let time = 1000, walletBalance = balance;
  const paid = [], receipts = new Map();
  const wallet = { read: async () => ({ balance: walletBalance }), pay: async (entry, purchase) => {
    assert.equal(entry.userId,1); const existing = receipts.get(purchase.requestId);
    if (purchase.cancel) { if (existing) walletBalance += existing; receipts.delete(purchase.requestId); return { ok: true, balance: walletBalance }; }
    if (walletBalance < purchase.cost) return { ok: false, error: 'insufficient_funds', balance: walletBalance };
    if (!existing) { walletBalance -= purchase.cost; receipts.set(purchase.requestId,purchase.cost); paid.push(purchase.cost); }
    await waitForPayment?.(); return { ok: true, cost: purchase.cost, balance: walletBalance };
  } };
  const game = createTournamentWheelFinale({ roomId: 'r', tournamentId: 't', startsAt: 1000, puzzle, wallet,
    ranking: [{ userId:1, installId:'1', nick:'Alice', points:0, basePoints:0, gobbles:0, roundScoreSum:0 }], ledger: { banks:new Map([['user:1',bank]]) },
    freeLetters: [], timers: { setTimeout() { return 1; }, clearTimeout() {} }, now: () => time });
  let id = 0;
  return { game, paid, balance: () => walletBalance, expire() { time=121000; game.finish(); },
    buy(letter, cost, extra={}) { return game.submit('user:1',{type:'buy',letter,currency:'gobblars',confirmedCost:cost,requestId:`request-${++id}`,...extra}); } };
}

test('gobblars start only when no remaining letter can be bought from the bank', async () => {
  const h=harness({bank:100});
  assert.equal((await h.buy('E',50)).error,'bank_available'); assert.equal(h.paid.length,0);
  const session=createInfortuneFinaleSession({puzzle,bank:49}); assert.equal(finaleBankExhausted(session.snapshot()),true);
  assert.equal(session.buyLetter('E',{currency:'gobblars'}).error,'payment_required');
  h.game.dispose();
});

test('5/10/20 pricing, absent letters, replay, refresh and balance failure preserve the wallet and bank', async () => {
  const h=harness({bank:15,balance:50});
  const first=await h.buy('E',5); assert.equal(first.ok,true); assert.equal(first.snapshot.bank,15);
  assert.equal(first.snapshot.gobblarsBalance,45); assert.ok(first.indices.length>0);
  const duplicate=await h.buy('E',5); assert.deepEqual(duplicate.indices,first.indices); assert.equal(h.paid.length,1);
  assert.equal((await h.buy('Z',5)).error,'price_changed');
  assert.equal((await h.buy('Z',10)).snapshot.lastPurchase.count,0);
  assert.equal((await h.buy('A',20)).ok,true);
  assert.equal((await h.buy('I',40)).error,'insufficient_funds');
  const restored=await h.game.submit('user:1',{type:'snapshot'});
  assert.deepEqual(h.paid,[5,10,20]); assert.equal(restored.snapshot.gobblarPurchases,3);
  assert.equal(restored.snapshot.gobblarsBalance,15); assert.equal(restored.snapshot.gobblarsSpent,35);
  assert.ok(!JSON.stringify(h.game.publicSnapshot()).includes('gobblarsBalance'));
  h.game.dispose();
});

test('concurrent confirmations serialize, and a payment completing after the deadline is refunded', async () => {
  let release; const barrier=new Promise(resolve=>{release=resolve;});
  const h=harness({waitForPayment:()=>barrier});
  const first=h.buy('E',5), second=h.buy('A',5);
  await Promise.resolve(); release();
  assert.equal((await first).ok,true); assert.equal((await second).error,'price_changed'); assert.deepEqual(h.paid,[5]);
  h.game.dispose();
  let finish; const late=harness({waitForPayment:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=late.buy('E',5); await Promise.resolve(); late.expire(); finish();
  assert.equal((await pending).error,'expired'); assert.equal(late.balance(),500);
  assert.deepEqual(late.game.snapshot('user:1').snapshot.purchased,[]); late.game.dispose();
});
