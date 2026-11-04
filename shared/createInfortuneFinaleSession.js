import {
  FINALE_ALPHABET, finaleClueCharacters, finaleLetterCost, judgeFinaleAnswer,
  normalizeFinaleRules, normalizeFinaleText,
} from "./infortuneFinaleRules.js";

// Pure domain session: no sockets, UI, storage or wallet writes. The answer stays
// private until submission. The workshop hosts it locally; live will host it on
// the server and send only the explicit public snapshot.
export function createInfortuneFinaleSession({ puzzle, bank, rules: rawRules }) {
  if (!Number.isSafeInteger(bank) || bank < 0) throw new RangeError("infortune_finale_invalid_bankroll");
  const rules = normalizeFinaleRules(rawRules);
  const characters = finaleClueCharacters(puzzle.clue);
  const purchased = new Set();
  let balance = bank, outcome = null, lastPurchase = null;

  function snapshot() {
    return {
      puzzleId: puzzle.id, category: puzzle.category, kind: puzzle.kind,
      bank: balance, spent: bank - balance, rules, purchased: [...purchased], outcome, lastPurchase,
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
    buyLetter(raw) {
      if (outcome) return { ok: false, error: "finished" };
      const letter = normalizeFinaleText(raw);
      if (!/^[A-Z]$/.test(letter)) return { ok: false, error: "invalid_letter" };
      if (purchased.has(letter)) return { ok: false, error: "already_purchased" };
      const cost = finaleLetterCost(letter, rules);
      if (balance < cost) return { ok: false, error: "insufficient_bank" };
      // A purchase is charged once, even when the letter is absent.
      const indices = [];
      characters.forEach((character, index) => { if (normalizeFinaleText(character) === letter) indices.push(index); });
      balance -= cost;
      purchased.add(letter);
      lastPurchase = { letter, cost, count: indices.length };
      return { ok: true, indices, snapshot: snapshot() };
    },
    submitAnswer(raw) {
      if (outcome) return { ok: false, error: "finished" };
      const judgment = judgeFinaleAnswer(raw, puzzle);
      if (!judgment.valid) return { ok: false, error: "one_word_required" };
      outcome = Object.freeze({
        correct: judgment.correct, typo: judgment.typo, proposal: String(raw).trim(), answer: puzzle.answer,
        points: judgment.correct ? rules.victoryPoints : 0,
        gobblars: judgment.correct ? Math.floor(balance / rules.bankPerGobblar) : 0,
      });
      return { ok: true, snapshot: snapshot() };
    },
  });
}
