import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  TARGET_QUIZ_BANK_PATH,
  TARGET_QUIZ_BOUNDARY_GAP,
  TARGET_QUIZ_QUESTION_COUNT,
  TARGET_QUIZ_ROUTE_COUNT,
  targetQuizBankVersion,
  validateTargetQuizBank,
} from "../server/targetMiniGame/targetQuizCatalog.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_INPUT = path.join(ROOT, ".tmp/rare-quiz-samples/candidates.jsonl");
const ROUTE_SEED = "gobble-target-quiz-routes-v1";

function randomFor(label) {
  let state = createHash("sha256").update(`${ROUTE_SEED}:${label}`).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRoutes(questionCount) {
  const routes = Array.from({ length: TARGET_QUIZ_ROUTE_COUNT }, (_, routeIndex) => {
    const randomOrder = randomFor(`order:${routeIndex}`);
    const randomMode = randomFor(`mode:${routeIndex}`);
    const questionIndices = Array.from({ length: questionCount }, (_, index) => index);
    for (let index = questionCount - 1; index > 0; index -= 1) {
      const otherIndex = Math.floor(randomOrder() * (index + 1));
      [questionIndices[index], questionIndices[otherIndex]] = [questionIndices[otherIndex], questionIndices[index]];
    }
    return {
      questionIndices,
      modes: Array.from({ length: questionCount }, () => randomMode() < 0.5 ? "w" : "s").join(""),
    };
  });
  // Only swap with the middle: all route tails remain stable, including 5 -> 1.
  for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
    const route = routes[routeIndex].questionIndices;
    const previous = routes[(routeIndex + routes.length - 1) % routes.length].questionIndices;
    const forbidden = new Set(previous.slice(-TARGET_QUIZ_BOUNDARY_GAP));
    let replacementIndex = TARGET_QUIZ_BOUNDARY_GAP;
    for (let index = 0; index < TARGET_QUIZ_BOUNDARY_GAP; index += 1) {
      if (!forbidden.has(route[index])) continue;
      while (replacementIndex < questionCount - TARGET_QUIZ_BOUNDARY_GAP && forbidden.has(route[replacementIndex])) replacementIndex += 1;
      if (replacementIndex >= questionCount - TARGET_QUIZ_BOUNDARY_GAP) throw new Error("No route boundary replacement available");
      [route[index], route[replacementIndex]] = [route[replacementIndex], route[index]];
      replacementIndex += 1;
    }
  }
  return routes;
}

export function buildTargetQuizBank(candidates) {
  if (!Array.isArray(candidates) || candidates.length !== TARGET_QUIZ_QUESTION_COUNT) {
    throw new Error(`Expected exactly ${TARGET_QUIZ_QUESTION_COUNT} candidates; no filtering or truncation is allowed`);
  }
  const questions = candidates.map((candidate, candidateIndex) => {
    if (typeof candidate.answer !== "string"
      || !Array.isArray(candidate.words) || !Array.isArray(candidate.spellings)
      || candidate.words.filter((word) => word === candidate.answer).length !== 1
      || candidate.spellings.filter((word) => word === candidate.answer).length !== 1) {
      throw new Error(`Invalid candidate answer: ${candidate.id}`);
    }
    return {
      // The source id is the answer itself. Never use it as a gameplay id.
      id: `q${String(candidateIndex + 1).padStart(5, "0")}`,
      definition: candidate.definition,
      words: [...candidate.words],
      spellings: [...candidate.spellings],
      answerIndices: [candidate.words.indexOf(candidate.answer), candidate.spellings.indexOf(candidate.answer)],
      source: { kind: candidate.sourceUrl === "" ? "local" : "wiktionary", url: candidate.sourceUrl, license: candidate.sourceLicense },
    };
  });
  const bank = {
    schemaVersion: 1,
    metadata: {
      generator: "scripts/build-target-quiz-bank.mjs",
      candidateGenerator: "scripts/build-rare-quiz-samples.py",
      candidateSeed: "gobble-rare-qcm-20261006-v1",
      candidateProtocolVersion: 2,
      routeSeed: ROUTE_SEED,
      routeEncoding: "questionIndices are zero-based bank offsets; modes w=words, s=spellings",
      boundaryGap: TARGET_QUIZ_BOUNDARY_GAP,
      credits: [
        {
          name: "Gobble local definitions",
          attribution: "Locally authored entries retain their original provenance in question.source; no Wiktionnaire attribution is inferred for them.",
        },
        {
          name: "Wiktionnaire",
          authors: "Contributeurs du Wiktionnaire",
          url: "https://fr.wiktionary.org/",
          license: "CC BY-SA / GFDL",
          attribution: "Each question retains its article URL and source license; the article history identifies contributors.",
          modifications: "Selection of one complete definition and automatic generation of multiple-choice answers.",
        },
        {
          name: "Lexique 3.83 (frequency filtering)",
          authors: "Boris New et Christophe Pallier",
          url: "https://www.lexique.org/databases/Lexique383/Lexique383.tsv",
          documentation: "https://openlexicon.fr/datasets-info/Lexique383/README-Lexique.html",
          license: "CC BY-SA 4.0",
          sha256: "637ba37a767a66679c48371d673ece50cbf541b49a4e40e598963d4f3fbce52b",
        },
      ],
    },
    questionCount: questions.length,
    routeCount: TARGET_QUIZ_ROUTE_COUNT,
    questions,
    routes: buildRoutes(questions.length),
  };
  bank.version = targetQuizBankVersion(bank);
  validateTargetQuizBank(bank);
  return bank;
}

async function main() {
  let inputPath = DEFAULT_INPUT;
  let outputPath = TARGET_QUIZ_BANK_PATH;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--input" && args[index + 1]) inputPath = path.resolve(args[++index]);
    else if (args[index] === "--output" && args[index + 1]) outputPath = path.resolve(args[++index]);
    else throw new Error(`Unknown or incomplete argument: ${args[index]}`);
  }
  const input = await readFile(inputPath, "utf8");
  const candidates = input.trim().split(/\r?\n/).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`Invalid candidate JSON on line ${index + 1}`, { cause: error }); }
  });
  const bank = buildTargetQuizBank(candidates);
  const serialized = `${JSON.stringify(bank)}\n`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  console.log(JSON.stringify({ outputPath, version: bank.version, questions: bank.questionCount, routes: bank.routeCount, bytes: Buffer.byteLength(serialized) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
