import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeTargetWaitSolution,
  buildCompactTargetWaitTrie,
  buildTargetWaitPath,
  createTargetWaitCatalogPayload,
  createTargetWaitRandom,
  getCanonicalTargetWaitSignature,
  solveTargetWaitBoard,
  stripTargetWaitPuzzleDiagnostics,
  tokenizeTargetWaitWord,
} from "../targetMiniGame/targetWaitPuzzleGenerator.js";

test("tokenizeTargetWaitWord normalise les accents et traite Qu comme une tuile", () => {
  assert.deepEqual(tokenizeTargetWaitWord("ÉQUIPE"), ["e", "qu", "i", "p", "e"]);
  assert.deepEqual(tokenizeTargetWaitWord("triangle"), [
    "t",
    "r",
    "i",
    "a",
    "n",
    "g",
    "l",
    "e",
  ]);
  assert.equal(tokenizeTargetWaitWord("qat"), null);
});

test("buildTargetWaitPath produit un chemin legal sans case repetee", () => {
  const random = createTargetWaitRandom(12345);
  const path = buildTargetWaitPath(11, random);
  assert.equal(path.length, 11);
  assert.equal(new Set(path).size, path.length);
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    const rowDelta = Math.abs(Math.floor(previous / 4) - Math.floor(current / 4));
    const columnDelta = Math.abs((previous % 4) - (current % 4));
    assert.ok(rowDelta <= 1 && columnDelta <= 1);
    assert.ok(rowDelta + columnDelta > 0);
  }
});

test("le solveur compact retrouve les mots, leurs chemins et une tuile Qu", () => {
  const trie = buildCompactTargetWaitTrie([
    "chat",
    "chats",
    "quit",
    "quitte",
    "tare",
  ]);
  const board = [
    "C", "H", "A", "T",
    "R", "E", "N", "S",
    "Qu", "I", "T", "L",
    "O", "N", "M", "D",
  ];
  const solved = solveTargetWaitBoard(board, trie);
  const foundWords = new Set(Array.from(solved.keys(), (index) => trie.words[index]));
  assert.ok(foundWords.has("chat"));
  assert.ok(foundWords.has("chats"));
  assert.ok(foundWords.has("quit"));
});

test("analyzeTargetWaitSolution distingue les mots utilisant la case vide", () => {
  const trie = buildCompactTargetWaitTrie(["chat", "chats", "char", "tare"]);
  const board = [
    "C", "H", "A", "T",
    "N", "E", "R", "S",
    "O", "I", "L", "M",
    "D", "U", "P", "B",
  ];
  const solved = solveTargetWaitBoard(board, trie);
  const analysis = analyzeTargetWaitSolution(
    solved,
    trie,
    2,
    new Set(["chat", "chats", "char", "tare"]),
    "chats"
  );
  assert.equal(analysis.maxLength, 5);
  assert.deepEqual(analysis.longestWords, ["chats"]);
  assert.ok(analysis.blankWordCount >= 2);
  assert.ok(analysis.commonBlankWords.includes("chat"));
  assert.ok(!analysis.commonBlankWords.includes("chats"));
});

test("la signature canonique deduplique rotations et symetries", () => {
  const board = [
    "A", "B", "C", "D",
    "E", "F", "G", "H",
    "I", "J", "K", "L",
    "M", "N", "O", "P",
  ];
  const rotated = Array.from({ length: 16 }, () => "");
  for (let index = 0; index < board.length; index += 1) {
    const row = Math.floor(index / 4);
    const column = index % 4;
    rotated[column * 4 + (3 - row)] = board[index];
  }
  const rotatedBlankIndex = (5 % 4) * 4 + (3 - Math.floor(5 / 4));
  assert.equal(
    getCanonicalTargetWaitSignature(board, 5),
    getCanonicalTargetWaitSignature(rotated, rotatedBlankIndex)
  );
});

test("le catalogue compact retire les diagnostics de generation", () => {
  const puzzle = {
    id: "tw-000001",
    grid: "ABCDEFGHIJKLMNO_",
    blankIndex: 15,
    choices: ["A", "E", "I", "O"],
    answer: "E",
    word: "EXEMPLE",
    path: [1, 2, 3, 4, 5, 6, 7],
    difficulty: 2,
    quality: { internal: true },
  };
  assert.deepEqual(stripTargetWaitPuzzleDiagnostics(puzzle), {
    id: "tw-000001",
    grid: "ABCDEFGHIJKLMNO_",
    blankIndex: 15,
    choices: ["A", "E", "I", "O"],
    answer: "E",
    word: "EXEMPLE",
    path: [1, 2, 3, 4, 5, 6, 7],
    difficulty: 2,
  });
  const catalog = createTargetWaitCatalogPayload([puzzle], { seed: 42 });
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.seed, 42);
  assert.equal(catalog.puzzles.length, 1);
  assert.equal("quality" in catalog.puzzles[0], false);
});
