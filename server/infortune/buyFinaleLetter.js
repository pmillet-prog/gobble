import { finalePurchaseQuote } from '../../shared/infortuneFinalePurchases.js';

export async function buyFinaleLetter({ participant, action, wallet, deadlineAt, expired }) {
  const { session, entry } = participant;
  const quote = finalePurchaseQuote(session.snapshot(), action.letter, 'gobblars');
  if (!quote.ok) return quote;
  if (action.confirmedCost !== quote.cost) return { ok: false, error: 'price_changed' };
  if (!wallet || typeof action.requestId !== 'string' || !/^[a-zA-Z0-9:_-]{1,100}$/.test(action.requestId)) return { ok: false, error: 'payment_required' };
  const purchase = { letter: quote.letter, cost: quote.cost, deadlineAt, requestId: action.requestId };
  const remember = result => { if (Number.isFinite(result?.balance)) participant.gobblarsBalance = result.balance; return result; };
  const cancel = async () => remember(await wallet.pay(entry, { ...purchase, cancel: true }));
  let payment;
  try { payment = remember(await wallet.pay(entry, purchase)); }
  catch {
    // A worker may have committed before losing its acknowledgement. Cancel by
    // the same persistent receipt, including if its original job arrives later.
    await cancel();
    return { ok: false, error: 'connection' };
  }
  if (!payment?.ok) return payment || { ok: false, error: 'connection' };
  if (expired() || session.snapshot().outcome) {
    await cancel(); return { ok: false, error: 'expired' };
  }
  const result = session.buyLetter(quote.letter, { currency: 'gobblars', approvedCost: quote.cost });
  if (!result.ok) await cancel();
  return result;
}
