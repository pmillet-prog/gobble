import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { normalizeWord, scoreWordOnGridWithPath, solveAll } from "../src/components/gameLogic.js";
import { TUTORIAL_BOARDS, TUTORIAL_PATHS, TUTORIAL_TEACHING_WORDS, TUTORIAL_BOARD_SPECIALS } from "../src/features/tutorial/tutorialBoards.js";

const dictionary = new Set((await readFile(new URL("../public/dico.txt", import.meta.url), "utf8"))
  .split(/\r?\n/).map((word) => normalizeWord(word.trim())).filter(Boolean));
for (const word of Object.keys(TUTORIAL_PATHS)) {
  if (!dictionary.has(word)) throw new Error(`Teaching word missing from dictionary: ${word}`);
}
const packs = {};
for (const [id, grid] of Object.entries(TUTORIAL_BOARDS)) {
  const special = TUTORIAL_BOARD_SPECIALS[id];
  const solutions = [...solveAll(grid, dictionary, special)].map(([word, entry]) => ({ word, ...entry }));
  solutions.sort((a, b) => b.pts - a.pts || a.word.localeCompare(b.word, "fr"));
  for (const word of TUTORIAL_TEACHING_WORDS[id] || []) {
    if (!scoreWordOnGridWithPath(word, grid, TUTORIAL_PATHS[word], special) || !solutions.some((entry) => entry.word === word)) {
      throw new Error(`Invalid teaching path on ${id}: ${word}`);
    }
  }
  packs[id] = { grid, solutions, ...(special ? { special } : {}) };
  console.log(`${id}: ${solutions.length} words; best ${solutions[0]?.word} (${solutions[0]?.pts}); longest ${Math.max(...solutions.map((entry) => entry.word.length))}`);
}
const output = new URL("../src/features/tutorial/tutorialBoardPacks.json", import.meta.url);
await writeFile(output, `${JSON.stringify(packs)}\n`, "utf8");
console.log(fileURLToPath(output));
