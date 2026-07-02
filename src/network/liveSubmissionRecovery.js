export const LIVE_CONNECTION_INTERRUPTED_MESSAGE =
  "Connexion interrompue. La manche continue sur cet appareil ; tes mots seront synchronisés automatiquement.";

function sameRoundId(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) {
    return false;
  }
  return String(left) === String(right);
}

export function capturePendingSubmissions(statusMap, roundId) {
  if (!(statusMap instanceof Map) || roundId === null || roundId === undefined) {
    return { roundId: roundId ?? null, entries: [] };
  }
  const entries = [];
  for (const [word, meta] of statusMap.entries()) {
    if (!word || meta?.status !== "pending") continue;
    if (meta?.roundId != null && !sameRoundId(meta.roundId, roundId)) continue;
    entries.push({
      word,
      meta: {
        ...(meta || {}),
        path: Array.isArray(meta?.path) ? [...meta.path] : [],
        roundId,
      },
    });
  }
  return { roundId, entries };
}

export function reconcilePendingSubmissions({
  serverWords = [],
  pendingSnapshot = null,
  activeRoundId = null,
} = {}) {
  const normalizedServerWords = Array.from(
    new Set((Array.isArray(serverWords) ? serverWords : []).filter(Boolean))
  );
  const serverWordSet = new Set(normalizedServerWords);
  const snapshotMatchesRound =
    pendingSnapshot &&
    sameRoundId(pendingSnapshot.roundId, activeRoundId);
  const pendingEntries = snapshotMatchesRound
    ? (pendingSnapshot.entries || []).filter((entry) => entry?.word && !serverWordSet.has(entry.word))
    : [];
  const optimisticWords = pendingEntries
    .filter((entry) => entry.meta?.optimisticApplied)
    .map((entry) => entry.word);
  const acceptedWords = Array.from(new Set([...normalizedServerWords, ...optimisticWords]));
  const optimisticScore = pendingEntries.reduce(
    (sum, entry) =>
      entry.meta?.optimisticApplied && Number.isFinite(entry.meta?.optimisticPts)
        ? sum + Number(entry.meta.optimisticPts)
        : sum,
    0
  );

  return {
    serverWords: normalizedServerWords,
    acceptedWords,
    pendingEntries,
    optimisticScore,
  };
}

export function queuePendingSubmissionWords({
  words = [],
  pendingQueue,
  pendingWords,
  statusMap,
} = {}) {
  if (!Array.isArray(pendingQueue) || !(pendingWords instanceof Set) || !(statusMap instanceof Map)) {
    return 0;
  }
  const queued = new Set(pendingQueue);
  let added = 0;
  for (const word of Array.isArray(words) ? words : []) {
    if (!word || statusMap.get(word)?.status !== "pending") continue;
    pendingWords.add(word);
    if (queued.has(word)) continue;
    queued.add(word);
    pendingQueue.push(word);
    added += 1;
  }
  return added;
}

export function takeInFlightSubmissionWords(inFlightBatches, clearTimer = clearTimeout) {
  if (!(inFlightBatches instanceof Map)) return [];
  const words = [];
  for (const entry of inFlightBatches.values()) {
    if (entry?.timeoutId) clearTimer(entry.timeoutId);
    if (Array.isArray(entry?.words)) words.push(...entry.words);
  }
  inFlightBatches.clear();
  return words;
}

export function restorePendingSubmissionState({
  entries = [],
  activeRoundId,
  statusMap,
  pendingWords,
  pendingQueue,
} = {}) {
  if (!(statusMap instanceof Map) || !(pendingWords instanceof Set) || !Array.isArray(pendingQueue)) {
    return [];
  }
  const restored = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const word = entry?.word;
    if (!word) continue;
    const meta = {
      ...(entry.meta || {}),
      status: "pending",
      roundId: activeRoundId,
      path: Array.isArray(entry.meta?.path) ? [...entry.meta.path] : [],
    };
    statusMap.set(word, meta);
    pendingWords.add(word);
    pendingQueue.push(word);
    restored.push({ word, meta });
  }
  return restored;
}
