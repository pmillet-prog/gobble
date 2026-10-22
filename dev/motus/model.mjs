import { normalizeWord, WORD_LENGTH } from "./word-rules.mjs";

export const MAX_ATTEMPTS = 6;

export function evaluateGuess(target, guess) {
  if (target.length !== guess.length) throw new Error("Longueurs différentes.");
  const result = Array(target.length).fill("absent");
  const remaining = new Map();
  for (let index = 0; index < target.length; index++) {
    if (target[index] === guess[index]) result[index] = "correct";
    else remaining.set(target[index], (remaining.get(target[index]) || 0) + 1);
  }
  for (let index = 0; index < guess.length; index++) {
    if (result[index] === "correct") continue;
    const count = remaining.get(guess[index]) || 0;
    if (count > 0) {
      result[index] = "present";
      remaining.set(guess[index], count - 1);
    }
  }
  return result;
}

export function createRound(target) {
  const word = normalizeWord(target);
  if (!/^[A-Z]{6}$/.test(word)) throw new Error("Le mot doit contenir six lettres.");
  return {
    target: word, attempts: [], known: [...word].map((letter, index) => index ? "" : letter),
    draft: word[0], phase: "playing", revealed: 0, message: "À vous de jouer !",
  };
}

export function validateGuess(state, value, accepted) {
  const guess = normalizeWord(value);
  if (state.phase !== "playing") return "Attendez la fin de la révélation.";
  if (!/^[A-Z]{6}$/.test(guess)) return "Il faut un mot de six lettres.";
  if (!accepted.has(guess)) return "Ce mot ne figure pas dans le dictionnaire.";
  if (state.attempts.some(attempt => attempt.word === guess)) return "Ce mot a déjà été proposé.";
  return "";
}

export function submitGuess(state, value, accepted) {
  const error = validateGuess(state, value, accepted);
  if (error) return { state, error };
  const word = normalizeWord(value);
  const marks = evaluateGuess(state.target, word);
  return {
    error: "", state: {
      ...state, draft: word, phase: "revealing", revealed: 0,
      attempts: [...state.attempts, { word, marks }], message: "Voyons cela…",
    },
  };
}

export function revealLetter(state) {
  if (state.phase !== "revealing") return state;
  const revealed = state.revealed + 1;
  if (revealed <= WORD_LENGTH) return { ...state, revealed };
  const attempt = state.attempts.at(-1);
  const known = state.known.map((letter, index) => attempt.marks[index] === "correct" ? attempt.word[index] : letter);
  const won = attempt.word === state.target;
  const lost = !won && state.attempts.length >= MAX_ATTEMPTS;
  return {
    ...state, known, revealed: WORD_LENGTH, draft: state.target[0],
    phase: won ? "won" : lost ? "lost" : "playing",
    message: won ? "C’est le bon mot ! Bravo !" : lost ? `Le mot était ${state.target}. On en essaie un autre ?` : "Gardez les bonnes lettres. À vous !",
  };
}

export function keyboardMarks(state) {
  const ranks = { absent: 1, present: 2, correct: 3 };
  const letters = {};
  state.attempts.forEach((attempt, row) => {
    const visible = state.phase === "revealing" && row === state.attempts.length - 1 ? state.revealed : WORD_LENGTH;
    [...attempt.word].slice(0, visible).forEach((letter, index) => {
      const mark = attempt.marks[index];
      if ((ranks[letters[letter]] || 0) < ranks[mark]) letters[letter] = mark;
    });
  });
  return letters;
}
