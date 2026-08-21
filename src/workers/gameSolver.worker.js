import {
  filterDictionary,
  normalizeWord,
  solveAll,
} from "../components/gameLogic.js";

let dictionaryPromise = null;

function loadDictionary() {
  if (!dictionaryPromise) {
    dictionaryPromise = fetch("/dico.txt")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`dictionary_http_${response.status}`);
        }
        return response.text();
      })
      .then(
        (text) =>
          new Set(
            text
              .split(/\r?\n/)
              .map((entry) => normalizeWord(entry.trim()))
              .filter(Boolean)
          )
      )
      .catch((error) => {
        dictionaryPromise = null;
        throw error;
      });
  }
  return dictionaryPromise;
}

function serializeSolutions(solved) {
  return Array.from(solved.entries()).map(([word, meta]) => ({
    word,
    pts: Number.isFinite(meta?.pts) ? meta.pts : 0,
    path: Array.isArray(meta?.path) ? meta.path : [],
    usedFakeTwins: !!meta?.usedFakeTwins,
    fakeTwinsCompletionWord: !!meta?.usedFakeTwins,
    fakeTwinsBonusOnly: false,
  }));
}

self.addEventListener("message", async (event) => {
  const message = event?.data || {};
  if (message.type !== "solve" || !message.id) return;
  try {
    const dictionary = await loadDictionary();
    const board = Array.isArray(message.board) ? message.board : [];
    const filtered = filterDictionary(dictionary, board, message.special || null);
    const solved = solveAll(board, filtered, message.special || null);
    self.postMessage({
      id: message.id,
      ok: true,
      solutions: serializeSolutions(solved),
    });
  } catch (error) {
    self.postMessage({
      id: message.id,
      ok: false,
      error: error?.message || String(error || "solver_worker_error"),
    });
  }
});
