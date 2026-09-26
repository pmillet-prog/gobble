import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeWord } from "../../shared/gameLogic.js";
import { isLepersChallengeRound, selectLepersChallenge } from "./lepersChallenge.js";

export const LEPERS_QUESTION_HISTORY_LIMIT = 100;

// One history owned by the main server process, independent of compute workers.
// Preparing or discarding a grid never consumes a question.
export function createLepersQuestionHistory({
  filePath,
  onError = error => console.warn(`Lepers question history: ${error?.message || error}`),
} = {}) {
  let recentQuestions = [];
  let pendingWrite = Promise.resolve();
  const snapshot = () => recentQuestions.map(question => ({ ...question }));

  async function load() {
    try {
      const data = JSON.parse(await readFile(filePath, "utf8"));
      if (data?.version !== 1 || !Array.isArray(data.questions)) throw new Error("Invalid history format");
      recentQuestions = data.questions.map(question => ({
        word: normalizeWord(question?.word || ""),
        definition: String(question?.definition || "").trim(),
      })).filter(question => question.word && question.definition).slice(-LEPERS_QUESTION_HISTORY_LIMIT);
    } catch (error) {
      if (error?.code !== "ENOENT") onError(error);
    }
  }

  function takeForRound({ enabled, tournamentRound, training, candidates, seed } = {}) {
    if (!isLepersChallengeRound({ enabled, tournamentRound, training })) return null;
    const question = selectLepersChallenge(candidates, { seed, recentQuestions });
    if (!question) return null;
    // Selection and reservation are synchronous: an outdated precomputation
    // cannot reintroduce a word or definition asked in the meantime.
    recentQuestions.push({ word: normalizeWord(question.word), definition: question.definition });
    recentQuestions = recentQuestions.slice(-LEPERS_QUESTION_HISTORY_LIMIT);
    const body = JSON.stringify({ version: 1, questions: recentQuestions });
    pendingWrite = pendingWrite.then(async () => {
      await mkdir(path.dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.tmp`;
      await writeFile(temporaryPath, body, "utf8");
      await rename(temporaryPath, filePath);
    }).catch(onError);
    return question;
  }

  return Object.freeze({ load, snapshot, takeForRound, flush: () => pendingWrite });
}
