import {
  computeScore,
  findBestPathForWord,
  normalizeWord,
  summarizeBonuses,
} from "../gameLogic.js";

export function createResultsWordInspector(
  solutionsRef,
  board,
  specialScoreConfig,
  setAnalysis,
  setHighlightPath,
  setHighlightPlayers,
  finalResults,
  setWordInfoModal,
  guidedResultsStep,
  setGuidedResultsStep,
  guidedResultsSteps
) {
  function analyzeWord(word) {
    if (!word) return;
    const normWord = normalizeWord(word);
    const solvedEntry = solutionsRef.current.get(normWord) || solutionsRef.current.get(word);
    const path =
      (Array.isArray(solvedEntry?.path) && solvedEntry.path.length > 0
        ? solvedEntry.path
        : Array.isArray(solvedEntry) && solvedEntry.length > 0
        ? solvedEntry
        : findBestPathForWord(board, normWord, specialScoreConfig)) || null;
    if (!path || path.length === 0) {
      setAnalysis(null);
      setHighlightPath([]);
      setHighlightPlayers([]);
      return;
    }
    const bonuses = summarizeBonuses(path, board);
    const pts = computeScore(normWord, path, board, specialScoreConfig);
    const matchedPlayers = finalResults
      .filter(
        (result) =>
          Array.isArray(result.words) &&
          result.words.some((candidate) => normalizeWord(candidate) === normWord)
      )
      .map((result) => result.nick);
    setAnalysis({ word, pts, bonuses });
    setHighlightPath(path);
    setHighlightPlayers(matchedPlayers);
  }

  function clearResultsWordAnalysis() {
    setAnalysis(null);
    setHighlightPath([]);
    setHighlightPlayers([]);
  }

  function getWordFinders(word) {
    if (!word || !Array.isArray(finalResults)) return [];
    const norm = normalizeWord(word);
    if (!norm) return [];
    const found = [];
    const seen = new Set();
    finalResults.forEach((result) => {
      const nick = result?.nick ? String(result.nick).trim() : "";
      if (!nick || seen.has(nick)) return;
      const words = Array.isArray(result.words) ? result.words : [];
      const hit = words.some((candidate) => normalizeWord(candidate) === norm);
      if (hit) {
        seen.add(nick);
        found.push(nick);
      }
    });
    return found;
  }

  function openWordInfoModal(word) {
    const clean = String(word || "").trim();
    if (!clean) return;
    const foundBy = getWordFinders(clean);
    setWordInfoModal({ open: true, word: clean, foundBy });
    if (guidedResultsStep === guidedResultsSteps.TAP_WORD) {
      setGuidedResultsStep(guidedResultsSteps.TAP_DEFINITION);
    }
  }

  function closeWordInfoModal() {
    setWordInfoModal((previous) =>
      previous?.open ? { ...previous, open: false } : previous
    );
  }

  return [analyzeWord, clearResultsWordAnalysis, openWordInfoModal, closeWordInfoModal];
}
