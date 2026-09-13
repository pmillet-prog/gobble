import { computeScore, normalizeWord, getFakeTwinsCompletionTarget } from "../../components/gameLogic.js";
import { DAILY_SPECIAL_MODE } from "../../components/daily/dailyModes.js";
import { resolveTutorialThreeWords } from "./tutorialThreeWordsResults.js";
import { getTutorialTarget, TUTORIAL_PACKS } from "./tutorialScenarios.js";

const DEFINITIONS = Object.freeze({
  arme: { word: "arme", definition: "Objet ou instrument servant à attaquer ou à se défendre.", definitions: ["Objet ou instrument servant à attaquer ou à se défendre."], source: "Didacticiel", ok: true },
  quad: { word: "quad", definition: "Véhicule motorisé tout-terrain à quatre roues, généralement sans carrosserie fermée.", source: "Didacticiel", ok: true },
  quadrilatere: { word: "quadrilatère", definition: "Polygone qui possède quatre côtés. Le carré, le rectangle et le losange sont des quadrilatères.", source: "Didacticiel", ok: true },
  organisation: { word: "organisation", definition: "Action d’organiser ; manière dont les éléments d’un ensemble sont disposés et coordonnés.", source: "Didacticiel", ok: true },
  extraordinaire: { word: "extraordinaire", definition: "Qui sort de l’ordre habituel ou qui est remarquable par son caractère exceptionnel.", source: "Didacticiel", ok: true },
  zebre: { word: "zèbre", definition: "Mammifère d’Afrique de la famille des équidés, à la robe rayée de noir et de blanc.", source: "Didacticiel", ok: true },
});

export function prepareTutorialRound(chapter, id) {
  const pack = TUTORIAL_PACKS[chapter.board];
  const plan = chapter.special ? { ...chapter.special, isSpecial: true, label: chapter.title } : null;
  const solutions = pack.solutions.map((entry) => ({ ...entry, pts: plan?.fixedWordScore ?? computeScore(entry.word, entry.path, pack.grid, plan) }))
    .filter((entry) => entry.word.length >= (plan?.minWordLength || 2))
    .sort((a, b) => b.pts - a.pts || a.word.localeCompare(b.word, "fr"));
  const target = chapter.id.startsWith("target-") ? getTutorialTarget(chapter, chapter.steps[0]) : null;
  const twinWords = solutions.filter(entry => entry.usedFakeTwins).length;
  return {
    sessionId: `tutorial:${id}:${chapter.id}`, gridId: `tutorial:${chapter.board}`,
    tutorial: true, mode: plan?.type || "classic", label: chapter.title, plan,
    grid: pack.grid, solutions, durationMs: 90_000,
    targetWord: target?.word || "", targetPath: target?.path || [], targetLength: target?.word.length || 0,
    tutorialDefinitions: DEFINITIONS,
    quality: { words: solutions.length, possibleScore: solutions.reduce((sum, entry) => sum + entry.pts, 0), maxPts: solutions[0]?.pts || 0, maxLen: Math.max(...solutions.map((entry) => entry.word.length)),
      ...(plan?.type === "fake_twins" ? { fakeTwinWords: twinWords, fakeTwinCompletionTarget: getFakeTwinsCompletionTarget(twinWords) } : {}) },
  };
}

// Only the other players are scripted. The learner's words, paths and scores
// are read back from the real submission engine.
export function buildTutorialResults(prepared, snapshot, { final = true } = {}) {
  const type = prepared.plan?.type;
  const isThreeWords = type === DAILY_SPECIAL_MODE;
  if (isThreeWords) snapshot = resolveTutorialThreeWords(prepared, snapshot, { final });
  const isTarget = type === "target_long" || type === "target_score";
  const entries = new Map(prepared.solutions.map((entry) => [entry.word, entry]));
  const toWord = (word, learner = false) => {
    const raw = normalizeWord(word);
    const path = (learner && snapshot.paths?.get?.(raw)?.path) || entries.get(raw)?.path || [];
    const pts = learner ? snapshot.wordScores?.get?.(raw) : null;
    return { word: raw, path, pts: pts ?? entries.get(raw)?.pts ?? 0 };
  };
  const shared = entries.has("arme") ? "arme" : prepared.solutions.find((entry) => entry.word.length <= 4)?.word;
  const other = prepared.solutions.filter((entry) => entry.word.length <= 5 && entry.word !== shared).slice(-4).map((entry) => entry.word);
  const player = (nick, words, learner = false) => {
    let details = (words || []).filter(Boolean).map((word) => toWord(word, learner));
    if (isThreeWords && !learner) {
      const starts = new Set();
      details = details.filter(entry => {
        if (starts.has(entry.path[0])) return false;
        starts.add(entry.path[0]); return true;
      }).slice(0, 3);
    }
    return {
      nick, words: details.map((entry) => entry.word),
      wordScores: Object.fromEntries(details.map((entry) => [entry.word, entry.pts])),
      wordMeta: learner ? Object.fromEntries(snapshot.wordMeta || []) : {},
      score: learner ? snapshot.score : details.reduce((sum, entry) => sum + entry.pts, 0),
      isBot: !learner,
      ...(isThreeWords ? {
        specialWordSlots: learner ? snapshot.specialWordSlots : details.map((entry, id) => ({ ...entry, id })),
        specialPlacements: learner ? snapshot.specialPlacements : {},
      } : {}),
    };
  };
  const nick = snapshot.nick || "Toi";
  const peers = ["Lina", "Oscar", "Mila"].filter((name) => normalizeWord(name) !== normalizeWord(nick));
  const players = [
    player(nick, snapshot.accepted, true),
    player(peers[0], isTarget ? [] : [shared, ...other.slice(0, 2)]), player(peers[1], isTarget ? [] : other.slice(2)),
  ].sort((a, b) => b.score - a.score);
  const roundAwarded = {};
  let rank = 1;
  players.forEach((entry, index) => {
    if (index && entry.score !== players[index - 1].score) rank = index + 1;
    const longest = !isTarget && entry.words.some((word) => word.length === prepared.quality.maxLen);
    const best = !isTarget && !["speed", "massive_boggle", DAILY_SPECIAL_MODE].includes(type) && entry.words.some((word) => entry.wordScores[word] === prepared.quality.maxPts);
    const gobbles = Number(longest) + Number(best);
    const foundTarget = isTarget && entry.words.includes(prepared.targetWord);
    const points = isTarget && !foundTarget ? 0 : Math.max(1, 11 - rank);
    entry.gobbles = gobbles;
    entry.rank = rank;
    if (foundTarget) {
      entry.targetFoundMs = Math.max(100, snapshot.elapsedMs || 0);
      entry.targetFoundAt = entry.targetFoundMs;
    }
    roundAwarded[entry.nick] = { points, gobbles, total: points + gobbles };
  });
  return {
    players, roundAwarded,
    ...(isThreeWords && final ? { threeWordReview: { score: snapshot.score, wordReview: snapshot.wordReview } } : {}),
    tournament: { id: `tutorial:${prepared.sessionId}`, round: type === "massive_boggle" ? 3 : type ? 2 : 1, totalRounds: 5 },
    ranking: players.map((entry) => ({ ...entry, roundScore: entry.score, score: roundAwarded[entry.nick].total, points: roundAwarded[entry.nick].total })),
  };
}
