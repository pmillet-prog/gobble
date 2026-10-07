import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TARGET_QUIZ_QUESTION_COUNT = 8444;
export const TARGET_QUIZ_ROUTE_COUNT = 5;
export const TARGET_QUIZ_BOUNDARY_GAP = 100;
export const TARGET_QUIZ_BANK_PATH = fileURLToPath(
  new URL("../../data/target-quiz-bank.json", import.meta.url)
);

const catalogs = new Map();
const MODES = ["words", "spellings"];

function requireValid(condition, message) {
  if (!condition) throw new Error(`target_quiz_bank_invalid: ${message}`);
}

function normalizedWord(value) {
  return value.toLowerCase().replaceAll("œ", "oe").replaceAll("æ", "ae")
    .normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z]/g, "");
}

export function targetQuizBankVersion(bank) {
  const content = JSON.stringify({
    schemaVersion: bank.schemaVersion,
    metadata: bank.metadata,
    questionCount: bank.questionCount,
    routeCount: bank.routeCount,
    questions: bank.questions,
    routes: bank.routes,
  });
  return `target-quiz-v1-${createHash("sha256").update(content).digest("hex")}`;
}

// Reject an incomplete/corrupt bank instead of silently changing saved progress.
export function validateTargetQuizBank(bank) {
  requireValid(bank?.schemaVersion === 1, "unsupported schema");
  requireValid(bank.questionCount === TARGET_QUIZ_QUESTION_COUNT, "question count");
  requireValid(bank.routeCount === TARGET_QUIZ_ROUTE_COUNT, "route count");
  requireValid(Array.isArray(bank.questions) && bank.questions.length === bank.questionCount, "questions");
  requireValid(Array.isArray(bank.routes) && bank.routes.length === bank.routeCount, "routes");
  requireValid(bank.metadata?.boundaryGap === TARGET_QUIZ_BOUNDARY_GAP, "boundary gap");
  requireValid(Array.isArray(bank.metadata?.credits) && bank.metadata.credits.length > 0, "credits");
  const ids = new Set();
  const answers = new Set();
  const definitions = new Set();
  for (const question of bank.questions) {
    requireValid(typeof question?.id === "string" && /^q\d{5}$/.test(question.id), "opaque question id");
    requireValid(!ids.has(question.id), `duplicate id ${question.id}`);
    ids.add(question.id);
    requireValid(typeof question.definition === "string" && question.definition.trim().length > 0, `definition ${question.id}`);
    const definitionKey = normalizedWord(question.definition);
    requireValid(!definitions.has(definitionKey), `duplicate definition ${question.id}`);
    definitions.add(definitionKey);
    const hasWiktionarySource = question.source?.kind === "wiktionary"
      && typeof question.source.url === "string" && question.source.url.startsWith("https://fr.wiktionary.org/wiki/");
    const hasLocalSource = question.source?.kind === "local" && question.source.url === ""
      && question.source.license === "Définition locale rédigée pour les mots jouables absents du Wiktionary français.";
    requireValid(hasWiktionarySource || hasLocalSource, `source ${question.id}`);
    requireValid(typeof question.source?.license === "string" && question.source.license.length > 0, `license ${question.id}`);
    requireValid(Array.isArray(question.answerIndices) && question.answerIndices.length === 2, `answers ${question.id}`);
    for (const [modeIndex, mode] of MODES.entries()) {
      const choices = question[mode];
      const answerIndex = question.answerIndices[modeIndex];
      requireValid(Array.isArray(choices) && choices.length === 4, `choices ${question.id}/${mode}`);
      requireValid(choices.every((choice) => typeof choice === "string" && /^[\p{L}]+$/u.test(choice)), `choice text ${question.id}/${mode}`);
      requireValid(new Set(choices.map(normalizedWord)).size === 4, `duplicate choices ${question.id}/${mode}`);
      requireValid(Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < 4, `answer index ${question.id}/${mode}`);
    }
    requireValid(question.words[question.answerIndices[0]] === question.spellings[question.answerIndices[1]], `mode answers differ ${question.id}`);
    const answerKey = normalizedWord(question.words[question.answerIndices[0]]);
    requireValid(!answers.has(answerKey), `duplicate answer ${question.id}`);
    answers.add(answerKey);
  }
  for (const [routeIndex, route] of bank.routes.entries()) {
    requireValid(Array.isArray(route?.questionIndices) && route.questionIndices.length === bank.questionCount, `route ${routeIndex} length`);
    requireValid(route.questionIndices.every((index) => Number.isInteger(index) && index >= 0 && index < bank.questionCount), `route ${routeIndex} indices`);
    requireValid(new Set(route.questionIndices).size === bank.questionCount, `route ${routeIndex} duplicates`);
    requireValid(typeof route.modes === "string" && route.modes.length === bank.questionCount && /^[ws]+$/.test(route.modes), `route ${routeIndex} modes`);
    const previousRoute = bank.routes[(routeIndex + bank.routeCount - 1) % bank.routeCount];
    const previousTail = new Set(previousRoute.questionIndices.slice(-TARGET_QUIZ_BOUNDARY_GAP));
    requireValid(route.questionIndices.slice(0, TARGET_QUIZ_BOUNDARY_GAP).every((index) => !previousTail.has(index)), `route ${routeIndex} boundary repetition`);
  }
  requireValid(bank.version === targetQuizBankVersion(bank), "content version mismatch");
  return bank;
}

function compileCatalog(bank) {
  validateTargetQuizBank(bank);
  const { version, questionCount, routeCount } = bank;
  // Keep only gameplay data in the runtime object. Provenance stays in the file.
  const questions = bank.questions.map((question) => ({
    id: question.id,
    definition: question.definition,
    words: Object.freeze([...question.words]),
    spellings: Object.freeze([...question.spellings]),
    answerIndices: [...question.answerIndices],
  }));
  const routes = bank.routes.map((route) => ({
    questionIndices: [...route.questionIndices],
    modes: route.modes,
  }));

  function validateCursor(cursor) {
    if (!Number.isInteger(cursor?.routeIndex) || cursor.routeIndex < 0 || cursor.routeIndex >= routeCount
      || !Number.isInteger(cursor?.questionIndex) || cursor.questionIndex < 0 || cursor.questionIndex >= questionCount) {
      throw new RangeError("target_quiz_cursor_invalid");
    }
  }

  return Object.freeze({
    version,
    questionCount,
    routeCount,
    getQuestion(cursor) {
      validateCursor(cursor);
      const route = routes[cursor.routeIndex];
      const question = questions[route.questionIndices[cursor.questionIndex]];
      const modeIndex = route.modes[cursor.questionIndex] === "w" ? 0 : 1;
      const mode = MODES[modeIndex];
      return Object.freeze({
        id: question.id,
        definition: question.definition,
        mode,
        choices: question[mode],
        // Private server field: callers must explicitly serialize public fields.
        answerIndex: question.answerIndices[modeIndex],
      });
    },
    advance(cursor) {
      validateCursor(cursor);
      return cursor.questionIndex + 1 < questionCount
        ? { routeIndex: cursor.routeIndex, questionIndex: cursor.questionIndex + 1 }
        : { routeIndex: (cursor.routeIndex + 1) % routeCount, questionIndex: 0 };
    },
  });
}

// One asynchronous read per path, including concurrent startup requests.
// A failed read can be retried after the missing/invalid artifact is corrected.
export function loadTargetQuizCatalog({ bankPath = TARGET_QUIZ_BANK_PATH } = {}) {
  const resolvedPath = path.resolve(bankPath);
  if (!catalogs.has(resolvedPath)) {
    const loading = readFile(resolvedPath, "utf8")
      .then((text) => compileCatalog(JSON.parse(text)))
      .catch((error) => {
        catalogs.delete(resolvedPath);
        throw error;
      });
    catalogs.set(resolvedPath, loading);
  }
  return catalogs.get(resolvedPath);
}
