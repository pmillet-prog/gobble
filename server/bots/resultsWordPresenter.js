import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeWord } from "../../shared/gameLogic.js";
import { createLepersExclusions } from "./lepersChallenge.js";
import { LEPERS_QUESTION_HISTORY_LIMIT } from "./lepersQuestionHistory.js";
import { getResultsWordIntro, getResultsWordFormText } from "./resultsWordText.js";

export const BAFOUILLE_HISTORY_LIMIT = LEPERS_QUESTION_HISTORY_LIMIT;
const MODES = ["normal", "massive_boggle", "finale"];

export async function loadHumorDictionary() {
  return JSON.parse(await readFile(new URL("../../data/humor/runtime.fr.json", import.meta.url), "utf8"));
}

// Ordinary and special 4x4 grids use the classic sample unless their own
// generator was measured. Rates from distinct generators are never added.
export function getHumorFrequencyMode(round) {
  const type = round?.special?.type;
  return type === "massive_boggle" || type === "finale" ? type : "normal";
}

export function createHumorWordPicker(catalog) {
  assert.equal(catalog?.schemaVersion, 1, "Invalid humor dictionary version");
  const grids = new Map(catalog.modes.map(mode => [mode.key, mode.grids]));
  for (const mode of MODES) assert.ok(Number.isInteger(grids.get(mode)) && grids.get(mode) > 0);
  const entries = new Map();
  for (const entry of catalog.entries) {
    const word = normalizeWord(entry.word);
    assert.match(word, /^[a-z]{3,}$/);
    assert.equal(normalizeWord(entry.label), word);
    assert.ok(entry.definition?.trim());
    assert.ok(!entries.has(word), `Duplicate humor word: ${word}`);
    const hits = {};
    for (const mode of MODES) {
      // A measured zero is valid; a missing measurement is a malformed export.
      assert.ok(Number.isInteger(entry.hits?.[mode]) && entry.hits[mode] >= 0 && entry.hits[mode] <= grids.get(mode));
      hits[mode] = entry.hits[mode];
    }
    const definitionKey = createLepersExclusions([entry]).definitions.values().next().value;
    entries.set(word, { word, label: entry.label, definition: entry.definition, definitionKey, hits });
  }
  for (const form of catalog.forms || []) {
    const word = normalizeWord(form.word), lemma = normalizeWord(form.lemma);
    assert.match(word, /^[a-z]{3,}$/);
    assert.ok(!entries.has(word), `Duplicate humor form: ${word}`);
    const base = entries.get(lemma);
    assert.ok(base && !base.lemma, `Missing humor lemma: ${lemma}`);
    for (const mode of MODES) assert.ok(Number.isInteger(form.hits?.[mode]) && form.hits[mode] >= 0 && form.hits[mode] <= grids.get(mode));
    entries.set(word, { ...base, word, lemma, formLabel: form.formLabel || "forme de", hits: form.hits });
  }

  return function pick(round, recentQuestions = []) {
    const excluded = createLepersExclusions(recentQuestions);
    const mode = getHumorFrequencyMode(round);
    const solutionWords = new Set((Array.isArray(round?.solutions) ? round.solutions : [])
      .map(solution => normalizeWord(typeof solution === "string" ? solution : solution?.word || "")));
    let best = null;
    for (const word of solutionWords) {
      const entry = entries.get(word);
      if (!entry || excluded.words.has(word) || excluded.words.has(entry.lemma)) continue;
      // Use the lemma directly whenever it is playable. A simple extension
      // such as CHATS always contains the full CHAT path, even in a partial list.
      if (entry.lemma && (solutionWords.has(entry.lemma) || word.startsWith(entry.lemma))) continue;
      if (excluded.definitions.has(entry.definitionKey)) continue;
      if (!best || entry.hits[mode] < best.hits[mode] ||
        (entry.hits[mode] === best.hits[mode] && word < best.word)) best = entry;
    }
    if (!best) return null;
    const formText = getResultsWordFormText(best.word.toUpperCase(), best.lemma ? best.label : "", best.formLabel);
    return {
      botKey: "humorist", word: best.word, definition: best.definition,
      ...(best.lemma ? { lemma: best.lemma, formText } : null),
      line: `${getResultsWordIntro(round?.id)} ${formText}${best.label} : ${best.definition}`, highlights: [best.label],
      frequency: { mode, hits: best.hits[mode], grids: grids.get(mode) },
    };
  };
}

// Owned by the main process, like Lecheper's history. Planning a round never
// reserves a definition; only completed results advance the alternation.
export function createResultsWordPresenter({ catalog, filePath,
  onError = error => console.warn(`Bafouille results history: ${error?.message || error}`),
}) {
  const pick = createHumorWordPicker(catalog);
  const plans = new WeakMap(), committed = new WeakMap(), pending = new WeakMap();
  let nextBotKey = "linguist", recentQuestions = [], pendingWrite = Promise.resolve();
  const snapshot = () => ({ nextBotKey, questions: recentQuestions.map(entry => ({ ...entry })) });

  async function load() {
    try {
      const data = JSON.parse(await readFile(filePath, "utf8"));
      assert.equal(data.version, 1);
      assert.ok(["linguist", "humorist"].includes(data.nextBotKey));
      assert.ok(Array.isArray(data.questions));
      nextBotKey = data.nextBotKey;
      recentQuestions = data.questions.map(entry => ({
        word: normalizeWord(entry?.word || ""), definition: String(entry?.definition || "").trim(),
      })).filter(entry => entry.word.length >= 3 && entry.definition).slice(-BAFOUILLE_HISTORY_LIMIT);
    } catch (error) {
      if (error?.code !== "ENOENT") onError(error);
    }
  }

  function persist() {
    const body = JSON.stringify({ version: 1, ...snapshot() });
    pendingWrite = pendingWrite.then(async () => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(`${filePath}.tmp`, body, "utf8");
      await rename(`${filePath}.tmp`, filePath);
    }).catch(onError);
  }

  function planRound(round, { enabled = true, pinotEnabled = true, bafouilleEnabled = true } = {}) {
    if (plans.has(round)) return plans.get(round).botKey;
    const pinot = enabled && pinotEnabled;
    const bafouille = enabled && bafouilleEnabled && !round.training;
    const alternate = pinot && bafouille;
    // Target results belong to Pinot's etymology of the target word. This is
    // also a Pinot turn for alternation, even when Bafouille was due to speak.
    const target = round.special?.type === "target_long" || round.special?.type === "target_score";
    const botKey = target ? (pinot ? "linguist" : null)
      : alternate ? nextBotKey : pinot ? "linguist" : bafouille ? "humorist" : null;
    plans.set(round, { botKey, alternate, pinot, bafouille: bafouille && !target, target });
    return botKey;
  }

  function takeForRound(round, { preparePinot, isCurrent = () => true } = {}) {
    if (committed.has(round)) return Promise.resolve(committed.get(round));
    if (pending.has(round)) return pending.get(round);
    const plan = plans.get(round);
    if (!plan) return Promise.resolve(null);
    const task = Promise.resolve().then(async () => {
      if (!isCurrent()) return null;
      const pickPinot = async () => {
        if (!plan.pinot) return null;
        const intervention = await preparePinot();
        return intervention?.line ? { ...intervention, botKey: "linguist" } : null;
      };
      let result = null;
      if (plan.botKey === "humorist") {
        result = pick(round, recentQuestions) || await pickPinot();
      } else if (plan.botKey === "linguist") {
        result = await pickPinot();
        if (!result && isCurrent() && plan.bafouille) result = pick(round, recentQuestions);
      }
      // A round replaced while Pinot's offline lookup was pending must not
      // consume an appearance or a humorous definition for the next round.
      if (!isCurrent()) return null;
      if (result?.botKey === "humorist") {
        recentQuestions.push({ word: result.lemma || result.word, definition: result.definition });
        recentQuestions = recentQuestions.slice(-BAFOUILLE_HISTORY_LIMIT);
      }
      // Alternate based on the presenter who actually has a text. If neither
      // has one, retain the turn; target rounds still give Bafouille the next turn.
      const advance = plan.alternate && (result || plan.target);
      if (advance) nextBotKey = result?.botKey === "humorist" ? "linguist" : "humorist";
      committed.set(round, result);
      if (advance || result?.botKey === "humorist") persist();
      return result;
    });
    pending.set(round, task);
    return task;
  }

  return Object.freeze({ load, planRound, takeForRound, snapshot, flush: () => pendingWrite });
}
