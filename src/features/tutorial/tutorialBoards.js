// Authored boards; resolved ahead of time with the game's solver.
const makeBoard = (letters, bonuses = {}) => letters.map((letter, index) => ({ letter, bonus: bonuses[index] || null }));

export const TUTORIAL_BOARDS = Object.freeze({
  discovery: makeBoard([
    "Qu", "A", "D", "R",
    "T", "A", "L", "I",
    "E", "R", "E", "X",
    "N", "M", "O", "Z",
  ], { 0: "L2", 3: "L3", 4: "M2", 10: "M3" }),
  speed: makeBoard([
    "C", "H", "A", "T",
    "E", "T", "N", "S",
    "R", "A", "E", "I",
    "S", "I", "O", "N",
  ]),
  length: makeBoard([
    "O", "R", "G", "A",
    "A", "S", "I", "N",
    "T", "I", "O", "N",
    "E", "S", "U", "L",
  ]),
  gold: makeBoard([
    "Z", "E", "B", "R",
    "A", "T", "I", "E",
    "F", "A", "R", "S",
    "O", "N", "U", "X",
  ]),
  twins: [
    { letter: "B", altLetter: "P", specialType: "fake_twins", bonus: null },
    ...makeBoard(["A", "I", "N", "R", "E", "S", "T", "O", "L", "E", "S", "M", "U", "R", "E"]),
  ],
  spectacular: makeBoard([
    "E", "X", "T", "R",
    "D", "R", "O", "A",
    "I", "N", "A", "I",
    "S", "L", "E", "R",
  ], { 1: "L3", 5: "M2", 14: "M3" }),
});

export const TUTORIAL_PATHS = Object.freeze({
  arme: [5, 9, 13, 8],
  quad: [0, 1, 2],
  quadrilatere: [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10],
  chant: [0, 1, 2, 6, 5],
  organisation: [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11],
  zebre: [0, 1, 2, 3, 7],
  pain: [0, 1, 2, 3],
  bain: [0, 1, 2, 3],
  bras: [0, 4, 1, 6],
  perle: [0, 5, 4, 9, 10],
  extraordinaire: [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11, 15, 14],
});

export const TUTORIAL_TEACHING_WORDS = Object.freeze({
  discovery: ["arme", "quad", "quadrilatere"], speed: ["chant"],
  length: ["organisation"], gold: ["zebre"], twins: ["bras", "perle"], spectacular: ["extraordinaire"],
});

export const TUTORIAL_BOARD_SPECIALS = Object.freeze({ twins: { type: "fake_twins" } });
