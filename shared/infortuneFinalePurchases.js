import { FINALE_ALPHABET, finaleLetterCost, normalizeFinaleText } from './infortuneFinaleRules.js';

export function finaleGobblarPrice(purchases = 0) {
  return 5 * 2 ** Math.max(0, Math.min(26, Math.trunc(purchases) || 0));
}
export function finaleBankExhausted(state) {
  const available = [...FINALE_ALPHABET].filter(letter => !state.purchased.includes(letter));
  return available.length > 0 && available.every(letter => state.bank < finaleLetterCost(letter, state.rules));
}
export function finalePurchaseQuote(state, raw, currency = 'bank') {
  if (state.outcome) return { ok: false, error: 'finished' };
  const letter = normalizeFinaleText(raw);
  if (!/^[A-Z]$/.test(letter)) return { ok: false, error: 'invalid_letter' };
  if (state.purchased.includes(letter)) return { ok: false, error: 'already_purchased' };
  if (currency === 'gobblars') {
    if (!finaleBankExhausted(state)) return { ok: false, error: 'bank_available' };
    return { ok: true, letter, currency, cost: finaleGobblarPrice(state.gobblarPurchases) };
  }
  const cost = finaleLetterCost(letter, state.rules);
  if (currency !== 'bank') return { ok: false, error: 'invalid_payment' };
  return state.bank < cost ? { ok: false, error: 'insufficient_bank' } : { ok: true, letter, currency, cost };
}
