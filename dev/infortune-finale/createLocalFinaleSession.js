import { createInfortuneFinaleSession } from '../../shared/createInfortuneFinaleSession.js';
import { finalePurchaseQuote } from '../../shared/infortuneFinalePurchases.js';

// Virtual test wallet only. Workshop purchases never call the account API.
export function createLocalFinaleSession(options) {
  const session = createInfortuneFinaleSession(options);
  let gobblarsBalance = 5000;
  const snapshot = () => ({ ...session.snapshot(), gobblarsBalance, virtualWallet: true });
  return { snapshot, expire: () => { session.expire(); return snapshot(); },
    submitAnswer(answer) {
      const result = session.submitAnswer(answer);
      if (result.ok && result.snapshot.outcome.correct) gobblarsBalance += result.snapshot.outcome.gobblars;
      return { ...result, snapshot: snapshot() };
    },
    buyLetter(letter, payment = {}) {
      const quote = finalePurchaseQuote(snapshot(), letter, payment.currency);
      if (!quote.ok) return quote;
      if (quote.currency === 'gobblars') {
        if (payment.confirmedCost !== quote.cost) return { ok: false, error: 'price_changed' };
        if (gobblarsBalance < quote.cost) return { ok: false, error: 'insufficient_funds' };
      }
      const result = session.buyLetter(letter, { currency: quote.currency, approvedCost: quote.cost });
      if (result.ok && quote.currency === 'gobblars') gobblarsBalance -= quote.cost;
      return { ...result, snapshot: snapshot() };
    } };
}
