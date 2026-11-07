import {
  FINALE_ALPHABET, finaleClueCharacters, judgeFinaleAnswer,
  normalizeFinaleRules, normalizeFinaleText,
} from "./infortuneFinaleRules.js";
import { finalePurchaseQuote } from './infortuneFinalePurchases.js';

// Pure domain session: no sockets, UI, storage or wallet writes. The answer stays
// private until submission. The workshop hosts it locally; live will host it on
// the server and send only the explicit public snapshot.
export function createInfortuneFinaleSession({ puzzle, bank, rules: rawRules }) {
  if (!Number.isSafeInteger(bank) || bank < 0) throw new RangeError("infortune_finale_invalid_bankroll");
  const rules = normalizeFinaleRules(rawRules);
  const characters = finaleClueCharacters(puzzle.clue);
  const purchased = new Set();
  let balance = bank, outcome = null, lastPurchase = null;
  let gobblarPurchases = 0, gobblarsSpent = 0;

  function snapshot() {
    return {
      puzzleId: puzzle.id, category: puzzle.category, kind: puzzle.kind,
      bank: balance, spent: bank - balance, rules, purchased: [...purchased], outcome, lastPurchase, gobblarPurchases, gobblarsSpent,
      tiles: characters.map((character, index) => {
        const letter = normalizeFinaleText(character);
        const isLetter = FINALE_ALPHABET.includes(letter) && letter.length === 1;
        const visible = !isLetter || outcome !== null || purchased.has(letter);
        return { index, kind: isLetter ? "letter" : character === " " ? "space" : "punctuation",
          character: visible ? character : null };
      }),
    };
  }

  return Object.freeze({
    snapshot,
    expire() {
      if (!outcome) outcome = Object.freeze({ correct: false, expired: true, proposal: "", answer: puzzle.answer, clue: puzzle.clue, points: 0, gobblars: 0 });
      return snapshot();
    },
    buyLetter(raw, { currency = 'bank', approvedCost } = {}) {
      const quote = finalePurchaseQuote(snapshot(), raw, currency);
      if (!quote.ok) return quote;
      const { letter, cost } = quote;
      // Only the trusted host may commit an already paid gobblar purchase.
      if (currency === 'gobblars' && approvedCost !== cost) return { ok: false, error: 'payment_required' };
      // A purchase is charged once, even when the letter is absent.
      const indices = [];
      characters.forEach((character, index) => { if (normalizeFinaleText(character) === letter) indices.push(index); });
      if (currency === 'bank') balance -= cost;
      else { gobblarPurchases++; gobblarsSpent += cost; }
      purchased.add(letter);
      lastPurchase = { letter, cost, count: indices.length, currency };
      return { ok: true, indices, snapshot: snapshot() };
    },
    submitAnswer(raw) {
      if (outcome) return { ok: false, error: "finished" };
      const judgment = judgeFinaleAnswer(raw, puzzle);
      if (!judgment.valid) return { ok: false, error: "one_word_required" };
      outcome = Object.freeze({
        correct: judgment.correct, typo: judgment.typo, proposal: String(raw).trim(), answer: puzzle.answer, clue: puzzle.clue,
        points: judgment.correct ? rules.victoryPoints : 0,
        gobblars: judgment.correct ? Math.floor(balance / rules.bankPerGobblar) : 0,
      });
      return { ok: true, snapshot: snapshot() };
    },
  });
}
